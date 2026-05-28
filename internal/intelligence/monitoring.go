package intelligence

import (
        "context"
        "encoding/json"
        "fmt"
        "sort"
        "sync"
        "time"

        "github.com/google/uuid"
        "github.com/redis/go-redis/v9"
        "github.com/zerodha/logf"
)

// MonitoringEngine implements DNA Layer 3: Alert Workflow & Monitoring
type MonitoringEngine struct {
        eventStore *EventStore
        redis      *redis.Client
        log        logf.Logger
        agents     map[string]*AgentState
        alerts     map[string]*Alert
        mu         sync.RWMutex
}

// NewMonitoringEngine creates a new MonitoringEngine
func NewMonitoringEngine(es *EventStore, rdb *redis.Client, log logf.Logger) *MonitoringEngine {
        me := &MonitoringEngine{
                eventStore: es,
                redis:      rdb,
                log:        log,
                agents:     make(map[string]*AgentState),
                alerts:     make(map[string]*Alert),
        }

        // Initialize default agents
        me.initDefaultAgents()

        return me
}

// initDefaultAgents creates the initial set of intelligence agents
func (me *MonitoringEngine) initDefaultAgents() {
        agents := []struct {
                id        string
                name      string
                layer     int
                layerName string
        }{
                {"agent-ingest-wa", "WhatsApp Ingester", 1, "Ingestion"},
                {"agent-ingest-tg", "Telegram Ingester", 1, "Ingestion"},
                {"agent-ingest-osint", "OSINT Ingester", 1, "Ingestion"},
                {"agent-analyzer", "Message Analyzer", 2, "Analysis"},
                {"agent-correlator", "Entity Correlator", 2, "Analysis"},
                {"agent-pattern", "Pattern Detector", 2, "Analysis"},
                {"agent-threshold", "Threshold Monitor", 3, "Monitoring"},
                {"agent-risk", "Risk Scorer", 3, "Monitoring"},
                {"agent-consensus", "Consensus Voter", 3, "Monitoring"},
                {"agent-predictive", "Predictive Analyzer", 3, "Monitoring"},
                {"agent-adaptive", "Adaptive Learner", 3, "Monitoring"},
                {"agent-reporter", "Report Generator", 4, "Reports"},
        }

        now := time.Now()
        for _, a := range agents {
                me.agents[a.id] = &AgentState{
                        AgentID:           a.id,
                        Name:              a.name,
                        Layer:             a.layer,
                        LayerName:         a.layerName,
                        Status:            "idle",
                        Health:            100,
                        MessagesProcessed: 0,
                        LastHeartbeat:     now,
                        StartedAt:         &now,
                }
        }
}

// ProcessAlertWorkflow runs all strategies and generates alerts for actionable results
func (me *MonitoringEngine) ProcessAlertWorkflow(ctx context.Context, strategyCtx StrategyContext, registry *StrategyRegistry) []Alert {
        var alerts []Alert

        // Evaluate all strategies
        results := registry.EvaluateAll(strategyCtx)

        for _, result := range results {
                if result.Action == "monitor" || result.Action == "dismiss" {
                        continue // No alert needed
                }

                alert := me.GenerateAlert(*result)
                alerts = append(alerts, alert)

                // Notify via multiple channels
                me.NotifyAlert(ctx, alert)

                // Store alert event
                _ = me.eventStore.Append(ctx, StreamAlerts, IntelligenceEvent{
                        EventType:     EventTypeAlertGenerated,
                        AggregateID:   alert.ID,
                        AggregateType: "alert",
                        Payload: map[string]interface{}{
                                "alertId":     alert.ID,
                                "source":      alert.Source,
                                "severity":    alert.Severity,
                                "title":       alert.Title,
                                "description": alert.Description,
                                "strategy":    alert.Strategy,
                                "action":      alert.ActionTaken,
                        },
                        Timestamp: time.Now(),
                })
        }

        return alerts
}

// GenerateAlert creates an Alert from a StrategyResult
func (me *MonitoringEngine) GenerateAlert(result StrategyResult) Alert {
        alert := Alert{
                ID:           uuid.New().String(),
                Source:       "intelligence_engine",
                Severity:     result.Severity,
                Title:        me.generateAlertTitle(result),
                Description:  result.Reasoning,
                ActionTaken:  result.Action,
                Strategy:     me.inferStrategyFromResult(result),
                Timestamp:    time.Now(),
                Acknowledged: false,
                Escalated:    result.Action == "escalate",
        }

        me.mu.Lock()
        me.alerts[alert.ID] = &alert
        me.mu.Unlock()

        return alert
}

// NotifyAlert sends alert notifications via Redis pub/sub and stores for retrieval
func (me *MonitoringEngine) NotifyAlert(ctx context.Context, alert Alert) {
        // Publish to Redis channel for real-time notifications
        if me.redis != nil {
                alertJSON, err := json.Marshal(alert)
                if err != nil {
                        me.log.Error("Failed to marshal alert for notification", "error", err)
                        return
                }

                err = me.redis.Publish(ctx, "whatomate:intel_alerts", string(alertJSON)).Err()
                if err != nil {
                        me.log.Error("Failed to publish alert to Redis", "error", err)
                }

                // Also store in a Redis list for recent alerts
                err = me.redis.LPush(ctx, "whatomate:recent_alerts", string(alertJSON)).Err()
                if err != nil {
                        me.log.Error("Failed to store alert in Redis list", "error", err)
                }

                // Keep only last 100 alerts
                me.redis.LTrim(ctx, "whatomate:recent_alerts", 0, 99)
        }

        me.log.Info("Alert generated",
                "alertId", alert.ID,
                "severity", alert.Severity,
                "title", alert.Title,
                "action", alert.ActionTaken,
        )
}

// CheckAgentHealth monitors agent heartbeats and updates their status
func (me *MonitoringEngine) CheckAgentHealth() []AgentState {
        me.mu.Lock()
        defer me.mu.Unlock()

        var states []AgentState
        now := time.Now()

        for id, agent := range me.agents {
                // Check if agent heartbeat is stale (> 2 minutes)
                if now.Sub(agent.LastHeartbeat) > 2*time.Minute {
                        agent.Status = "error"
                        agent.Health = maxInt(0, agent.Health-10)
                }

                states = append(states, *agent)
                _ = id
        }

        return states
}

// UpdateAgentState updates an agent's status
func (me *MonitoringEngine) UpdateAgentState(agentID string, state AgentState) {
        me.mu.Lock()
        defer me.mu.Unlock()

        if existing, ok := me.agents[agentID]; ok {
                existing.Status = state.Status
                existing.Health = state.Health
                existing.MessagesProcessed += state.MessagesProcessed
                existing.LastHeartbeat = time.Now()
        } else {
                state.LastHeartbeat = time.Now()
                me.agents[agentID] = &state
        }

        // Store heartbeat event using context.Background() since this is called
        // from background goroutines that may not have a request context.
        // The event store handles timeouts internally.
        _ = me.eventStore.Append(context.Background(), StreamIntelEvents, IntelligenceEvent{
                EventType:     EventTypeAgentHeartbeat,
                AggregateID:   agentID,
                AggregateType: "agent",
                Payload: map[string]interface{}{
                        "agentId":   agentID,
                        "status":    state.Status,
                        "health":    state.Health,
                        "processed": state.MessagesProcessed,
                },
                Timestamp: time.Now(),
        })
}

// GetAlerts returns all stored alerts
func (me *MonitoringEngine) GetAlerts(ctx context.Context, limit int) []Alert {
        me.mu.RLock()

        // First check in-memory cache
        if len(me.alerts) > 0 {
                alerts := make([]Alert, 0, len(me.alerts))
                for _, a := range me.alerts {
                        alerts = append(alerts, *a)
                }
                me.mu.RUnlock()

                // Sort by timestamp descending (most recent first)
                sort.Slice(alerts, func(i, j int) bool {
                        return alerts[i].Timestamp.After(alerts[j].Timestamp)
                })

                if len(alerts) > limit {
                        alerts = alerts[:limit]
                }
                return alerts
        }
        me.mu.RUnlock()

        // Fallback: try Redis
        if me.redis != nil {
                results, err := me.redis.LRange(ctx, "whatomate:recent_alerts", 0, int64(limit-1)).Result()
                if err == nil && len(results) > 0 {
                        var alerts []Alert
                        for _, r := range results {
                                var a Alert
                                if err := json.Unmarshal([]byte(r), &a); err == nil {
                                        alerts = append(alerts, a)
                                }
                        }
                        return alerts
                }
        }

        // Last resort: load from PostgreSQL
        events, err := me.eventStore.GetRecent(ctx, StreamAlerts, int64(limit))
        if err == nil {
                var alerts []Alert
                for _, event := range events {
                        if alert, ok := event.Payload["alertId"]; ok {
                                alerts = append(alerts, Alert{
                                        ID:          fmt.Sprintf("%v", alert),
                                        Source:      fmt.Sprintf("%v", event.Payload["source"]),
                                        Severity:    fmt.Sprintf("%v", event.Payload["severity"]),
                                        Title:       fmt.Sprintf("%v", event.Payload["title"]),
                                        Description: fmt.Sprintf("%v", event.Payload["description"]),
                                        Strategy:    fmt.Sprintf("%v", event.Payload["strategy"]),
                                        ActionTaken: fmt.Sprintf("%v", event.Payload["action"]),
                                        Timestamp:   event.Timestamp,
                                })
                        }
                }
                return alerts
        }

        return []Alert{}
}

// AcknowledgeAlert marks an alert as acknowledged
func (me *MonitoringEngine) AcknowledgeAlert(ctx context.Context, alertID string) error {
        me.mu.Lock()
        defer me.mu.Unlock()

        if alert, ok := me.alerts[alertID]; ok {
                alert.Acknowledged = true
        }

        // Store acknowledgement event
        return me.eventStore.Append(ctx, StreamAlerts, IntelligenceEvent{
                EventType:     EventTypeAlertAcknowledged,
                AggregateID:   alertID,
                AggregateType: "alert",
                Payload: map[string]interface{}{
                        "alertId":      alertID,
                        "acknowledged": true,
                        "at":           time.Now(),
                },
                Timestamp: time.Now(),
        })
}

// EscalateAlert marks an alert as escalated
func (me *MonitoringEngine) EscalateAlert(ctx context.Context, alertID string) error {
        me.mu.Lock()
        defer me.mu.Unlock()

        if alert, ok := me.alerts[alertID]; ok {
                alert.Escalated = true
                alert.Severity = "CRÍTICA"
        }

        // Store escalation event
        return me.eventStore.Append(ctx, StreamAlerts, IntelligenceEvent{
                EventType:     EventTypeAlertEscalated,
                AggregateID:   alertID,
                AggregateType: "alert",
                Payload: map[string]interface{}{
                        "alertId":   alertID,
                        "escalated": true,
                        "severity":  "CRÍTICA",
                        "at":        time.Now(),
                },
                Timestamp: time.Now(),
        })
}

// GetAgentStates returns all agent states
func (me *MonitoringEngine) GetAgentStates() []AgentState {
        me.mu.RLock()
        defer me.mu.RUnlock()

        states := make([]AgentState, 0, len(me.agents))
        for _, a := range me.agents {
                states = append(states, *a)
        }
        return states
}

// GetActiveAlertCount returns the count of active (unacknowledged) alerts
func (me *MonitoringEngine) GetActiveAlertCount() int {
        me.mu.RLock()
        defer me.mu.RUnlock()

        count := 0
        for _, a := range me.alerts {
                if !a.Acknowledged {
                        count++
                }
        }
        return count
}

// GetCriticalAlertCount returns the count of critical severity alerts
func (me *MonitoringEngine) GetCriticalAlertCount() int {
        me.mu.RLock()
        defer me.mu.RUnlock()

        count := 0
        for _, a := range me.alerts {
                if a.Severity == "CRÍTICA" && !a.Acknowledged {
                        count++
                }
        }
        return count
}

// generateAlertTitle creates a descriptive title based on the strategy result
func (me *MonitoringEngine) generateAlertTitle(result StrategyResult) string {
        switch result.Action {
        case "escalate":
                return fmt.Sprintf("ESCALATE: %s - %s", result.Severity, truncate(result.Reasoning, 80))
        case "alert":
                return fmt.Sprintf("ALERT: %s - %s", result.Severity, truncate(result.Reasoning, 80))
        default:
                return fmt.Sprintf("MONITOR: %s - %s", result.Severity, truncate(result.Reasoning, 80))
        }
}

// inferStrategyFromResult attempts to determine which strategy generated this result
func (me *MonitoringEngine) inferStrategyFromResult(result StrategyResult) string {
        if result.Data != nil {
                if _, ok := result.Data["votes"]; ok {
                        return "consensus"
                }
                if _, ok := result.Data["assessments"]; ok {
                        return "risk_scoring"
                }
                if _, ok := result.Data["predictions"]; ok {
                        return "predictive"
                }
                if _, ok := result.Data["activePatterns"]; ok {
                        return "pattern"
                }
        }
        return "unknown"
}

// truncate shortens a string to maxLen with ellipsis
func truncate(s string, maxLen int) string {
        if len(s) <= maxLen {
                return s
        }
        return s[:maxLen-3] + "..."
}

func maxInt(a, b int) int {
        if a > b {
                return a
        }
        return b
}
