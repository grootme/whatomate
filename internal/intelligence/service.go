package intelligence

import (
        "context"
        "crypto/sha256"
        "fmt"
        "net/http"
        "sort"
        "sync"
        "time"

        "github.com/google/uuid"
        "github.com/redis/go-redis/v9"
        "github.com/zerodha/logf"
        "gorm.io/gorm"
)

// IntelligenceService is the main facade that ties all intelligence components together
type IntelligenceService struct {
        eventStore    *EventStore
        analysis      *AnalysisEngine
        correlation   *CorrelationEngine
        correlationV2 *CorrelationEngineV2
        strategies    *StrategyRegistry
        monitoring    *MonitoringEngine
        reports       *ReportGenerator
        osintClient   *OSINTClient

        // New components
        osintConsumer           *OSINTStreamConsumer
        telegramOSINTCorrelator *TelegramOSINTCorrelator
        threatComputer          *ThreatLevelComputer
        reportScheduler         *ReportScheduler
        osintCache              *OSINTCache
        alertNotifier           *AlertNotifier
        healthAggregator        *HealthCheckAggregator

        db         *gorm.DB
        redis      *redis.Client
        log        logf.Logger
        httpClient *http.Client

        startedAt time.Time

        // Scheduler state
        schedulerRunning bool
        schedulerCancel  context.CancelFunc
        schedulerStatus  SchedulerStatus
        mu               sync.RWMutex
}

// NewIntelligenceService creates and initializes the complete intelligence service
func NewIntelligenceService(db *gorm.DB, rdb *redis.Client, httpClient *http.Client, log logf.Logger, osintBaseURL string) *IntelligenceService {
        // Initialize event store (dual-write: Redis Streams + PostgreSQL)
        eventStore := NewEventStore(db, rdb, log)

        // Initialize analysis engine (DNA Layer 2)
        analysisEngine := NewAnalysisEngine(eventStore, log)

        // Initialize correlation engine (DNA Layer 2)
        correlationEngine := NewCorrelationEngine(eventStore, log)

        // Initialize correlation engine V2 (DNA Layer 2 - enhanced)
        correlationEngineV2 := NewCorrelationEngineV2(eventStore, log)

        // Initialize strategy registry (DNA Layer 3)
        strategyRegistry := NewStrategyRegistry(log)

        // Register all 6 strategies
        thresholdStrategy := NewThresholdStrategy(eventStore, log)
        strategyRegistry.Register(thresholdStrategy)
        strategyRegistry.Register(NewPatternStrategy(eventStore, log))
        strategyRegistry.Register(NewRiskScoringStrategy(eventStore, log))
        strategyRegistry.Register(NewConsensusStrategy(eventStore, log))
        strategyRegistry.Register(NewPredictiveStrategy(eventStore, log))
        strategyRegistry.Register(NewAdaptiveStrategy(eventStore, thresholdStrategy, log))

        // Initialize monitoring engine (DNA Layer 3)
        monitoringEngine := NewMonitoringEngine(eventStore, rdb, log)

        // Initialize report generator (DNA Layer 4)
        reportGenerator := NewReportGenerator(eventStore, log)

        // Initialize OSINT client with shared HTTP client
        osintClient := NewOSINTClient(httpClient, osintBaseURL, log)

        service := &IntelligenceService{
                eventStore:    eventStore,
                analysis:      analysisEngine,
                correlation:   correlationEngine,
                correlationV2: correlationEngineV2,
                strategies:    strategyRegistry,
                monitoring:    monitoringEngine,
                reports:       reportGenerator,
                osintClient:   osintClient,
                db:          db,
                redis:       rdb,
                log:         log,
                httpClient:  httpClient,
                startedAt:   time.Now(),
        }

        // Initialize new components
        service.osintConsumer = NewOSINTStreamConsumer(eventStore, rdb, osintClient, log)
        service.telegramOSINTCorrelator = NewTelegramOSINTCorrelator(eventStore, analysisEngine, log)
        service.threatComputer = NewThreatLevelComputer(eventStore, log)
        service.reportScheduler = NewReportScheduler(service, log)
        service.osintCache = NewOSINTCache(rdb, log, 5*time.Minute)
        service.alertNotifier = NewAlertNotifier(rdb, log)
        service.healthAggregator = NewHealthCheckAggregator(service, log)

        return service
}

// SetHTTPClient sets the HTTP client for the OSINT service client
func (is *IntelligenceService) SetHTTPClient(client *http.Client) {
        is.httpClient = client
}

// ======================================================================
// DNA Layer 1: Ingestion
// ======================================================================

// IngestMessage ingests a raw message into the intelligence pipeline
func (is *IntelligenceService) IngestMessage(ctx context.Context, msg RawMessage) error {
        if msg.ID == "" {
                msg.ID = uuid.New().String()
        }
        if msg.Timestamp.IsZero() {
                msg.Timestamp = time.Now()
        }
        if msg.ContentHash == "" {
                msg.ContentHash = fmt.Sprintf("%x", sha256.Sum256([]byte(msg.Content)))[:16]
        }

        // Determine the correct stream based on source
        var stream string
        switch msg.Source {
        case "whatsapp":
                stream = StreamWhatsAppMessages
        case "telegram":
                stream = StreamTelegramMessages
        case "osint":
                stream = StreamOSINTEvents
        default:
                stream = StreamIntelEvents
        }

        // Store ingestion event
        err := is.eventStore.Append(ctx, stream, IntelligenceEvent{
                EventType:     EventTypeMessageIngested,
                AggregateID:   msg.ID,
                AggregateType: "message",
                Payload: map[string]interface{}{
                        "id":          msg.ID,
                        "source":      msg.Source,
                        "sourceId":    msg.SourceID,
                        "channelName": msg.ChannelName,
                        "channelId":   msg.ChannelID,
                        "senderName":  msg.SenderName,
                        "content":     msg.Content,
                        "contentHash": msg.ContentHash,
                        "timestamp":   msg.Timestamp.Format(time.RFC3339),
                },
                Metadata:  msg.Metadata,
                Timestamp: time.Now(),
        })
        if err != nil {
                return fmt.Errorf("failed to ingest message: %w", err)
        }

        // Update agent state
        is.monitoring.UpdateAgentState("agent-ingest-"+msg.Source, AgentState{
                AgentID:           "agent-ingest-" + msg.Source,
                Name:              msg.Source + " Ingester",
                Layer:             1,
                LayerName:         "Ingestion",
                Status:            "active",
                Health:            100,
                MessagesProcessed: 1,
        })

        is.log.Info("Message ingested", "id", msg.ID, "source", msg.Source, "channel", msg.ChannelName)
        return nil
}

// ======================================================================
// DNA Layer 2: Analysis
// ======================================================================

// AnalyzeMessage analyzes a single message (DNA Layer 2)
func (is *IntelligenceService) AnalyzeMessage(ctx context.Context, msgID string) (*AnalysisResult, error) {
        // Load the message from events
        events, err := is.eventStore.Load(ctx, msgID)
        if err != nil {
                return nil, fmt.Errorf("failed to load message %s: %w", msgID, err)
        }

        // Reconstruct the message from events
        var msg RawMessage
        for _, event := range events {
                if event.EventType == EventTypeMessageIngested {
                        msg = RawMessage{
                                ID:          fmt.Sprintf("%v", event.Payload["id"]),
                                Source:      fmt.Sprintf("%v", event.Payload["source"]),
                                SourceID:    fmt.Sprintf("%v", event.Payload["sourceId"]),
                                ChannelName: fmt.Sprintf("%v", event.Payload["channelName"]),
                                ChannelID:   fmt.Sprintf("%v", event.Payload["channelId"]),
                                SenderName:  fmt.Sprintf("%v", event.Payload["senderName"]),
                                ContentHash: fmt.Sprintf("%v", event.Payload["contentHash"]),
                                Timestamp:   event.Timestamp,
                        }
                        break
                }
        }

        // For now, we need the content which may be in metadata or payload
        // In a full implementation, content would be stored in a dedicated messages table
        if msg.Content == "" {
                // Try to get content from payload first (where IngestMessage stores it)
                for _, event := range events {
                        if event.Payload != nil {
                                if content, ok := event.Payload["content"]; ok {
                                        msg.Content = fmt.Sprintf("%v", content)
                                        break
                                }
                        }
                }
                // Fallback: try metadata
                if msg.Content == "" {
                        for _, event := range events {
                                if event.Metadata != nil {
                                        if content, ok := event.Metadata["content"]; ok {
                                                msg.Content = fmt.Sprintf("%v", content)
                                                break
                                        }
                                }
                        }
                }
        }

        // Update agent state
        is.monitoring.UpdateAgentState("agent-analyzer", AgentState{
                AgentID:           "agent-analyzer",
                Name:              "Message Analyzer",
                Layer:             2,
                LayerName:         "Analysis",
                Status:            "active",
                Health:            100,
                MessagesProcessed: 1,
        })

        return is.analysis.AnalyzeMessage(ctx, msg)
}

// RunAnalysis runs the full analysis pipeline on unprocessed messages
func (is *IntelligenceService) RunAnalysis(ctx context.Context) ([]AnalysisResult, error) {
        var results []AnalysisResult

        // Get unprocessed messages from all ingestion streams
        streams := []string{StreamWhatsAppMessages, StreamTelegramMessages, StreamOSINTEvents}
        var allMessages []RawMessage

        for _, stream := range streams {
                events, err := is.eventStore.GetUnprocessedEvents(ctx, stream, 100)
                if err != nil {
                        is.log.Warn("Failed to get unprocessed events", "stream", stream, "error", err)
                        continue
                }

                for _, event := range events {
                        msg := RawMessage{
                                ID:          fmt.Sprintf("%v", event.Payload["id"]),
                                Source:      fmt.Sprintf("%v", event.Payload["source"]),
                                ChannelName: fmt.Sprintf("%v", event.Payload["channelName"]),
                                SenderName:  fmt.Sprintf("%v", event.Payload["senderName"]),
                                Timestamp:   event.Timestamp,
                        }
                        if content, ok := event.Payload["content"]; ok {
                                msg.Content = fmt.Sprintf("%v", content)
                        }
                        allMessages = append(allMessages, msg)

                        // Mark as processed
                        _ = is.eventStore.MarkProcessed(ctx, event.ID)
                }
        }

        // Analyze each message
        for _, msg := range allMessages {
                result, err := is.analysis.AnalyzeMessage(ctx, msg)
                if err != nil {
                        is.log.Error("Failed to analyze message", "id", msg.ID, "error", err)
                        continue
                }
                results = append(results, *result)
        }

        // Run pattern detection on batch
        if len(allMessages) > 0 {
                patterns := is.analysis.DetectPatterns(ctx, allMessages)
                is.log.Info("Pattern detection completed", "patterns", len(patterns))

                // Run correlation on extracted entities
                entities := is.analysis.GetEntities()
                if len(entities) > 0 {
                        correlations := is.correlation.CorrelateEntities(ctx, entities)
                        is.log.Info("Entity correlation completed", "correlations", len(correlations))

                        comentions := is.correlation.FindComentions(ctx, entities, allMessages)
                        is.log.Info("Co-mention analysis completed", "comentions", len(comentions))

                        // Run V2 multi-method correlation for enhanced results
                        enhancedCorrelations := is.correlationV2.Correlate(ctx, entities, allMessages)
                        is.log.Info("V2 multi-method correlation completed", "enhancedCorrelations", len(enhancedCorrelations))
                }

                // Update agent states
                is.monitoring.UpdateAgentState("agent-correlator", AgentState{
                        AgentID:           "agent-correlator",
                        Name:              "Entity Correlator",
                        Layer:             2,
                        LayerName:         "Analysis",
                        Status:            "active",
                        Health:            100,
                        MessagesProcessed: len(allMessages),
                })
                is.monitoring.UpdateAgentState("agent-pattern", AgentState{
                        AgentID:           "agent-pattern",
                        Name:              "Pattern Detector",
                        Layer:             2,
                        LayerName:         "Analysis",
                        Status:            "active",
                        Health:            100,
                        MessagesProcessed: len(allMessages),
                })
        }

        return results, nil
}

// ======================================================================
// DNA Layer 3: Strategy Evaluation
// ======================================================================

// EvaluateStrategies runs all strategies against the current intelligence context
func (is *IntelligenceService) EvaluateStrategies(ctx context.Context) ([]*StrategyResult, []Alert, error) {
        // Build strategy context
        entities := is.analysis.GetEntities()
        patterns := is.analysis.GetPatterns()

        // Get thresholds from the threshold strategy
        var thresholds []ThresholdConfig
        if ts, ok := is.strategies.Get("threshold"); ok {
                if tss, ok := ts.(*ThresholdStrategy); ok {
                        thresholds = tss.GetThresholds()
                }
        }

        // Try to get OSINT data
        osintData := is.osintClient.GetLastSnapshot()

        // Get recent messages for context
        messages, _ := is.eventStore.GetRecent(ctx, StreamWhatsAppMessages, 50)
        var rawMessages []RawMessage
        for _, event := range messages {
                msg := RawMessage{
                        ID:         fmt.Sprintf("%v", event.Payload["id"]),
                        Source:     fmt.Sprintf("%v", event.Payload["source"]),
                        SenderName: fmt.Sprintf("%v", event.Payload["senderName"]),
                        Timestamp:  event.Timestamp,
                }
                if content, ok := event.Payload["content"]; ok {
                        msg.Content = fmt.Sprintf("%v", content)
                }
                rawMessages = append(rawMessages, msg)
        }

        strategyCtx := StrategyContext{
                Messages:   rawMessages,
                Entities:   entities,
                Patterns:   patterns,
                Thresholds: thresholds,
                OSINTData:  osintData,
        }

        // Process alert workflow
        alerts := is.monitoring.ProcessAlertWorkflow(ctx, strategyCtx, is.strategies)

        // Get strategy results
        results := is.strategies.EvaluateAll(strategyCtx)

        // Update monitoring agents
        is.monitoring.UpdateAgentState("agent-threshold", AgentState{
                AgentID:           "agent-threshold",
                Name:              "Threshold Monitor",
                Layer:             3,
                LayerName:         "Monitoring",
                Status:            "active",
                Health:            100,
                MessagesProcessed: len(results),
        })
        is.monitoring.UpdateAgentState("agent-risk", AgentState{
                AgentID:           "agent-risk",
                Name:              "Risk Scorer",
                Layer:             3,
                LayerName:         "Monitoring",
                Status:            "active",
                Health:            100,
                MessagesProcessed: len(entities),
        })
        is.monitoring.UpdateAgentState("agent-consensus", AgentState{
                AgentID:           "agent-consensus",
                Name:              "Consensus Voter",
                Layer:             3,
                LayerName:         "Monitoring",
                Status:            "active",
                Health:            100,
                MessagesProcessed: 1,
        })
        is.monitoring.UpdateAgentState("agent-predictive", AgentState{
                AgentID:           "agent-predictive",
                Name:              "Predictive Analyzer",
                Layer:             3,
                LayerName:         "Monitoring",
                Status:            "active",
                Health:            100,
                MessagesProcessed: 1,
        })
        is.monitoring.UpdateAgentState("agent-adaptive", AgentState{
                AgentID:           "agent-adaptive",
                Name:              "Adaptive Learner",
                Layer:             3,
                LayerName:         "Monitoring",
                Status:            "active",
                Health:            100,
                MessagesProcessed: 1,
        })

        return results, alerts, nil
}

// ======================================================================
// DNA Layer 4: Reports
// ======================================================================

// GenerateReport generates a report of the specified type
func (is *IntelligenceService) GenerateReport(ctx context.Context, reportType string) (*Report, error) {
        switch reportType {
        case "threat_summary":
                osintData := is.osintClient.GetLastSnapshot()
                if osintData == nil {
                        osintData = &OSINTSnapshot{}
                }
                return is.reports.GenerateThreatSummary(ctx, *osintData)

        case "risk_analysis":
                entities := is.analysis.GetEntities()
                return is.reports.GenerateRiskReport(ctx, entities, nil)

        case "pattern_report":
                patterns := is.analysis.GetPatterns()
                return is.reports.GeneratePatternReport(ctx, patterns)

        case "full_intelligence":
                dashboard := is.GetDashboardData(ctx)
                osintData := is.osintClient.GetLastSnapshot()
                return is.reports.GenerateFullReport(ctx, &dashboard, osintData)

        default:
                return nil, fmt.Errorf("unknown report type: %s", reportType)
        }
}

// ======================================================================
// Dashboard & Aggregation
// ======================================================================

// GetDashboardData returns aggregated data for the frontend dashboard
func (is *IntelligenceService) GetDashboardData(ctx context.Context) DashboardData {
        entities := is.analysis.GetEntities()
        patterns := is.analysis.GetPatterns()
        agents := is.monitoring.CheckAgentHealth()
        alerts := is.monitoring.GetAlerts(ctx, 20)

        // Calculate threat score
        threatScore := is.calculateThreatScore(entities, patterns, alerts)
        threatLevel := "LOW"
        switch {
        case threatScore >= 80:
                threatLevel = "CRÍTICA"
        case threatScore >= 60:
                threatLevel = "ALTA"
        case threatScore >= 40:
                threatLevel = "MEDIA"
        case threatScore >= 20:
                threatLevel = "BAJA"
        }

        // Count entity risk levels
        highRiskEntities := 0
        for _, e := range entities {
                if e.RiskLevel == "high" || e.RiskLevel == "critical" {
                        highRiskEntities++
                }
        }

        // Count active patterns
        activePatterns := 0
        for _, p := range patterns {
                if p.Status == "active" {
                        activePatterns++
                }
        }

        // Count alerts
        activeAlerts := 0
        criticalAlerts := 0
        var activeAlertsList []Alert
        for _, a := range alerts {
                if !a.Acknowledged {
                        activeAlerts++
                        if a.Severity == "CRÍTICA" {
                                criticalAlerts++
                        }
                        activeAlertsList = append(activeAlertsList, a)
                }
        }

        // Sort entities by risk score for top entities
        sortedEntities := make([]Entity, len(entities))
        copy(sortedEntities, entities)
        sort.Slice(sortedEntities, func(i, j int) bool {
                return sortedEntities[i].RiskScore > sortedEntities[j].RiskScore
        })
        topEntities := sortedEntities
        if len(topEntities) > 10 {
                topEntities = topEntities[:10]
        }

        // Get recent events
        recentEvents, _ := is.eventStore.GetRecent(ctx, StreamIntelEvents, 20)

        // Get stream stats
        streamStats := is.eventStore.CountByStream(ctx)

        // Get message counts
        var totalMessages int64
        var processedMessages int64
        is.db.WithContext(ctx).Model(&IntelEvent{}).Where("event_type = ?", EventTypeMessageIngested).Count(&totalMessages)
        is.db.WithContext(ctx).Model(&IntelEvent{}).Where("event_type = ? AND processed = true", EventTypeMessageAnalyzed).Count(&processedMessages)

        return DashboardData{
                ThreatLevel:      threatLevel,
                ThreatScore:      threatScore,
                ActiveAlerts:     activeAlerts,
                CriticalAlerts:   criticalAlerts,
                TotalEntities:    len(entities),
                HighRiskEntities: highRiskEntities,
                ActivePatterns:   activePatterns,
                RecentEvents:     recentEvents,
                AgentStates:      agents,
                TopEntities:      topEntities,
                ActiveAlertsList: activeAlertsList,
                StreamStats:      streamStats,
                LastOSINTFetch:   is.osintClient.GetLastFetchTime(),
                TotalMessages:    totalMessages,
                ProcessedMessages: processedMessages,
        }
}

// GetStreamInfo returns event stream statistics
func (is *IntelligenceService) GetStreamInfo(ctx context.Context) map[string]*StreamInfo {
        return is.eventStore.GetAllStreamInfo(ctx)
}

// ======================================================================
// Scheduler
// ======================================================================

// SchedulerStatus represents the current state of the background scheduler
type SchedulerStatus struct {
        Running      bool       `json:"running"`
        StartedAt    time.Time  `json:"startedAt"`
        LastAnalysis *time.Time `json:"lastAnalysis,omitempty"`
        LastOSINT    *time.Time `json:"lastOSINT,omitempty"`
        NextRun      *time.Time `json:"nextRun,omitempty"`
        CycleCount   int        `json:"cycleCount"`
}

// StartScheduler starts the background task scheduler for periodic tasks
func (is *IntelligenceService) StartScheduler(ctx context.Context) {
        is.mu.Lock()
        if is.schedulerRunning {
                is.mu.Unlock()
                return
        }

        ctx, cancel := context.WithCancel(ctx)
        is.schedulerCancel = cancel
        is.schedulerRunning = true
        is.mu.Unlock()

        is.log.Info("Intelligence scheduler started")

        go func() {
                analysisTicker := time.NewTicker(5 * time.Minute) // Run analysis every 5 minutes
                osintTicker := time.NewTicker(15 * time.Minute)   // Fetch OSINT every 15 minutes
                strategyTicker := time.NewTicker(10 * time.Minute) // Evaluate strategies every 10 minutes
                healthTicker := time.NewTicker(1 * time.Minute)    // Check health every minute

                // Local scheduler status protected by the service mutex
                localStatus := SchedulerStatus{
                        Running:   true,
                        StartedAt: time.Now(),
                }

                defer func() {
                        analysisTicker.Stop()
                        osintTicker.Stop()
                        strategyTicker.Stop()
                        healthTicker.Stop()
                }()

                for {
                        select {
                        case <-ctx.Done():
                                is.mu.Lock()
                                is.schedulerRunning = false
                                localStatus.Running = false
                                is.schedulerStatus = localStatus
                                is.mu.Unlock()
                                is.log.Info("Intelligence scheduler stopped")
                                return

                        case <-analysisTicker.C:
                                is.log.Debug("Scheduler: running analysis pipeline")
                                _, err := is.RunAnalysis(ctx)
                                if err != nil {
                                        is.log.Error("Scheduler: analysis failed", "error", err)
                                }
                                now := time.Now()
                                localStatus.LastAnalysis = &now
                                localStatus.CycleCount++
                                is.mu.Lock()
                                is.schedulerStatus = localStatus
                                is.mu.Unlock()

                        case <-osintTicker.C:
                                is.log.Debug("Scheduler: fetching OSINT data")
                                _, err := is.osintClient.FetchOSINTData(ctx)
                                if err != nil {
                                        is.log.Error("Scheduler: OSINT fetch failed", "error", err)
                                }
                                now := time.Now()
                                localStatus.LastOSINT = &now
                                is.mu.Lock()
                                is.schedulerStatus = localStatus
                                is.mu.Unlock()

                                // Update agent state
                                is.monitoring.UpdateAgentState("agent-ingest-osint", AgentState{
                                        AgentID:           "agent-ingest-osint",
                                        Name:              "OSINT Ingester",
                                        Layer:             1,
                                        LayerName:         "Ingestion",
                                        Status:            "active",
                                        Health:            100,
                                        MessagesProcessed: 1,
                                })

                        case <-strategyTicker.C:
                                is.log.Debug("Scheduler: evaluating strategies")
                                _, _, err := is.EvaluateStrategies(ctx)
                                if err != nil {
                                        is.log.Error("Scheduler: strategy evaluation failed", "error", err)
                                }
                                is.mu.Lock()
                                is.schedulerStatus = localStatus
                                is.mu.Unlock()

                        case <-healthTicker.C:
                                is.monitoring.CheckAgentHealth()
                        }
                }
        }()
}

// StopScheduler stops the background scheduler
func (is *IntelligenceService) StopScheduler() {
        is.mu.Lock()
        defer is.mu.Unlock()

        if is.schedulerCancel != nil {
                is.schedulerCancel()
        }
        is.schedulerRunning = false
        is.schedulerStatus.Running = false
}

// GetSchedulerStatus returns the current scheduler status
func (is *IntelligenceService) GetSchedulerStatus() SchedulerStatus {
        is.mu.RLock()
        defer is.mu.RUnlock()
        return is.schedulerStatus
}

// ======================================================================
// Health Check
// ======================================================================

// GetHealthStatus returns the health of the intelligence service
func (is *IntelligenceService) GetHealthStatus(ctx context.Context) HealthStatus {
        status := HealthStatus{
                Status:  "healthy",
                Agents:  make(map[string]string),
                Uptime:  time.Since(is.startedAt).String(),
                Version: "1.0.0",
        }

        // Check Redis
        if is.redis != nil {
                err := is.redis.Ping(ctx).Err()
                status.Redis = err == nil
                if err != nil {
                        status.Status = "degraded"
                }
        }

        // Check PostgreSQL
        sqlDB, err := is.db.DB()
        if err == nil {
                pingErr := sqlDB.Ping()
                status.Postgres = pingErr == nil
                if pingErr != nil {
                        status.Status = "unhealthy"
                }
        } else {
                status.Postgres = false
                status.Status = "unhealthy"
        }

        // Check OSINT service
        status.OSINTService = is.osintClient.IsAvailable(ctx)
        if !status.OSINTService && status.Status == "healthy" {
                status.Status = "degraded"
        }

        // Check agent health
        for _, agent := range is.monitoring.GetAgentStates() {
                status.Agents[agent.AgentID] = agent.Status
                if agent.Status == "error" {
                        if status.Status == "healthy" {
                                status.Status = "degraded"
                        }
                }
        }

        return status
}

// GetAggregatedHealth returns a comprehensive health check across all subsystems
func (is *IntelligenceService) GetAggregatedHealth(ctx context.Context) AggregatedHealth {
        health := AggregatedHealth{
                Timestamp: time.Now(),
                Version:   "1.0.0",
                Uptime:    time.Since(is.startedAt).String(),
                Components: make(map[string]ComponentHealth),
                Status:    "healthy",
        }

        // Check Redis
        redisStart := time.Now()
        if is.redis != nil {
                err := is.redis.Ping(ctx).Err()
                latency := time.Since(redisStart).Milliseconds()
                if err != nil {
                        health.Components["redis"] = ComponentHealth{Status: "unhealthy", LatencyMs: latency, Message: err.Error()}
                        health.Status = "degraded"
                } else {
                        health.Components["redis"] = ComponentHealth{Status: "healthy", LatencyMs: latency}
                }
        } else {
                health.Components["redis"] = ComponentHealth{Status: "unavailable", Message: "Redis client not configured"}
                health.Status = "degraded"
        }

        // Check PostgreSQL
        pgStart := time.Now()
        sqlDB, err := is.db.DB()
        if err != nil {
                health.Components["postgres"] = ComponentHealth{Status: "unhealthy", Message: err.Error()}
                health.Status = "unhealthy"
        } else {
                pingErr := sqlDB.Ping()
                latency := time.Since(pgStart).Milliseconds()
                if pingErr != nil {
                        health.Components["postgres"] = ComponentHealth{Status: "unhealthy", LatencyMs: latency, Message: pingErr.Error()}
                        health.Status = "unhealthy"
                } else {
                        health.Components["postgres"] = ComponentHealth{Status: "healthy", LatencyMs: latency}
                }
        }

        // Check OSINT service
        osintStart := time.Now()
        osintAvailable := is.osintClient.IsAvailable(ctx)
        osintLatency := time.Since(osintStart).Milliseconds()
        if osintAvailable {
                health.Components["osint"] = ComponentHealth{Status: "healthy", LatencyMs: osintLatency}
        } else {
                health.Components["osint"] = ComponentHealth{Status: "degraded", LatencyMs: osintLatency, Message: "OSINT service unreachable"}
                if health.Status == "healthy" {
                        health.Status = "degraded"
                }
        }

        // Check Event Store
        health.Components["eventstore"] = ComponentHealth{Status: "healthy"}

        // Agent health summary
        agents := is.monitoring.GetAgentStates()
        for _, a := range agents {
                health.AgentSummary.Total++
                switch a.Status {
                case "active":
                        health.AgentSummary.Active++
                case "idle":
                        health.AgentSummary.Idle++
                case "error":
                        health.AgentSummary.Error++
                case "offline":
                        health.AgentSummary.Offline++
                }
        }

        if health.AgentSummary.Error > 0 && health.Status == "healthy" {
                health.Status = "degraded"
        }

        return health
}

// ======================================================================
// Utility Methods
// ======================================================================

// calculateThreatScore computes an overall threat score (0-100)
func (is *IntelligenceService) calculateThreatScore(entities []Entity, patterns []PatternDetection, alerts []Alert) int {
        score := 0

        // Entity risk contribution
        for _, e := range entities {
                switch e.RiskLevel {
                case "critical":
                        score += 15
                case "high":
                        score += 8
                case "medium":
                        score += 3
                }
        }

        // Pattern contribution
        for _, p := range patterns {
                if p.Status != "active" {
                        continue
                }
                switch p.Severity {
                case "CRÍTICA":
                        score += 20
                case "ALTA":
                        score += 10
                case "MEDIA":
                        score += 5
                case "BAJA":
                        score += 2
                }
        }

        // Alert contribution
        for _, a := range alerts {
                if a.Acknowledged {
                        continue
                }
                switch a.Severity {
                case "CRÍTICA":
                        score += 15
                case "ALTA":
                        score += 8
                case "MEDIA":
                        score += 3
                }
        }

        // Cap at 100
        if score > 100 {
                score = 100
        }

        return score
}

// GetEntities returns all tracked entities
func (is *IntelligenceService) GetEntities() []Entity {
        return is.analysis.GetEntities()
}

// GetPatterns returns all detected patterns
func (is *IntelligenceService) GetPatterns() []PatternDetection {
        return is.analysis.GetPatterns()
}

// GetAlerts returns recent alerts
func (is *IntelligenceService) GetAlerts(ctx context.Context, limit int) []Alert {
        return is.monitoring.GetAlerts(ctx, limit)
}

// GetAgentStates returns all agent states
func (is *IntelligenceService) GetAgentStates() []AgentState {
        return is.monitoring.GetAgentStates()
}

// GetStrategies returns all registered strategy handlers
func (is *IntelligenceService) GetStrategies() []StrategyHandler {
        return is.strategies.GetAll()
}

// GetStrategySignals returns the current signals from all strategies
func (is *IntelligenceService) GetStrategySignals(ctx context.Context) []*StrategyResult {
        entities := is.analysis.GetEntities()
        patterns := is.analysis.GetPatterns()

        var thresholds []ThresholdConfig
        if ts, ok := is.strategies.Get("threshold"); ok {
                if tss, ok := ts.(*ThresholdStrategy); ok {
                        thresholds = tss.GetThresholds()
                }
        }

        strategyCtx := StrategyContext{
                Entities:   entities,
                Patterns:   patterns,
                Thresholds: thresholds,
                OSINTData:  is.osintClient.GetLastSnapshot(),
        }

        return is.strategies.EvaluateAll(strategyCtx)
}

// GetRecentEvents returns recent events from a stream
func (is *IntelligenceService) GetRecentEvents(ctx context.Context, stream string, count int64) ([]IntelligenceEvent, error) {
        return is.eventStore.GetRecent(ctx, stream, count)
}

// ReplayEvents replays events from a given timestamp
func (is *IntelligenceService) ReplayEvents(ctx context.Context, stream string, from time.Time, count int) ([]IntelligenceEvent, error) {
        return is.eventStore.ReplayEvents(ctx, stream, from, count)
}

// GetPredictions returns predictions from the predictive strategy
func (is *IntelligenceService) GetPredictions(ctx context.Context, limit int) ([]Prediction, error) {
        events, err := is.eventStore.GetRecent(ctx, StreamPredictions, int64(limit))
        if err != nil {
                return nil, err
        }

        var predictions []Prediction
        for _, event := range events {
                pred := Prediction{
                        ID:          event.AggregateID,
                        Metric:      fmt.Sprintf("%v", event.Payload["metric"]),
                        PredictedAt: event.Timestamp,
                        Value:       toFloat(event.Payload["predicted"]),
                        Confidence:  toFloat(event.Payload["confidence"]),
                }
                predictions = append(predictions, pred)
        }

        return predictions, nil
}

// GetReports returns recent reports
func (is *IntelligenceService) GetReports(ctx context.Context, limit int) ([]Report, error) {
        return is.reports.GetRecentReports(ctx, limit)
}

// AcknowledgeAlert acknowledges an alert
func (is *IntelligenceService) AcknowledgeAlert(ctx context.Context, alertID string) error {
        return is.monitoring.AcknowledgeAlert(ctx, alertID)
}

// EscalateAlert escalates an alert
func (is *IntelligenceService) EscalateAlert(ctx context.Context, alertID string) error {
        return is.monitoring.EscalateAlert(ctx, alertID)
}

// RecordAdaptiveFeedback records feedback for the adaptive strategy
func (is *IntelligenceService) RecordAdaptiveFeedback(metric string, isFalsePositive bool) {
        if as, ok := is.strategies.Get("adaptive"); ok {
                if ass, ok := as.(*AdaptiveStrategy); ok {
                        ass.RecordFeedback(metric, isFalsePositive)
                }
        }
}

// FetchOSINTData triggers an OSINT data fetch
func (is *IntelligenceService) FetchOSINTData(ctx context.Context) (*OSINTSnapshot, error) {
        return is.osintClient.FetchOSINTData(ctx)
}

// GetAnomalies returns detected anomalies (derived from patterns and thresholds)
func (is *IntelligenceService) GetAnomalies(ctx context.Context) []map[string]interface{} {
        var anomalies []map[string]interface{}

        // Active patterns are anomalies
        for _, p := range is.analysis.GetPatterns() {
                if p.Status == "active" {
                        anomalies = append(anomalies, map[string]interface{}{
                                "type":        "pattern",
                                "patternType": p.PatternType,
                                "confidence":  p.Confidence,
                                "severity":    p.Severity,
                                "description": p.Description,
                                "occurrences": p.Occurrences,
                                "lastDetected": p.LastDetected,
                        })
                }
        }

        // Breached thresholds are anomalies
        if ts, ok := is.strategies.Get("threshold"); ok {
                if tss, ok := ts.(*ThresholdStrategy); ok {
                        for _, th := range tss.GetThresholds() {
                                if th.CurrentValue >= th.Value && th.Value > 0 {
                                        anomalies = append(anomalies, map[string]interface{}{
                                                "type":         "threshold_breach",
                                                "metric":       th.Metric,
                                                "threshold":    th.Value,
                                                "currentValue": th.CurrentValue,
                                                "severity":     th.AlertSeverity,
                                                "name":         th.Name,
                                        })
                                }
                        }
                }
        }

        return anomalies
}

// ComputeOSINTThreatLevel computes a detailed threat level from real OSINT data
func (is *IntelligenceService) ComputeOSINTThreatLevel(ctx context.Context, data *OSINTSnapshot) *ThreatAssessment {
        return is.threatComputer.ComputeThreatLevel(ctx, data)
}

// CorrelateTelegramWithOSINT correlates Telegram messages with OSINT data
func (is *IntelligenceService) CorrelateTelegramWithOSINT(ctx context.Context, messages []RawMessage, osintData *OSINTSnapshot) []CorrelationMatch {
        return is.telegramOSINTCorrelator.CorrelateBatch(ctx, messages, osintData)
}

// GetOSINTCache returns the OSINT cache for direct access
func (is *IntelligenceService) GetOSINTCache() *OSINTCache {
        return is.osintCache
}

// GetAlertNotifier returns the alert notifier for direct access
func (is *IntelligenceService) GetAlertNotifier() *AlertNotifier {
        return is.alertNotifier
}

// GetHealthAggregator returns the health check aggregator
func (is *IntelligenceService) GetHealthAggregator() *HealthCheckAggregator {
        return is.healthAggregator
}

// GetReportScheduler returns the report scheduler for direct access
func (is *IntelligenceService) GetReportScheduler() *ReportScheduler {
        return is.reportScheduler
}

// StartOSINTConsumer starts the OSINT stream consumer
func (is *IntelligenceService) StartOSINTConsumer(ctx context.Context) error {
        return is.osintConsumer.Start(ctx)
}

// StartBackgroundTasks starts all background tasks including health aggregator,
// real-time threat computer, and metrics collector
func (is *IntelligenceService) StartBackgroundTasks(ctx context.Context) {
        // Start health aggregator (30-second intervals)
        if is.healthAggregator != nil {
                go is.healthAggregator.Start(ctx, 30*time.Second)
                is.log.Info("Health aggregator started")
        }

        // Start real-time threat computer (2-minute intervals)
        realtimeThreat := NewRealtimeThreatComputer(is.eventStore, is.threatComputer, is.alertNotifier, is.osintClient, is.log)
        go realtimeThreat.Start(ctx, 2*time.Minute)
        is.log.Info("Real-time threat computer started")

        // Start metrics collector
        metricsCollector := NewMetricsCollector(is)
        go func() {
                ticker := time.NewTicker(30 * time.Second)
                defer ticker.Stop()
                for {
                        select {
                        case <-ctx.Done():
                                return
                        case <-ticker.C:
                                _ = metricsCollector.Snapshot(ctx)
                        }
                }
        }()
        is.log.Info("Metrics collector started")

        // Apply default report templates
        if is.reportScheduler != nil {
                templates := NewScheduledReportTemplates(is.reportScheduler, is.log)
                if _, err := templates.ApplyAllTemplates(ctx, true); err != nil {
                        is.log.Error("Failed to apply default report templates", "error", err)
                } else {
                        is.log.Info("Default report templates applied")
                }
        }
}

// GetThreatLevel returns the current threat level assessment
func (is *IntelligenceService) GetThreatLevel(ctx context.Context) map[string]interface{} {
        entities := is.analysis.GetEntities()
        patterns := is.analysis.GetPatterns()
        alerts := is.monitoring.GetAlerts(ctx, 100)

        score := is.calculateThreatScore(entities, patterns, alerts)
        level := "LOW"
        switch {
        case score >= 80:
                level = "CRÍTICA"
        case score >= 60:
                level = "ALTA"
        case score >= 40:
                level = "MEDIA"
        case score >= 20:
                level = "BAJA"
        }

        return map[string]interface{}{
                "level":         level,
                "score":         score,
                "activeAlerts":  is.monitoring.GetActiveAlertCount(),
                "criticalAlerts": is.monitoring.GetCriticalAlertCount(),
                "activePatterns": len(func() []PatternDetection {
                        var active []PatternDetection
                        for _, p := range patterns {
                                if p.Status == "active" {
                                        active = append(active, p)
                                }
                        }
                        return active
                }()),
                "highRiskEntities": func() int {
                        count := 0
                        for _, e := range entities {
                                if e.RiskLevel == "high" || e.RiskLevel == "critical" {
                                        count++
                                }
                        }
                        return count
                }(),
                "osintAvailable": is.osintClient.GetLastSnapshot() != nil,
        }
}

// toFloat converts an interface{} to float64
func toFloat(v interface{}) float64 {
        switch val := v.(type) {
        case float64:
                return val
        case float32:
                return float64(val)
        case int:
                return float64(val)
        case int64:
                return float64(val)
        default:
                return 0
        }
}
