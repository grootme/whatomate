package intelligence

import (
        "context"
        "encoding/json"
        "fmt"
        "time"

        "github.com/zerodha/logf"
)

// EventReplayService provides event replay capabilities for reconstructing
// intelligence state from historical events, enabling time-travel debugging
// and point-in-time analysis
type EventReplayService struct {
        eventStore *EventStore
        log        logf.Logger
}

// NewEventReplayService creates a new event replay service
func NewEventReplayService(es *EventStore, log logf.Logger) *EventReplayService {
        return &EventReplayService{
                eventStore: es,
                log:        log,
        }
}

// ReplayRequest represents a request to replay events
type ReplayRequest struct {
        Stream    string    `json:"stream"`
        From      time.Time `json:"from"`
        To        time.Time `json:"to"`
        Count     int       `json:"count"`
        EventType string    `json:"eventType,omitempty"` // Filter to specific event type
}

// ReplayResult represents the result of an event replay operation
type ReplayResult struct {
        Request     ReplayRequest       `json:"request"`
        TotalEvents int                 `json:"totalEvents"`
        Events      []IntelligenceEvent `json:"events"`
        Duration    time.Duration       `json:"duration"`
        State       *ReplayState        `json:"state,omitempty"`
        Error       string              `json:"error,omitempty"`
}

// ReplayState represents the reconstructed state at a point in time
type ReplayState struct {
        Entities         []Entity           `json:"entities"`
        Patterns         []PatternDetection `json:"patterns"`
        Alerts           []Alert            `json:"alerts"`
        ThreatScore      int                `json:"threatScore"`
        ThreatLevel      string             `json:"threatLevel"`
        MessageCount     int                `json:"messageCount"`
        EntityCount      int                `json:"entityCount"`
        PatternCount     int                `json:"patternCount"`
        AlertCount       int                `json:"alertCount"`
        ReconstructedAt  time.Time          `json:"reconstructedAt"`
}

// ReplayEvents replays events from a given time range and returns the results
func (ers *EventReplayService) ReplayEvents(ctx context.Context, req ReplayRequest) (*ReplayResult, error) {
        start := time.Now()

        if req.Stream == "" {
                req.Stream = StreamIntelEvents
        }
        if req.Count <= 0 {
                req.Count = 1000
        }
        if req.Count > 10000 {
                req.Count = 10000 // Limit to prevent excessive memory usage
        }

        events, err := ers.eventStore.ReplayEvents(ctx, req.Stream, req.From, req.Count)
        if err != nil {
                return &ReplayResult{
                        Request:  req,
                        Duration: time.Since(start),
                        Error:    err.Error(),
                }, err
        }

        // Filter by end time if specified
        if !req.To.IsZero() {
                var filtered []IntelligenceEvent
                for _, e := range events {
                        if e.Timestamp.Before(req.To) || e.Timestamp.Equal(req.To) {
                                filtered = append(filtered, e)
                        }
                }
                events = filtered
        }

        // Filter by event type if specified
        if req.EventType != "" {
                var filtered []IntelligenceEvent
                for _, e := range events {
                        if e.EventType == req.EventType {
                                filtered = append(filtered, e)
                        }
                }
                events = filtered
        }

        result := &ReplayResult{
                Request:     req,
                TotalEvents: len(events),
                Events:      events,
                Duration:    time.Since(start),
        }

        ers.log.Info("Event replay completed",
                "stream", req.Stream,
                "from", req.From,
                "events", len(events),
                "duration", result.Duration)

        return result, nil
}

// ReplayAndReconstruct replays events and reconstructs the intelligence state
func (ers *EventReplayService) ReplayAndReconstruct(ctx context.Context, req ReplayRequest) (*ReplayResult, error) {
        result, err := ers.ReplayEvents(ctx, req)
        if err != nil {
                return result, err
        }

        state := &ReplayState{
                ReconstructedAt: time.Now(),
        }

        // Reconstruct state from events
        entityMap := make(map[string]*Entity)
        patternMap := make(map[string]*PatternDetection)
        alertMap := make(map[string]*Alert)

        for _, event := range result.Events {
                switch event.EventType {
                case EventTypeMessageIngested:
                        state.MessageCount++

                case EventTypeEntityExtracted:
                        entityID := event.AggregateID
                        if entity, ok := event.Payload["entity"]; ok {
                                // Try to unmarshal entity from payload
                                if entityBytes, err := json.Marshal(entity); err == nil {
                                        var e Entity
                                        if err := json.Unmarshal(entityBytes, &e); err == nil {
                                                entityMap[entityID] = &e
                                        }
                                }
                        }

                case EventTypePatternDetected:
                        if event.AggregateType == "pattern" {
                                patternID := event.AggregateID
                                confidence := 0
                                if c, ok := event.Payload["confidence"]; ok {
                                        switch v := c.(type) {
                                        case int:
                                                confidence = v
                                        case float64:
                                                confidence = int(v)
                                        }
                                }
                                patternMap[patternID] = &PatternDetection{
                                        ID:          patternID,
                                        PatternType: fmt.Sprintf("%v", event.Payload["patternType"]),
                                        Confidence:  confidence,
                                        Severity:    fmt.Sprintf("%v", event.Payload["severity"]),
                                        Status:      "active",
                                        LastDetected: event.Timestamp,
                                }
                        }

                case EventTypeAlertGenerated:
                        if id, ok := event.Payload["alertId"]; ok {
                                alertID := fmt.Sprintf("%v", id)
                                alertMap[alertID] = &Alert{
                                        ID:          alertID,
                                        Source:      fmt.Sprintf("%v", event.Payload["source"]),
                                        Severity:    fmt.Sprintf("%v", event.Payload["severity"]),
                                        Title:       fmt.Sprintf("%v", event.Payload["title"]),
                                        Description: fmt.Sprintf("%v", event.Payload["description"]),
                                        Strategy:    fmt.Sprintf("%v", event.Payload["strategy"]),
                                        Timestamp:   event.Timestamp,
                                }
                        }

                case EventTypeAlertAcknowledged:
                        if id, ok := event.Payload["alertId"]; ok {
                                alertID := fmt.Sprintf("%v", id)
                                if alert, ok := alertMap[alertID]; ok {
                                        alert.Acknowledged = true
                                }
                        }

                case EventTypeAlertEscalated:
                        if id, ok := event.Payload["alertId"]; ok {
                                alertID := fmt.Sprintf("%v", id)
                                if alert, ok := alertMap[alertID]; ok {
                                        alert.Escalated = true
                                        alert.Severity = "CRÍTICA"
                                }
                        }

                case EventTypeRiskAssessed:
                        // Track risk assessment for entity
                        if entityID, ok := event.Payload["entityId"]; ok {
                                eid := fmt.Sprintf("%v", entityID)
                                if e, ok := entityMap[eid]; ok {
                                        if score, ok := event.Payload["score"]; ok {
                                                switch v := score.(type) {
                                                case int:
                                                        e.RiskScore = v
                                                case float64:
                                                        e.RiskScore = int(v)
                                                }
                                        }
                                }
                        }
                }
        }

        // Build state from maps
        for _, e := range entityMap {
                state.Entities = append(state.Entities, *e)
        }
        for _, p := range patternMap {
                state.Patterns = append(state.Patterns, *p)
        }
        for _, a := range alertMap {
                state.Alerts = append(state.Alerts, *a)
        }

        state.EntityCount = len(state.Entities)
        state.PatternCount = len(state.Patterns)
        state.AlertCount = len(state.Alerts)

        // Calculate threat score
        state.ThreatScore = ers.calculateReplayThreatScore(state)
        state.ThreatLevel = "LOW"
        switch {
        case state.ThreatScore >= 80:
                state.ThreatLevel = "CRÍTICA"
        case state.ThreatScore >= 60:
                state.ThreatLevel = "ALTA"
        case state.ThreatScore >= 40:
                state.ThreatLevel = "MEDIA"
        case state.ThreatScore >= 20:
                state.ThreatLevel = "BAJA"
        }

        result.State = state
        return result, nil
}

// ReplayAllStreams replays events from all intelligence streams
func (ers *EventReplayService) ReplayAllStreams(ctx context.Context, from time.Time, count int) (map[string]*ReplayResult, error) {
        streams := []string{
                StreamWhatsAppMessages, StreamTelegramMessages, StreamOSINTEvents,
                StreamAnalyzedMessages, StreamIntelEvents, StreamThreatAssessments,
                StreamAlerts, StreamDecisions, StreamPatterns, StreamPredictions, StreamReports,
        }

        results := make(map[string]*ReplayResult)
        for _, stream := range streams {
                req := ReplayRequest{
                        Stream: stream,
                        From:   from,
                        Count:  count,
                }
                result, err := ers.ReplayEvents(ctx, req)
                if err != nil {
                        results[stream] = result
                        continue
                }
                results[stream] = result
        }

        return results, nil
}

// GetEventTimeline returns a chronological timeline of events across streams
func (ers *EventReplayService) GetEventTimeline(ctx context.Context, from, to time.Time, limit int) ([]IntelligenceEvent, error) {
        if limit <= 0 {
                limit = 100
        }

        // Get events from the main intel events stream
        events, err := ers.eventStore.ReplayEvents(ctx, StreamIntelEvents, from, limit)
        if err != nil {
                return nil, fmt.Errorf("failed to get event timeline: %w", err)
        }

        // Filter by end time
        if !to.IsZero() {
                var filtered []IntelligenceEvent
                for _, e := range events {
                        if e.Timestamp.Before(to) || e.Timestamp.Equal(to) {
                                filtered = append(filtered, e)
                        }
                }
                events = filtered
        }

        return events, nil
}

// calculateReplayThreatScore computes a threat score from replayed state
func (ers *EventReplayService) calculateReplayThreatScore(state *ReplayState) int {
        score := 0

        for _, e := range state.Entities {
                switch e.RiskLevel {
                case "critical":
                        score += 15
                case "high":
                        score += 8
                case "medium":
                        score += 3
                }
        }

        for _, p := range state.Patterns {
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
                }
        }

        for _, a := range state.Alerts {
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

        if score > 100 {
                score = 100
        }
        return score
}
