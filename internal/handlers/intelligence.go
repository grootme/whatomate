package handlers

import (
        "context"
        "fmt"
        "log"
        "sort"
        "strconv"
        "time"

        "github.com/shridarpatil/whatomate/internal/intelligence"
        "github.com/valyala/fasthttp"
        "github.com/zerodha/fastglue"
)

// ============================================================
// Intelligence API Handlers
// ============================================================

// GetIntelDashboard returns aggregated intelligence dashboard data
func (a *App) GetIntelDashboard(r *fastglue.Request) error {
        if a.IntelService == nil {
                return r.SendErrorEnvelope(fasthttp.StatusServiceUnavailable, "Intelligence service not initialized", nil, "")
        }

        ctx := context.Background()
        data := a.IntelService.GetDashboardData(ctx)
        return r.SendEnvelope(data)
}

// GetIntelEvents returns events from a specific stream
func (a *App) GetIntelEvents(r *fastglue.Request) error {
        if a.IntelService == nil {
                return r.SendErrorEnvelope(fasthttp.StatusServiceUnavailable, "Intelligence service not initialized", nil, "")
        }

        stream := string(r.RequestCtx.QueryArgs().Peek("stream"))
        if stream == "" {
                stream = intelligence.StreamIntelEvents
        }

        countStr := string(r.RequestCtx.QueryArgs().Peek("count"))
        count := int64(50)
        if countStr != "" {
                if c, err := strconv.ParseInt(countStr, 10, 64); err == nil && c > 0 {
                        count = c
                }
        }

        ctx := context.Background()
        events, err := a.IntelService.GetRecentEvents(ctx, stream, count)
        if err != nil {
                return r.SendErrorEnvelope(fasthttp.StatusInternalServerError, "Failed to get events", nil, "")
        }

        return r.SendEnvelope(map[string]interface{}{
                "stream": stream,
                "count":  len(events),
                "events": events,
        })
}

// ReplayIntelEvents replays events from a given timestamp
func (a *App) GetIntelEventsReplay(r *fastglue.Request) error {
        if a.IntelService == nil {
                return r.SendErrorEnvelope(fasthttp.StatusServiceUnavailable, "Intelligence service not initialized", nil, "")
        }

        stream := string(r.RequestCtx.QueryArgs().Peek("stream"))
        if stream == "" {
                stream = "all"
        }

        fromStr := string(r.RequestCtx.QueryArgs().Peek("from"))
        var from time.Time
        if fromStr != "" {
                var err error
                from, err = time.Parse(time.RFC3339, fromStr)
                if err != nil {
                        return r.SendErrorEnvelope(fasthttp.StatusBadRequest, "Invalid 'from' timestamp format (expected RFC3339)", nil, "")
                }
        } else {
                // Default to 24 hours ago if no from parameter provided
                from = time.Now().Add(-24 * time.Hour)
        }

        countStr := string(r.RequestCtx.QueryArgs().Peek("count"))
        count := 100
        if countStr != "" {
                if c, err := strconv.Atoi(countStr); err == nil && c > 0 {
                        count = c
                }
        }

        ctx := context.Background()

        // When stream is "all", replay from ALL intelligence streams
        if stream == "all" {
                replayService := a.IntelService.GetEventReplayService()
                if replayService == nil {
                        return r.SendErrorEnvelope(fasthttp.StatusServiceUnavailable, "Event replay service not initialized", nil, "")
                }

                allResults, err := replayService.ReplayAllStreams(ctx, from, count)
                if err != nil {
                        return r.SendErrorEnvelope(fasthttp.StatusInternalServerError, "Failed to replay events from all streams", nil, "")
                }

                // Aggregate all events across streams into a single timeline
                var allEvents []intelligence.IntelligenceEvent
                streamSummary := make(map[string]int)
                for streamName, result := range allResults {
                        streamSummary[streamName] = len(result.Events)
                        allEvents = append(allEvents, result.Events...)
                }

                // Sort combined events by timestamp descending
                sort.Slice(allEvents, func(i, j int) bool {
                        return allEvents[i].Timestamp.After(allEvents[j].Timestamp)
                })

                // Limit to requested count
                if len(allEvents) > count {
                        allEvents = allEvents[:count]
                }

                return r.SendEnvelope(map[string]interface{}{
                        "stream":         "all",
                        "from":           from,
                        "count":          len(allEvents),
                        "events":         allEvents,
                        "streamsScanned": len(allResults),
                        "streamSummary":  streamSummary,
                })
        }

        // Single stream replay (original behavior)
        events, err := a.IntelService.ReplayEvents(ctx, stream, from, count)
        if err != nil {
                return r.SendErrorEnvelope(fasthttp.StatusInternalServerError, "Failed to replay events", nil, "")
        }

        return r.SendEnvelope(map[string]interface{}{
                "stream": stream,
                "from":   from,
                "count":  len(events),
                "events": events,
        })
}

// GetIntelEntities returns tracked entities
func (a *App) GetIntelEntities(r *fastglue.Request) error {
        if a.IntelService == nil {
                return r.SendErrorEnvelope(fasthttp.StatusServiceUnavailable, "Intelligence service not initialized", nil, "")
        }

        entities := a.IntelService.GetEntities()
        return r.SendEnvelope(map[string]interface{}{
                "count":    len(entities),
                "entities": entities,
        })
}

// IngestWhatsAppMessage handles WhatsApp message ingestion
func (a *App) IngestWhatsAppMessage(r *fastglue.Request) error {
        if a.IntelService == nil {
                return r.SendErrorEnvelope(fasthttp.StatusServiceUnavailable, "Intelligence service not initialized", nil, "")
        }

        var req struct {
                SourceID    string                 `json:"sourceId"`
                ChannelName string                 `json:"channelName"`
                ChannelID   string                 `json:"channelId"`
                SenderName  string                 `json:"senderName"`
                Content     string                 `json:"content"`
                Metadata    map[string]interface{} `json:"metadata"`
        }

        if err := a.decodeRequest(r, &req); err != nil {
                return err
        }

        if req.Content == "" {
                return r.SendErrorEnvelope(fasthttp.StatusBadRequest, "Content is required", nil, "")
        }
        if len(req.Content) > 100000 {
                return r.SendErrorEnvelope(fasthttp.StatusBadRequest, "Content exceeds maximum length of 100000 characters", nil, "")
        }

        msg := intelligence.RawMessage{
                Source:      "whatsapp",
                SourceID:    req.SourceID,
                ChannelName: req.ChannelName,
                ChannelID:   req.ChannelID,
                SenderName:  req.SenderName,
                Content:     req.Content,
                Metadata:    req.Metadata,
        }

        ctx := context.Background()
        if err := a.IntelService.IngestMessage(ctx, msg); err != nil {
                return r.SendErrorEnvelope(fasthttp.StatusInternalServerError, "Failed to ingest message", nil, "")
        }

        return r.SendEnvelope(map[string]interface{}{
                "status":  "ingested",
                "source":  "whatsapp",
                "message": msg,
        })
}

// IngestTelegramMessage handles Telegram message ingestion
func (a *App) IngestTelegramMessage(r *fastglue.Request) error {
        if a.IntelService == nil {
                return r.SendErrorEnvelope(fasthttp.StatusServiceUnavailable, "Intelligence service not initialized", nil, "")
        }

        var req struct {
                SourceID    string                 `json:"sourceId"`
                ChannelName string                 `json:"channelName"`
                ChannelID   string                 `json:"channelId"`
                SenderName  string                 `json:"senderName"`
                Content     string                 `json:"content"`
                Metadata    map[string]interface{} `json:"metadata"`
        }

        if err := a.decodeRequest(r, &req); err != nil {
                return err
        }

        if req.Content == "" {
                return r.SendErrorEnvelope(fasthttp.StatusBadRequest, "Content is required", nil, "")
        }
        if len(req.Content) > 100000 {
                return r.SendErrorEnvelope(fasthttp.StatusBadRequest, "Content exceeds maximum length of 100000 characters", nil, "")
        }

        msg := intelligence.RawMessage{
                Source:      "telegram",
                SourceID:    req.SourceID,
                ChannelName: req.ChannelName,
                ChannelID:   req.ChannelID,
                SenderName:  req.SenderName,
                Content:     req.Content,
                Metadata:    req.Metadata,
        }

        ctx := context.Background()
        if err := a.IntelService.IngestMessage(ctx, msg); err != nil {
                return r.SendErrorEnvelope(fasthttp.StatusInternalServerError, "Failed to ingest message", nil, "")
        }

        return r.SendEnvelope(map[string]interface{}{
                "status":  "ingested",
                "source":  "telegram",
                "message": msg,
        })
}

// IngestOSINTData handles OSINT data ingestion
func (a *App) IngestOSINTData(r *fastglue.Request) error {
        if a.IntelService == nil {
                return r.SendErrorEnvelope(fasthttp.StatusServiceUnavailable, "Intelligence service not initialized", nil, "")
        }

        var req struct {
                SourceID string                 `json:"sourceId"`
                Content  string                 `json:"content"`
                Metadata map[string]interface{} `json:"metadata"`
        }

        if err := a.decodeRequest(r, &req); err != nil {
                return err
        }

        if req.Content == "" {
                return r.SendErrorEnvelope(fasthttp.StatusBadRequest, "Content is required", nil, "")
        }

        msg := intelligence.RawMessage{
                Source:   "osint",
                SourceID: req.SourceID,
                Content:  req.Content,
                Metadata: req.Metadata,
        }

        ctx := context.Background()
        if err := a.IntelService.IngestMessage(ctx, msg); err != nil {
                return r.SendErrorEnvelope(fasthttp.StatusInternalServerError, "Failed to ingest OSINT data", nil, "")
        }

        return r.SendEnvelope(map[string]interface{}{
                "status": "ingested",
                "source": "osint",
        })
}

// ProcessIntelMessages triggers message processing pipeline
func (a *App) ProcessIntelMessages(r *fastglue.Request) error {
        if a.IntelService == nil {
                return r.SendErrorEnvelope(fasthttp.StatusServiceUnavailable, "Intelligence service not initialized", nil, "")
        }

        ctx := context.Background()
        results, err := a.IntelService.RunAnalysis(ctx)
        if err != nil {
                return r.SendErrorEnvelope(fasthttp.StatusInternalServerError, "Failed to process messages", nil, "")
        }

        return r.SendEnvelope(map[string]interface{}{
                "status":      "completed",
                "processed":   len(results),
                "results":     results,
        })
}

// RunIntelCorrelation triggers correlation analysis
func (a *App) RunIntelCorrelation(r *fastglue.Request) error {
        if a.IntelService == nil {
                return r.SendErrorEnvelope(fasthttp.StatusServiceUnavailable, "Intelligence service not initialized", nil, "")
        }

        ctx := context.Background()

        // Run analysis first to ensure entities are up to date
        _, _ = a.IntelService.RunAnalysis(ctx)

        // Run strategy evaluation (includes correlation)
        results, alerts, err := a.IntelService.EvaluateStrategies(ctx)
        if err != nil {
                return r.SendErrorEnvelope(fasthttp.StatusInternalServerError, "Failed to run correlation", nil, "")
        }

        return r.SendEnvelope(map[string]interface{}{
                "status":    "completed",
                "strategies": len(results),
                "alerts":    len(alerts),
                "results":   results,
        })
}

// GetIntelThreatFeed returns the OSINT threat feed
func (a *App) GetIntelThreatFeed(r *fastglue.Request) error {
        if a.IntelService == nil {
                return r.SendErrorEnvelope(fasthttp.StatusServiceUnavailable, "Intelligence service not initialized", nil, "")
        }

        ctx := context.Background()
        snapshot, err := a.IntelService.FetchOSINTData(ctx)
        if err != nil {
                // Even if fetch fails, return last known data
                return r.SendEnvelope(map[string]interface{}{
                        "snapshot": nil,
                        "error":    err.Error(),
                })
        }

        return r.SendEnvelope(map[string]interface{}{
                "snapshot": snapshot,
        })
}

// GetIntelThreatLevel returns the current threat level assessment
func (a *App) GetIntelThreatLevel(r *fastglue.Request) error {
        if a.IntelService == nil {
                return r.SendErrorEnvelope(fasthttp.StatusServiceUnavailable, "Intelligence service not initialized", nil, "")
        }

        ctx := context.Background()
        threatLevel := a.IntelService.GetThreatLevel(ctx)
        return r.SendEnvelope(threatLevel)
}

// GetIntelAnomalies returns detected anomalies
func (a *App) GetIntelAnomalies(r *fastglue.Request) error {
        if a.IntelService == nil {
                return r.SendErrorEnvelope(fasthttp.StatusServiceUnavailable, "Intelligence service not initialized", nil, "")
        }

        ctx := context.Background()
        anomalies := a.IntelService.GetAnomalies(ctx)
        return r.SendEnvelope(map[string]interface{}{
                "count":     len(anomalies),
                "anomalies": anomalies,
        })
}

// GetIntelAlerts returns recent alerts
func (a *App) GetIntelAlerts(r *fastglue.Request) error {
        if a.IntelService == nil {
                return r.SendErrorEnvelope(fasthttp.StatusServiceUnavailable, "Intelligence service not initialized", nil, "")
        }

        limitStr := string(r.RequestCtx.QueryArgs().Peek("limit"))
        limit := 50
        if limitStr != "" {
                if l, err := strconv.Atoi(limitStr); err == nil && l > 0 {
                        limit = l
                }
        }

        ctx := context.Background()
        alerts := a.IntelService.GetAlerts(ctx, limit)
        return r.SendEnvelope(map[string]interface{}{
                "count":  len(alerts),
                "alerts": alerts,
        })
}

// GetIntelAgents returns agent status
func (a *App) GetIntelAgents(r *fastglue.Request) error {
        if a.IntelService == nil {
                return r.SendErrorEnvelope(fasthttp.StatusServiceUnavailable, "Intelligence service not initialized", nil, "")
        }

        agents := a.IntelService.GetAgentStates()
        return r.SendEnvelope(map[string]interface{}{
                "count":  len(agents),
                "agents": agents,
        })
}

// GetIntelNotifications returns notification dispatch info
func (a *App) GetIntelNotifications(r *fastglue.Request) error {
        if a.IntelService == nil {
                return r.SendErrorEnvelope(fasthttp.StatusServiceUnavailable, "Intelligence service not initialized", nil, "")
        }

        ctx := context.Background()
        allAlerts := a.IntelService.GetAlerts(ctx, 20)

        // Filter to unacknowledged alerts (notifications)
        var notifications []intelligence.Alert
        for _, alert := range allAlerts {
                if !alert.Acknowledged {
                        notifications = append(notifications, alert)
                }
        }

        return r.SendEnvelope(map[string]interface{}{
                "count":         len(notifications),
                "notifications": notifications,
        })
}

// GetIntelPredictions returns predictive analytics
func (a *App) GetIntelPredictions(r *fastglue.Request) error {
        if a.IntelService == nil {
                return r.SendErrorEnvelope(fasthttp.StatusServiceUnavailable, "Intelligence service not initialized", nil, "")
        }

        ctx := context.Background()
        predictions, err := a.IntelService.GetPredictions(ctx, 20)
        if err != nil {
                return r.SendErrorEnvelope(fasthttp.StatusInternalServerError, "Failed to get predictions", nil, "")
        }

        return r.SendEnvelope(map[string]interface{}{
                "count":        len(predictions),
                "predictions":  predictions,
        })
}

// GenerateIntelReport generates an intelligence report
func (a *App) GenerateIntelReport(r *fastglue.Request) error {
        if a.IntelService == nil {
                return r.SendErrorEnvelope(fasthttp.StatusServiceUnavailable, "Intelligence service not initialized", nil, "")
        }

        var req struct {
                Type string `json:"type"` // "threat_summary", "risk_analysis", "pattern_report", "full_intelligence", "maritime_threat"
        }

        if err := a.decodeRequest(r, &req); err != nil {
                return err
        }

        if req.Type == "" {
                req.Type = "full_intelligence"
        }

        ctx := context.Background()
        report, err := a.IntelService.GenerateReport(ctx, req.Type)
        if err != nil {
                return r.SendErrorEnvelope(fasthttp.StatusInternalServerError, fmt.Sprintf("Failed to generate report: %v", err), nil, "")
        }

        return r.SendEnvelope(report)
}

// GetIntelReports returns a list of recent reports
func (a *App) GetIntelReports(r *fastglue.Request) error {
        if a.IntelService == nil {
                return r.SendErrorEnvelope(fasthttp.StatusServiceUnavailable, "Intelligence service not initialized", nil, "")
        }

        ctx := context.Background()
        reports, err := a.IntelService.GetReports(ctx, 20)
        if err != nil {
                return r.SendErrorEnvelope(fasthttp.StatusInternalServerError, "Failed to get reports", nil, "")
        }

        return r.SendEnvelope(map[string]interface{}{
                "count":   len(reports),
                "reports": reports,
        })
}

// GetIntelStrategies returns strategy list and current signals
func (a *App) GetIntelStrategies(r *fastglue.Request) error {
        if a.IntelService == nil {
                return r.SendErrorEnvelope(fasthttp.StatusServiceUnavailable, "Intelligence service not initialized", nil, "")
        }

        ctx := context.Background()
        strategies := a.IntelService.GetStrategies()
        signals := a.IntelService.GetStrategySignals(ctx)

        // Format strategies for display
        type strategyInfo struct {
                ID     string `json:"id"`
                Name   string `json:"name"`
                Signal *intelligence.StrategyResult `json:"signal,omitempty"`
        }

        signalMap := make(map[string]*intelligence.StrategyResult)
        for _, s := range signals {
                signalMap[s.StrategyID] = s
        }

        var infos []strategyInfo
        for _, s := range strategies {
                info := strategyInfo{
                        ID:   s.ID(),
                        Name: s.Name(),
                }
                if sig, ok := signalMap[s.ID()]; ok {
                        info.Signal = sig
                }
                infos = append(infos, info)
        }

        return r.SendEnvelope(map[string]interface{}{
                "count":      len(infos),
                "strategies": infos,
        })
}

// GetIntelHealth returns intelligence service health
func (a *App) GetIntelHealth(r *fastglue.Request) error {
        if a.IntelService == nil {
                return r.SendEnvelope(map[string]interface{}{
                        "status": "unavailable",
                })
        }

        ctx := context.Background()
        health := a.IntelService.GetHealthStatus(ctx)
        return r.SendEnvelope(health)
}

// GetIntelAggregatedHealth returns comprehensive aggregated health check
func (a *App) GetIntelAggregatedHealth(r *fastglue.Request) error {
        if a.IntelService == nil {
                return r.SendEnvelope(map[string]interface{}{
                        "status": "unavailable",
                })
        }

        ctx := context.Background()
        health := a.IntelService.GetAggregatedHealth(ctx)
        return r.SendEnvelope(health)
}

// RunIntelScheduler triggers scheduled tasks manually
func (a *App) RunIntelScheduler(r *fastglue.Request) error {
        if a.IntelService == nil {
                return r.SendErrorEnvelope(fasthttp.StatusServiceUnavailable, "Intelligence service not initialized", nil, "")
        }

        ctx := context.Background()

        // Run all scheduled tasks
        var results []string

        // 1. Fetch OSINT data
        _, err := a.IntelService.FetchOSINTData(ctx)
        if err != nil {
                results = append(results, fmt.Sprintf("OSINT fetch: FAILED (%v)", err))
        } else {
                results = append(results, "OSINT fetch: OK")
        }

        // 2. Run analysis
        _, err = a.IntelService.RunAnalysis(ctx)
        if err != nil {
                results = append(results, fmt.Sprintf("Analysis: FAILED (%v)", err))
        } else {
                results = append(results, "Analysis: OK")
        }

        // 3. Evaluate strategies
        _, _, err = a.IntelService.EvaluateStrategies(ctx)
        if err != nil {
                results = append(results, fmt.Sprintf("Strategies: FAILED (%v)", err))
        } else {
                results = append(results, "Strategies: OK")
        }

        return r.SendEnvelope(map[string]interface{}{
                "status":  "completed",
                "results": results,
        })
}

// GetIntelSchedulerStatus returns scheduler status
func (a *App) GetIntelSchedulerStatus(r *fastglue.Request) error {
        if a.IntelService == nil {
                return r.SendErrorEnvelope(fasthttp.StatusServiceUnavailable, "Intelligence service not initialized", nil, "")
        }

        status := a.IntelService.GetSchedulerStatus()
        return r.SendEnvelope(status)
}

// GetIntelOSINTThreatLevel computes threat level from OSINT data
func (a *App) GetIntelOSINTThreatLevel(r *fastglue.Request) error {
        if a.IntelService == nil {
                return r.SendErrorEnvelope(fasthttp.StatusServiceUnavailable, "Intelligence service not initialized", nil, "")
        }

        ctx := context.Background()
        osintData, err := a.IntelService.FetchOSINTData(ctx)
        if err != nil {
                // Try cache
                cached := a.IntelService.GetOSINTCache().GetSnapshot(ctx)
                if cached != nil {
                        assessment := a.IntelService.ComputeOSINTThreatLevel(ctx, cached)
                        return r.SendEnvelope(assessment)
                }
                return r.SendErrorEnvelope(fasthttp.StatusServiceUnavailable, "OSINT data unavailable", nil, "")
        }

        assessment := a.IntelService.ComputeOSINTThreatLevel(ctx, osintData)

        // Cache the result
        _ = a.IntelService.GetOSINTCache().SetSnapshot(ctx, osintData)
        _ = a.IntelService.GetOSINTCache().SetThreatLevel(ctx, assessment)

        return r.SendEnvelope(assessment)
}

// GetIntelCorrelations returns correlations between Telegram and OSINT data
func (a *App) GetIntelCorrelations(r *fastglue.Request) error {
        if a.IntelService == nil {
                return r.SendErrorEnvelope(fasthttp.StatusServiceUnavailable, "Intelligence service not initialized", nil, "")
        }

        ctx := context.Background()

        // Run analysis to get recent messages
        results, err := a.IntelService.RunAnalysis(ctx)
        if err != nil {
                log.Printf("[intelligence] RunAnalysis failed in GetIntelCorrelations: %v", err)
        }
        _ = results

        // Get OSINT data
        osintData, err := a.IntelService.FetchOSINTData(ctx)
        if err != nil {
                log.Printf("[intelligence] FetchOSINTData failed in GetIntelCorrelations: %v", err)
        }
        if osintData == nil {
                osintData = a.IntelService.GetOSINTCache().GetSnapshot(ctx)
        }

        if osintData == nil {
                return r.SendEnvelope(map[string]interface{}{
                        "correlations": []intelligence.CorrelationMatch{},
                        "message":      "No OSINT data available for correlation",
                })
        }

        // Get recent telegram messages
        events, err := a.IntelService.GetRecentEvents(ctx, "whatomate:telegram_messages", 50)
        if err != nil {
                log.Printf("[intelligence] GetRecentEvents failed in GetIntelCorrelations: %v", err)
        }
        var messages []intelligence.RawMessage
        for _, event := range events {
                msg := intelligence.RawMessage{
                        ID:      event.AggregateID,
                        Source:  "telegram",
                        Content: fmt.Sprintf("%v", event.Payload["content"]),
                }
                messages = append(messages, msg)
        }

        matches := a.IntelService.CorrelateTelegramWithOSINT(ctx, messages, osintData)

        return r.SendEnvelope(map[string]interface{}{
                "correlations":    matches,
                "messagesScanned": len(messages),
                "osintAvailable":  osintData != nil,
        })
}

// ScheduleIntelReport creates a scheduled report job
func (a *App) ScheduleIntelReport(r *fastglue.Request) error {
        if a.IntelService == nil {
                return r.SendErrorEnvelope(fasthttp.StatusServiceUnavailable, "Intelligence service not initialized", nil, "")
        }

        var req intelligence.ScheduleReportRequest
        if err := a.decodeRequest(r, &req); err != nil {
                return err
        }

        ctx := context.Background()
        job, err := a.IntelService.GetReportScheduler().CreateJob(ctx, req)
        if err != nil {
                return r.SendErrorEnvelope(fasthttp.StatusBadRequest, err.Error(), nil, "")
        }

        return r.SendEnvelope(job)
}

// ListScheduledReports lists all scheduled report jobs
func (a *App) ListScheduledReports(r *fastglue.Request) error {
        if a.IntelService == nil {
                return r.SendErrorEnvelope(fasthttp.StatusServiceUnavailable, "Intelligence service not initialized", nil, "")
        }

        jobs := a.IntelService.GetReportScheduler().ListJobs()
        return r.SendEnvelope(map[string]interface{}{
                "count": len(jobs),
                "jobs":  jobs,
        })
}

// DeleteScheduledReport deletes a scheduled report job
func (a *App) DeleteScheduledReport(r *fastglue.Request) error {
        if a.IntelService == nil {
                return r.SendErrorEnvelope(fasthttp.StatusServiceUnavailable, "Intelligence service not initialized", nil, "")
        }

        jobID := string(r.RequestCtx.QueryArgs().Peek("jobId"))
        if jobID == "" {
                return r.SendErrorEnvelope(fasthttp.StatusBadRequest, "Missing 'jobId' parameter", nil, "")
        }

        if err := a.IntelService.GetReportScheduler().DeleteJob(jobID); err != nil {
                return r.SendErrorEnvelope(fasthttp.StatusNotFound, err.Error(), nil, "")
        }

        return r.SendEnvelope(map[string]interface{}{
                "status": "deleted",
                "jobId":  jobID,
        })
}

// AcknowledgeIntelAlert acknowledges an alert
func (a *App) AcknowledgeIntelAlert(r *fastglue.Request) error {
        if a.IntelService == nil {
                return r.SendErrorEnvelope(fasthttp.StatusServiceUnavailable, "Intelligence service not initialized", nil, "")
        }

        alertID := string(r.RequestCtx.QueryArgs().Peek("alertId"))
        if alertID == "" {
                return r.SendErrorEnvelope(fasthttp.StatusBadRequest, "Missing 'alertId' parameter", nil, "")
        }

        ctx := context.Background()
        if err := a.IntelService.AcknowledgeAlert(ctx, alertID); err != nil {
                return r.SendErrorEnvelope(fasthttp.StatusInternalServerError, "Failed to acknowledge alert", nil, "")
        }

        return r.SendEnvelope(map[string]interface{}{
                "status":  "acknowledged",
                "alertId": alertID,
        })
}

// EscalateIntelAlert escalates an alert
func (a *App) EscalateIntelAlert(r *fastglue.Request) error {
        if a.IntelService == nil {
                return r.SendErrorEnvelope(fasthttp.StatusServiceUnavailable, "Intelligence service not initialized", nil, "")
        }

        alertID := string(r.RequestCtx.QueryArgs().Peek("alertId"))
        if alertID == "" {
                return r.SendErrorEnvelope(fasthttp.StatusBadRequest, "Missing 'alertId' parameter", nil, "")
        }

        ctx := context.Background()
        if err := a.IntelService.EscalateAlert(ctx, alertID); err != nil {
                return r.SendErrorEnvelope(fasthttp.StatusInternalServerError, "Failed to escalate alert", nil, "")
        }

        return r.SendEnvelope(map[string]interface{}{
                "status":  "escalated",
                "alertId": alertID,
        })
}

// GetIntelMetrics returns system metrics and monitoring data
func (a *App) GetIntelMetrics(r *fastglue.Request) error {
        if a.IntelService == nil {
                return r.SendErrorEnvelope(fasthttp.StatusServiceUnavailable, "Intelligence service not initialized", nil, "")
        }

        ctx := context.Background()
        dashboard := a.IntelService.GetDashboardData(ctx)
        schedulerStatus := a.IntelService.GetSchedulerStatus()
        cacheStats := a.IntelService.GetOSINTCache().GetStats(ctx)

        return r.SendEnvelope(map[string]interface{}{
                "threatScore":    dashboard.ThreatScore,
                "threatLevel":    dashboard.ThreatLevel,
                "activeAlerts":   dashboard.ActiveAlerts,
                "criticalAlerts": dashboard.CriticalAlerts,
                "totalEntities":  dashboard.TotalEntities,
                "highRiskEntities": dashboard.HighRiskEntities,
                "activePatterns": dashboard.ActivePatterns,
                "totalMessages":  dashboard.TotalMessages,
                "processedMessages": dashboard.ProcessedMessages,
                "agentCount":     len(dashboard.AgentStates),
                "schedulerRunning": schedulerStatus.Running,
                "schedulerCycles": schedulerStatus.CycleCount,
                "cacheStats":     cacheStats,
                "streamStats":    dashboard.StreamStats,
        })
}
