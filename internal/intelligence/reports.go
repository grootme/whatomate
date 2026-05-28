package intelligence

import (
        "context"
        "fmt"
        "sort"
        "strings"
        "time"

        "github.com/google/uuid"
        "github.com/zerodha/logf"
)

// ReportGenerator implements DNA Layer 4: Report Generation
type ReportGenerator struct {
        eventStore *EventStore
        log        logf.Logger
}

// NewReportGenerator creates a new ReportGenerator
func NewReportGenerator(es *EventStore, log logf.Logger) *ReportGenerator {
        return &ReportGenerator{
                eventStore: es,
                log:        log,
        }
}

// GenerateThreatSummary generates a brief threat summary from OSINT data
func (rg *ReportGenerator) GenerateThreatSummary(ctx context.Context, data OSINTSnapshot) (*Report, error) {
        var sections []string
        severity := "INFO"

        // Earthquake summary
        if len(data.Earthquakes) > 0 {
                var eqLines []string
                for _, eq := range data.Earthquakes {
                        eqLines = append(eqLines, fmt.Sprintf("- %s (M%.1f, depth %.1f km) at %s", eq.Location, eq.Magnitude, eq.Depth, eq.Time))
                        if eq.Magnitude >= 6.0 {
                                severity = "ALTA"
                        } else if eq.Magnitude >= 5.0 && severity != "ALTA" {
                                severity = "MEDIA"
                        }
                }
                sections = append(sections, fmt.Sprintf("## Earthquakes (%d)\n%s", len(data.Earthquakes), strings.Join(eqLines, "\n")))
        }

        // Fire summary
        if len(data.Fires) > 0 {
                var fireLines []string
                for _, f := range data.Fires {
                        fireLines = append(fireLines, fmt.Sprintf("- %s (confidence %d%%) at %.2f,%.2f", f.Location, f.Confidence, f.Lat, f.Lon))
                }
                sections = append(sections, fmt.Sprintf("## Active Fires (%d)\n%s", len(data.Fires), strings.Join(fireLines, "\n")))
                if len(data.Fires) > 5 {
                        if severity != "ALTA" && severity != "CRÍTICA" {
                                severity = "MEDIA"
                        }
                }
        }

        // GPS Jamming summary
        if len(data.GPSJamming) > 0 {
                var jamLines []string
                for _, j := range data.GPSJamming {
                        jamLines = append(jamLines, fmt.Sprintf("- %s (%s) at %.2f,%.2f - %s", j.Region, j.Severity, j.Lat, j.Lon, j.Description))
                }
                sections = append(sections, fmt.Sprintf("## GPS Jamming (%d)\n%s", len(data.GPSJamming), strings.Join(jamLines, "\n")))
                if len(data.GPSJamming) > 0 {
                        if severity != "CRÍTICA" {
                                severity = "ALTA"
                        }
                }
        }

        // UAV summary
        if len(data.UAVs) > 0 {
                var uavLines []string
                for _, u := range data.UAVs {
                        uavLines = append(uavLines, fmt.Sprintf("- %s (%s) at altitude %.0f, zone %s", u.Callsign, u.Type, u.Altitude, u.Zone))
                }
                sections = append(sections, fmt.Sprintf("## UAV Activity (%d)\n%s", len(data.UAVs), strings.Join(uavLines, "\n")))
        }

        // SIGINT summary
        if len(data.SIGINT) > 0 {
                var sigLines []string
                for _, s := range data.SIGINT {
                        sigLines = append(sigLines, fmt.Sprintf("- %s (%s) freq %s at %.2f,%.2f", s.Callsign, s.Type, s.Frequency, s.Lat, s.Lon))
                }
                sections = append(sections, fmt.Sprintf("## SIGINT Activity (%d)\n%s", len(data.SIGINT), strings.Join(sigLines, "\n")))
        }

        // LiveUAMap summary
        if len(data.LiveUAMap) > 0 {
                var luaLines []string
                for _, l := range data.LiveUAMap {
                        luaLines = append(luaLines, fmt.Sprintf("- [%s] %s at %.2f,%.2f", l.EventType, l.Title, l.Lat, l.Lon))
                }
                sections = append(sections, fmt.Sprintf("## Conflict Events (%d)\n%s", len(data.LiveUAMap), strings.Join(luaLines, "\n")))
                if len(data.LiveUAMap) > 3 {
                        severity = "CRÍTICA"
                }
        }

        // Weather summary
        if data.Weather != nil {
                sections = append(sections, fmt.Sprintf("## Weather\n- Active alerts: %d", data.Weather.ActiveAlerts))
                if len(data.Weather.ExtremeEvents) > 0 {
                        sections = append(sections, fmt.Sprintf("- Extreme events: %s", strings.Join(data.Weather.ExtremeEvents, ", ")))
                }
        }

        // News summary
        if len(data.News) > 0 {
                var newsLines []string
                for _, n := range data.News {
                        newsLines = append(newsLines, fmt.Sprintf("- [%s] %s (%s)", n.Category, n.Title, n.Source))
                }
                sections = append(sections, fmt.Sprintf("## Recent News (%d)\n%s", len(data.News), strings.Join(newsLines, "\n")))
        }

        content := fmt.Sprintf("# OSINT Threat Summary\nGenerated: %s\n\n%s",
                time.Now().Format(time.RFC1123),
                strings.Join(sections, "\n\n"))

        if len(sections) == 0 {
                content += "\nNo significant OSINT events detected."
        }

        report := &Report{
                ID:          uuid.New().String(),
                Title:       "OSINT Threat Summary",
                Type:        "threat_summary",
                Content:     content,
                Severity:    severity,
                GeneratedAt: time.Now(),
                AgentID:     "agent-reporter",
        }

        // Store report event
        _ = rg.eventStore.Append(ctx, StreamReports, IntelligenceEvent{
                EventType:     EventTypeReportGenerated,
                AggregateID:   report.ID,
                AggregateType: "report",
                Payload: map[string]interface{}{
                        "reportId":   report.ID,
                        "title":      report.Title,
                        "type":       report.Type,
                        "severity":   report.Severity,
                        "contentLen": len(report.Content),
                },
                Timestamp: time.Now(),
        })

        return report, nil
}

// GenerateRiskReport generates a risk analysis report for entities
func (rg *ReportGenerator) GenerateRiskReport(ctx context.Context, entities []Entity, assessments []RiskAssessment) (*Report, error) {
        severity := "INFO"

        // Sort entities by risk score descending
        sortedEntities := make([]Entity, len(entities))
        copy(sortedEntities, entities)
        sort.Slice(sortedEntities, func(i, j int) bool {
                return sortedEntities[i].RiskScore > sortedEntities[j].RiskScore
        })

        var sections []string

        // High-level summary
        critical := 0
        high := 0
        medium := 0
        low := 0
        for _, e := range sortedEntities {
                switch e.RiskLevel {
                case "critical":
                        critical++
                case "high":
                        high++
                case "medium":
                        medium++
                default:
                        low++
                }
        }

        if critical > 0 {
                severity = "CRÍTICA"
        } else if high > 0 {
                severity = "ALTA"
        } else if medium > 0 {
                severity = "MEDIA"
        }

        sections = append(sections, fmt.Sprintf("## Risk Distribution\n- Critical: %d\n- High: %d\n- Medium: %d\n- Low: %d",
                critical, high, medium, low))

        // Top risk entities
        if len(sortedEntities) > 0 {
                var entityLines []string
                limit := 10
                if len(sortedEntities) < limit {
                        limit = len(sortedEntities)
                }
                for i := 0; i < limit; i++ {
                        e := sortedEntities[i]
                        entityLines = append(entityLines, fmt.Sprintf("%d. **%s** (%s) - Risk: %d/100 [%s] (mentioned %d times across %d platforms)",
                                i+1, e.Name, e.Type, e.RiskScore, strings.ToUpper(e.RiskLevel), e.MentionCount, len(e.Sources)))
                }
                sections = append(sections, fmt.Sprintf("## Top Risk Entities\n%s", strings.Join(entityLines, "\n")))
        }

        // Risk assessment details
        if len(assessments) > 0 {
                var assessLines []string
                for _, a := range assessments {
                        assessLines = append(assessLines, fmt.Sprintf("- Entity %s: Score %d (Nature=%d, Volume=%d, Connections=%d, OSINT=%d, Recency=%d)",
                                a.EntityID, a.Score, a.Nature, a.Volume, a.Connections, a.OSINTContext, a.Recency))
                }
                sections = append(sections, fmt.Sprintf("## Risk Assessments\n%s", strings.Join(assessLines, "\n")))
        }

        content := fmt.Sprintf("# Risk Analysis Report\nGenerated: %s\n\n%s",
                time.Now().Format(time.RFC1123),
                strings.Join(sections, "\n\n"))

        report := &Report{
                ID:          uuid.New().String(),
                Title:       "Risk Analysis Report",
                Type:        "risk_analysis",
                Content:     content,
                Severity:    severity,
                GeneratedAt: time.Now(),
                AgentID:     "agent-reporter",
        }

        _ = rg.eventStore.Append(ctx, StreamReports, IntelligenceEvent{
                EventType:     EventTypeReportGenerated,
                AggregateID:   report.ID,
                AggregateType: "report",
                Payload: map[string]interface{}{
                        "reportId":   report.ID,
                        "title":      report.Title,
                        "type":       report.Type,
                        "severity":   report.Severity,
                        "contentLen": len(report.Content),
                },
                Timestamp: time.Now(),
        })

        return report, nil
}

// GeneratePatternReport generates a pattern analysis report
func (rg *ReportGenerator) GeneratePatternReport(ctx context.Context, patterns []PatternDetection) (*Report, error) {
        severity := "INFO"

        // Group patterns by type
        patternByType := make(map[string][]PatternDetection)
        for _, p := range patterns {
                if p.Status != "active" {
                        continue
                }
                patternByType[p.PatternType] = append(patternByType[p.PatternType], p)
        }

        var sections []string

        // Summary
        totalActive := 0
        for _, ps := range patternByType {
                totalActive += len(ps)
        }

        sections = append(sections, fmt.Sprintf("## Pattern Summary\n- Total active patterns: %d\n- Pattern types: %d", totalActive, len(patternByType)))

        // Detail by type
        for pType, ps := range patternByType {
                var lines []string
                for _, p := range ps {
                        lines = append(lines, fmt.Sprintf("- [%s] %s (confidence: %d%%, occurrences: %d, last: %s)",
                                p.Severity, p.Description, p.Confidence, p.Occurrences, p.LastDetected.Format(time.RFC1123)))

                        if p.Severity == "CRÍTICA" {
                                severity = "CRÍTICA"
                        } else if p.Severity == "ALTA" && severity != "CRÍTICA" {
                                severity = "ALTA"
                        } else if p.Severity == "MEDIA" && severity == "INFO" {
                                severity = "MEDIA"
                        }
                }
                sections = append(sections, fmt.Sprintf("## %s Patterns (%d)\n%s",
                        strings.Title(strings.ReplaceAll(pType, "_", " ")), len(ps), strings.Join(lines, "\n")))
        }

        content := fmt.Sprintf("# Pattern Analysis Report\nGenerated: %s\n\n%s",
                time.Now().Format(time.RFC1123),
                strings.Join(sections, "\n\n"))

        if totalActive == 0 {
                content += "\nNo active patterns detected."
        }

        report := &Report{
                ID:          uuid.New().String(),
                Title:       "Pattern Analysis Report",
                Type:        "pattern_report",
                Content:     content,
                Severity:    severity,
                GeneratedAt: time.Now(),
                AgentID:     "agent-reporter",
        }

        _ = rg.eventStore.Append(ctx, StreamReports, IntelligenceEvent{
                EventType:     EventTypeReportGenerated,
                AggregateID:   report.ID,
                AggregateType: "report",
                Payload: map[string]interface{}{
                        "reportId": report.ID,
                        "title":    report.Title,
                        "type":     report.Type,
                        "severity": report.Severity,
                },
                Timestamp: time.Now(),
        })

        return report, nil
}

// GenerateFullReport generates a complete intelligence report combining all data
func (rg *ReportGenerator) GenerateFullReport(ctx context.Context, dashboard *DashboardData, osintData *OSINTSnapshot) (*Report, error) {
        var sections []string
        severity := "INFO"

        // Executive Summary
        sections = append(sections, fmt.Sprintf("## Executive Summary\n- Threat Level: **%s** (score: %d/100)\n- Active Alerts: %d (%d critical)\n- Tracked Entities: %d (%d high-risk)\n- Active Patterns: %d\n- Total Messages Processed: %d",
                dashboard.ThreatLevel, dashboard.ThreatScore,
                dashboard.ActiveAlerts, dashboard.CriticalAlerts,
                dashboard.TotalEntities, dashboard.HighRiskEntities,
                dashboard.ActivePatterns,
                dashboard.ProcessedMessages))

        if dashboard.ThreatScore >= 80 {
                severity = "CRÍTICA"
        } else if dashboard.ThreatScore >= 60 {
                severity = "ALTA"
        } else if dashboard.ThreatScore >= 40 {
                severity = "MEDIA"
        }

        // Agent Status
        var agentLines []string
        for _, a := range dashboard.AgentStates {
                statusIcon := "✅"
                if a.Status == "error" {
                        statusIcon = "❌"
                } else if a.Status == "idle" {
                        statusIcon = "⏳"
                }
                agentLines = append(agentLines, fmt.Sprintf("- %s %s (Layer %d: %s) - Health: %d%%, Processed: %d",
                        statusIcon, a.Name, a.Layer, a.LayerName, a.Health, a.MessagesProcessed))
        }
        if len(agentLines) > 0 {
                sections = append(sections, fmt.Sprintf("## Agent Status\n%s", strings.Join(agentLines, "\n")))
        }

        // Active Alerts
        if len(dashboard.ActiveAlertsList) > 0 {
                var alertLines []string
                for _, a := range dashboard.ActiveAlertsList {
                        ackIcon := "⏳"
                        if a.Acknowledged {
                                ackIcon = "✅"
                        }
                        alertLines = append(alertLines, fmt.Sprintf("- %s [%s] %s - %s (strategy: %s)",
                                ackIcon, a.Severity, a.Title, a.Description, a.Strategy))
                }
                sections = append(sections, fmt.Sprintf("## Active Alerts\n%s", strings.Join(alertLines, "\n")))
        }

        // Top Entities
        if len(dashboard.TopEntities) > 0 {
                var entityLines []string
                for i, e := range dashboard.TopEntities {
                        if i >= 10 {
                                break
                        }
                        entityLines = append(entityLines, fmt.Sprintf("%d. %s (%s) - Risk: %d [%s]",
                                i+1, e.Name, e.Type, e.RiskScore, strings.ToUpper(e.RiskLevel)))
                }
                sections = append(sections, fmt.Sprintf("## Top Entities\n%s", strings.Join(entityLines, "\n")))
        }

        // OSINT Summary
        if osintData != nil {
                osintSummary := rg.summarizeOSINT(osintData)
                if osintSummary != "" {
                        sections = append(sections, osintSummary)
                }
        }

        // Stream Statistics
        if len(dashboard.StreamStats) > 0 {
                var streamLines []string
                for stream, count := range dashboard.StreamStats {
                        streamLines = append(streamLines, fmt.Sprintf("- %s: %d events", stream, count))
                }
                sections = append(sections, fmt.Sprintf("## Event Stream Statistics\n%s", strings.Join(streamLines, "\n")))
        }

        content := fmt.Sprintf("# Full Intelligence Report\nGenerated: %s\n\n%s",
                time.Now().Format(time.RFC1123),
                strings.Join(sections, "\n\n"))

        report := &Report{
                ID:          uuid.New().String(),
                Title:       "Full Intelligence Report",
                Type:        "full_intelligence",
                Content:     content,
                Severity:    severity,
                GeneratedAt: time.Now(),
                AgentID:     "agent-reporter",
        }

        _ = rg.eventStore.Append(ctx, StreamReports, IntelligenceEvent{
                EventType:     EventTypeReportGenerated,
                AggregateID:   report.ID,
                AggregateType: "report",
                Payload: map[string]interface{}{
                        "reportId": report.ID,
                        "title":    report.Title,
                        "type":     report.Type,
                        "severity": report.Severity,
                },
                Timestamp: time.Now(),
        })

        return report, nil
}

// GenerateMaritimeThreatReport generates a maritime-focused threat intelligence report
// covering maritime zone intelligence, vessel activity, and chokepoint analysis
func (rg *ReportGenerator) GenerateMaritimeThreatReport(ctx context.Context, data OSINTSnapshot) (*Report, error) {
        var sections []string
        severity := "INFO"

        // ── Maritime Zone Overview ──
        totalShips := len(data.Ships)
        militaryShips := 0
        tankerShips := 0
        cargoShips := 0
        var shipTypeCounts map[string]int = make(map[string]int)

        for _, s := range data.Ships {
                shipType := strings.ToLower(s.Type)
                shipTypeCounts[s.Type]++
                switch {
                case shipType == "warship" || shipType == "naval" || shipType == "military":
                        militaryShips++
                case strings.Contains(shipType, "tanker"):
                        tankerShips++
                case strings.Contains(shipType, "cargo") || strings.Contains(shipType, "bulk"):
                        cargoShips++
                }
        }

        sections = append(sections, fmt.Sprintf("## Maritime Zone Overview\n- Total tracked vessels: %d\n- Military/Naval: %d\n- Tankers: %d\n- Cargo/Bulk: %d",
                totalShips, militaryShips, tankerShips, cargoShips))

        if militaryShips >= 5 {
                severity = "ALTA"
        } else if militaryShips >= 3 && severity != "ALTA" {
                severity = "MEDIA"
        }
        if totalShips >= 20 {
                if severity != "ALTA" && severity != "CRÍTICA" {
                        severity = "MEDIA"
                }
        }

        // ── Vessel Activity Detail ──
        if totalShips > 0 {
                var vesselLines []string
                limit := 15
                if len(data.Ships) < limit {
                        limit = len(data.Ships)
                }
                for i := 0; i < limit; i++ {
                        s := data.Ships[i]
                        vesselLines = append(vesselLines, fmt.Sprintf("- **%s** [%s] at %.4f,%.4f | Speed: %.1f kn",
                                s.Name, s.Type, s.Lat, s.Lon, s.Speed))
                }
                if totalShips > limit {
                        vesselLines = append(vesselLines, fmt.Sprintf("- ... and %d more vessels", totalShips-limit))
                }
                sections = append(sections, fmt.Sprintf("## Vessel Activity\n%s", strings.Join(vesselLines, "\n")))
        }

        // ── Chokepoint Analysis ──
        // Analyze vessel density near known maritime chokepoints
        type chokepoint struct {
                name     string
                lat, lon float64
                radius   float64 // degrees
        }
        chokepoints := []chokepoint{
                {"Strait of Hormuz", 26.56, 56.25, 2.0},
                {"Strait of Malacca", 1.50, 103.00, 3.0},
                {"Suez Canal", 30.00, 32.55, 1.5},
                {"Panama Canal", 9.08, -79.68, 1.5},
                {"Bab el-Mandeb", 12.58, 43.33, 1.5},
                {"Strait of Gibraltar", 35.90, -5.60, 1.5},
                {"Turkish Straits (Bosphorus)", 41.10, 29.05, 0.5},
                {"Lombok Strait", -8.55, 115.90, 1.5},
                {"Danish Straits", 55.50, 12.50, 2.0},
                {"Taiwan Strait", 24.00, 119.50, 2.5},
        }

        var chokepointLines []string
        for _, cp := range chokepoints {
                nearCount := 0
                militaryNearby := 0
                for _, s := range data.Ships {
                        latDiff := s.Lat - cp.lat
                        if latDiff < 0 {
                                latDiff = -latDiff
                        }
                        lonDiff := s.Lon - cp.lon
                        if lonDiff < 0 {
                                lonDiff = -lonDiff
                        }
                        if latDiff <= cp.radius && lonDiff <= cp.radius {
                                nearCount++
                                shipType := strings.ToLower(s.Type)
                                if shipType == "warship" || shipType == "naval" || shipType == "military" {
                                        militaryNearby++
                                }
                        }
                }
                if nearCount > 0 {
                        detail := fmt.Sprintf("- **%s**: %d vessel(s) nearby", cp.name, nearCount)
                        if militaryNearby > 0 {
                                detail += fmt.Sprintf(" (%d military/naval)", militaryNearby)
                                if severity != "CRÍTICA" {
                                        severity = "ALTA"
                                }
                        }
                        chokepointLines = append(chokepointLines, detail)
                }
        }

        if len(chokepointLines) > 0 {
                sections = append(sections, fmt.Sprintf("## Chokepoint Analysis\n%s", strings.Join(chokepointLines, "\n")))
        } else {
                sections = append(sections, "## Chokepoint Analysis\nNo vessels detected near major maritime chokepoints.")
        }

        // ── Vessel Type Distribution ──
        if len(shipTypeCounts) > 0 {
                var typeLines []string
                for t, c := range shipTypeCounts {
                        typeLines = append(typeLines, fmt.Sprintf("- %s: %d", t, c))
                }
                sections = append(sections, fmt.Sprintf("## Vessel Type Distribution\n%s", strings.Join(typeLines, "\n")))
        }

        // ── Related OSINT Correlations ──
        if len(data.GPSJamming) > 0 {
                var jamLines []string
                for _, j := range data.GPSJamming {
                        jamLines = append(jamLines, fmt.Sprintf("- %s (%s): %s", j.Region, j.Severity, j.Description))
                }
                sections = append(sections, fmt.Sprintf("## GPS/Jamming Impact on Navigation\n%s", strings.Join(jamLines, "\n")))
        }

        if len(data.LiveUAMap) > 0 {
                var conflictLines []string
                for _, c := range data.LiveUAMap {
                        conflictLines = append(conflictLines, fmt.Sprintf("- [%s] %s at %.2f,%.2f", c.EventType, c.Title, c.Lat, c.Lon))
                }
                sections = append(sections, fmt.Sprintf("## Maritime Security Concerns\n%s", strings.Join(conflictLines, "\n")))
                if len(data.LiveUAMap) >= 3 {
                        severity = "CRÍTICA"
                }
        }

        if len(data.News) > 0 {
                var newsLines []string
                for _, n := range data.News {
                        titleLower := strings.ToLower(n.Title)
                        if strings.Contains(titleLower, "ship") || strings.Contains(titleLower, "vessel") ||
                                strings.Contains(titleLower, "port") || strings.Contains(titleLower, "maritime") ||
                                strings.Contains(titleLower, "naval") || strings.Contains(titleLower, "strait") ||
                                strings.Contains(titleLower, "gulf") || strings.Contains(titleLower, "tanker") ||
                                strings.Contains(titleLower, "cargo") || strings.Contains(titleLower, "piracy") ||
                                strings.Contains(titleLower, "sanctions") || strings.Contains(titleLower, "embargo") {
                                newsLines = append(newsLines, fmt.Sprintf("- [%s] %s (%s)", n.Category, n.Title, n.Source))
                        }
                }
                if len(newsLines) > 0 {
                        sections = append(sections, fmt.Sprintf("## Maritime-Related News\n%s", strings.Join(newsLines, "\n")))
                }
        }

        if data.Weather != nil && len(data.Weather.ExtremeEvents) > 0 {
                sections = append(sections, fmt.Sprintf("## Weather Hazards for Maritime Operations\n- Extreme events: %s\n- Active alerts: %d",
                        strings.Join(data.Weather.ExtremeEvents, ", "), data.Weather.ActiveAlerts))
        }

        content := fmt.Sprintf("# Maritime Threat Intelligence Report\nGenerated: %s\n\n%s",
                time.Now().Format(time.RFC1123),
                strings.Join(sections, "\n\n"))

        if len(sections) <= 2 && totalShips == 0 {
                content += "\nNo significant maritime activity detected."
        }

        report := &Report{
                ID:          uuid.New().String(),
                Title:       "Maritime Threat Intelligence Report",
                Type:        "maritime_threat",
                Content:     content,
                Severity:    severity,
                GeneratedAt: time.Now(),
                AgentID:     "agent-reporter",
        }

        _ = rg.eventStore.Append(ctx, StreamReports, IntelligenceEvent{
                EventType:     EventTypeReportGenerated,
                AggregateID:   report.ID,
                AggregateType: "report",
                Payload: map[string]interface{}{
                        "reportId":   report.ID,
                        "title":      report.Title,
                        "type":       report.Type,
                        "severity":   report.Severity,
                        "contentLen": len(report.Content),
                },
                Timestamp: time.Now(),
        })

        return report, nil
}

// GetRecentReports retrieves recent reports from the event store
func (rg *ReportGenerator) GetRecentReports(ctx context.Context, limit int) ([]Report, error) {
        events, err := rg.eventStore.GetRecent(ctx, StreamReports, int64(limit))
        if err != nil {
                return nil, err
        }

        var reports []Report
        for _, event := range events {
                report := Report{
                        ID:          event.AggregateID,
                        Title:       fmt.Sprintf("%v", event.Payload["title"]),
                        Type:        fmt.Sprintf("%v", event.Payload["type"]),
                        Severity:    fmt.Sprintf("%v", event.Payload["severity"]),
                        GeneratedAt: event.Timestamp,
                        AgentID:     "agent-reporter",
                }
                reports = append(reports, report)
        }

        return reports, nil
}

// summarizeOSINT creates a brief summary of OSINT data for full reports
func (rg *ReportGenerator) summarizeOSINT(data *OSINTSnapshot) string {
        var lines []string

        if len(data.Earthquakes) > 0 {
                lines = append(lines, fmt.Sprintf("- Earthquakes: %d active", len(data.Earthquakes)))
        }
        if len(data.Fires) > 0 {
                lines = append(lines, fmt.Sprintf("- Active fires: %d", len(data.Fires)))
        }
        if len(data.GPSJamming) > 0 {
                lines = append(lines, fmt.Sprintf("- GPS jamming zones: %d", len(data.GPSJamming)))
        }
        if len(data.UAVs) > 0 {
                lines = append(lines, fmt.Sprintf("- UAV activities: %d", len(data.UAVs)))
        }
        if len(data.LiveUAMap) > 0 {
                lines = append(lines, fmt.Sprintf("- Conflict events: %d", len(data.LiveUAMap)))
        }
        if len(data.SIGINT) > 0 {
                lines = append(lines, fmt.Sprintf("- SIGINT signals: %d", len(data.SIGINT)))
        }
        if data.Weather != nil {
                lines = append(lines, fmt.Sprintf("- Weather alerts: %d", data.Weather.ActiveAlerts))
        }
        if len(data.News) > 0 {
                lines = append(lines, fmt.Sprintf("- Recent news: %d articles", len(data.News)))
        }
        if len(data.Ships) > 0 {
                lines = append(lines, fmt.Sprintf("- Tracked vessels: %d", len(data.Ships)))
        }
        if len(data.Flights) > 0 {
                lines = append(lines, fmt.Sprintf("- Flight tracks: %d", len(data.Flights)))
        }

        if len(lines) == 0 {
                return ""
        }

        return fmt.Sprintf("## OSINT Overview\n%s", strings.Join(lines, "\n"))
}
