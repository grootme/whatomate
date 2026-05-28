package handlers

import (
        "context"
        "fmt"
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
                stream = intelligence.StreamIntelEvents
        }

        fromStr := string(r.RequestCtx.QueryArgs().Peek("from"))
        if fromStr == "" {
                return r.SendErrorEnvelope(fasthttp.StatusBadRequest, "Missing 'from' parameter (RFC3339 format)", nil, "")
        }

        from, err := time.Parse(time.RFC3339, fromStr)
        if err != nil {
                return r.SendErrorEnvelope(fasthttp.StatusBadRequest, "Invalid 'from' timestamp format", nil, "")
        }

        countStr := string(r.RequestCtx.QueryArgs().Peek("count"))
        count := 100
        if countStr != "" {
                if c, err := strconv.Atoi(countStr); err == nil && c > 0 {
                        count = c
                }
        }

        ctx := context.Background()
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
        alerts := a.IntelService.GetAlerts(ctx, 20)

        // Filter to unacknowledged alerts (notifications)
        var notifications []intelligence.Alert
        for _, a := range alerts {
                if !a.Acknowledged {
                        notifications = append(notifications, a)
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
                Type string `json:"type"` // "threat_summary", "risk_analysis", "pattern_report", "full_intelligence"
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
        for i, s := range signals {
                if i < len(strategies) {
                        signalMap[strategies[i].ID()] = &s
                }
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
