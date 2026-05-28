package intelligence

import (
        "context"
        "fmt"
        "math"
        "sync"
        "time"

        "github.com/google/uuid"
        "github.com/zerodha/logf"
)

// StrategyHandler is the interface that all decision strategies must implement
type StrategyHandler interface {
        ID() string
        Name() string
        Evaluate(ctx StrategyContext) (*StrategyResult, error)
}

// StrategyRegistry manages dynamic strategy registration and lookup
type StrategyRegistry struct {
        strategies map[string]StrategyHandler
        order      []string // Preserves registration order
        log        logf.Logger
        mu         sync.RWMutex
}

// NewStrategyRegistry creates a new StrategyRegistry
func NewStrategyRegistry(log logf.Logger) *StrategyRegistry {
        return &StrategyRegistry{
                strategies: make(map[string]StrategyHandler),
                log:        log,
        }
}

// Register adds a strategy to the registry
func (sr *StrategyRegistry) Register(strategy StrategyHandler) {
        sr.mu.Lock()
        defer sr.mu.Unlock()

        sr.strategies[strategy.ID()] = strategy
        sr.order = append(sr.order, strategy.ID())
        sr.log.Info("Strategy registered", "id", strategy.ID(), "name", strategy.Name())
}

// Get retrieves a strategy by ID
func (sr *StrategyRegistry) Get(id string) (StrategyHandler, bool) {
        sr.mu.RLock()
        defer sr.mu.RUnlock()

        s, ok := sr.strategies[id]
        return s, ok
}

// GetAll returns all registered strategies in order
func (sr *StrategyRegistry) GetAll() []StrategyHandler {
        sr.mu.RLock()
        defer sr.mu.RUnlock()

        strategies := make([]StrategyHandler, 0, len(sr.order))
        for _, id := range sr.order {
                if s, ok := sr.strategies[id]; ok {
                        strategies = append(strategies, s)
                }
        }
        return strategies
}

// EvaluateAll runs all strategies and returns combined results
func (sr *StrategyRegistry) EvaluateAll(ctx StrategyContext) []*StrategyResult {
        sr.mu.RLock()
        defer sr.mu.RUnlock()

        var results []*StrategyResult
        for _, id := range sr.order {
                s, ok := sr.strategies[id]
                if !ok {
                        continue
                }
                result, err := s.Evaluate(ctx)
                if err != nil {
                        sr.log.Error("Strategy evaluation failed", "strategy", s.ID(), "error", err)
                        continue
                }
                if result != nil {
                        results = append(results, result)
                }
        }
        return results
}

// ============================================================
// Strategy 1: Threshold Strategy
// Numeric limits trigger automatic actions
// ============================================================

// ThresholdStrategy triggers alerts when numeric thresholds are breached
type ThresholdStrategy struct {
        thresholds []ThresholdConfig
        eventStore *EventStore
        log        logf.Logger
        mu         sync.RWMutex
}

// NewThresholdStrategy creates a new ThresholdStrategy with default thresholds
func NewThresholdStrategy(es *EventStore, log logf.Logger) *ThresholdStrategy {
        ts := &ThresholdStrategy{
                eventStore: es,
                log:        log,
                thresholds: defaultThresholds(),
        }
        return ts
}

func defaultThresholds() []ThresholdConfig {
        return []ThresholdConfig{
                {ID: "th-001", Name: "Message Volume", Metric: "message_count", Value: 100, Unit: "messages/hour", AlertType: "volume", AlertSeverity: "MEDIA"},
                {ID: "th-002", Name: "High-Risk Entities", Metric: "high_risk_entity_count", Value: 5, Unit: "entities", AlertType: "risk", AlertSeverity: "ALTA"},
                {ID: "th-003", Name: "Critical Alerts", Metric: "critical_alert_count", Value: 3, Unit: "alerts/hour", AlertType: "alert", AlertSeverity: "CRÍTICA"},
                {ID: "th-004", Name: "Fraud Keyword Density", Metric: "fraud_keyword_rate", Value: 0.3, Unit: "ratio", AlertType: "fraud", AlertSeverity: "ALTA"},
                {ID: "th-005", Name: "Cross-Platform Mentions", Metric: "cross_platform_count", Value: 3, Unit: "platforms", AlertType: "correlation", AlertSeverity: "ALTA"},
                {ID: "th-006", Name: "Pattern Occurrences", Metric: "pattern_occurrences", Value: 10, Unit: "occurrences", AlertType: "pattern", AlertSeverity: "MEDIA"},
        }
}

func (ts *ThresholdStrategy) ID() string   { return "threshold" }
func (ts *ThresholdStrategy) Name() string { return "Threshold Strategy" }

func (ts *ThresholdStrategy) Evaluate(ctx StrategyContext) (*StrategyResult, error) {
        // Compute current values (read-only, no lock needed)
        currentValues := ts.computeCurrentValues(ctx)

        // Use full Lock since we modify threshold CurrentValue/LastTriggered
        ts.mu.Lock()
        defer ts.mu.Unlock()

        var breached []ThresholdConfig

        for i, th := range ts.thresholds {
                if cv, ok := currentValues[th.Metric]; ok {
                        ts.thresholds[i].CurrentValue = cv
                        if cv >= th.Value {
                                now := time.Now()
                                ts.thresholds[i].LastTriggered = &now
                                breached = append(breached, ts.thresholds[i])
                        }
                }
        }

        if len(breached) == 0 {
                return &StrategyResult{
                        Action:     "monitor",
                        Severity:   "INFO",
                        Confidence: 90,
                        Reasoning:  "No thresholds breached",
                }, nil
        }

        // Determine overall severity from most severe breach
        severity := "MEDIA"
        action := "alert"
        for _, b := range breached {
                if b.AlertSeverity == "CRÍTICA" {
                        severity = "CRÍTICA"
                        action = "escalate"
                        break
                }
                if b.AlertSeverity == "ALTA" && severity != "CRÍTICA" {
                        severity = "ALTA"
                }
        }

        data := make(map[string]interface{})
        for _, b := range breached {
                data[b.Metric] = map[string]interface{}{
                        "threshold":     b.Value,
                        "currentValue":  b.CurrentValue,
                        "alertSeverity": b.AlertSeverity,
                }
        }

        return &StrategyResult{
                Action:     action,
                Severity:   severity,
                Confidence: 80 + len(breached)*2,
                Reasoning:  fmt.Sprintf("%d threshold(s) breached: %s", len(breached), formatBreachedNames(breached)),
                Data:       data,
        }, nil
}

func (ts *ThresholdStrategy) computeCurrentValues(ctx StrategyContext) map[string]float64 {
        values := make(map[string]float64)

        // Message count
        values["message_count"] = float64(len(ctx.Messages))

        // High risk entity count
        highRisk := 0
        for _, e := range ctx.Entities {
                if e.RiskLevel == "high" || e.RiskLevel == "critical" {
                        highRisk++
                }
        }
        values["high_risk_entity_count"] = float64(highRisk)

        // Fraud keyword density
        totalKeywords := 0
        fraudKeywords := 0
        for _, msg := range ctx.Messages {
                // We re-analyze keywords for threshold computation
                // In production this would use cached results
                fraudKeywords += countFraudKeywords(msg.Content)
                totalKeywords += len(msg.Content) / 5 // rough word estimate
        }
        if totalKeywords > 0 {
                values["fraud_keyword_rate"] = float64(fraudKeywords) / float64(totalKeywords)
        }

        // Cross-platform entity count
        crossPlatform := 0
        for _, e := range ctx.Entities {
                if len(e.Sources) >= 3 {
                        crossPlatform++
                }
        }
        values["cross_platform_count"] = float64(crossPlatform)

        // Pattern occurrences
        totalOccurrences := 0
        for _, p := range ctx.Patterns {
                if p.Status == "active" {
                        totalOccurrences += p.Occurrences
                }
        }
        values["pattern_occurrences"] = float64(totalOccurrences)

        // Critical alert count (from monitoring)
        criticalAlerts := 0
        for _, msg := range ctx.Messages {
                _ = msg // Messages don't carry alert data directly; check patterns
        }
        for _, p := range ctx.Patterns {
                if p.Status == "active" && p.Severity == "CRÍTICA" {
                        criticalAlerts += p.Occurrences
                }
        }
        values["critical_alert_count"] = float64(criticalAlerts)

        return values
}

// UpdateThreshold updates a threshold configuration
func (ts *ThresholdStrategy) UpdateThreshold(id string, value float64) {
        ts.mu.Lock()
        defer ts.mu.Unlock()

        for i, th := range ts.thresholds {
                if th.ID == id {
                        ts.thresholds[i].Value = value
                        ts.log.Info("Threshold updated", "id", id, "newValue", value)
                        return
                }
        }
}

// GetThresholds returns all current threshold configurations
func (ts *ThresholdStrategy) GetThresholds() []ThresholdConfig {
        ts.mu.RLock()
        defer ts.mu.RUnlock()

        result := make([]ThresholdConfig, len(ts.thresholds))
        copy(result, ts.thresholds)
        return result
}

// ============================================================
// Strategy 2: Pattern Strategy
// Cross-channel pattern recognition
// ============================================================

// PatternStrategy detects cross-channel patterns and generates strategy results
type PatternStrategy struct {
        eventStore *EventStore
        log        logf.Logger
}

// NewPatternStrategy creates a new PatternStrategy
func NewPatternStrategy(es *EventStore, log logf.Logger) *PatternStrategy {
        return &PatternStrategy{eventStore: es, log: log}
}

func (ps *PatternStrategy) ID() string   { return "pattern" }
func (ps *PatternStrategy) Name() string { return "Pattern Strategy" }

func (ps *PatternStrategy) Evaluate(ctx StrategyContext) (*StrategyResult, error) {
        if len(ctx.Patterns) == 0 {
                return &StrategyResult{
                        Action:     "monitor",
                        Severity:   "INFO",
                        Confidence: 85,
                        Reasoning:  "No active patterns detected",
                }, nil
        }

        // Analyze pattern severity and coverage
        activePatterns := 0
        criticalPatterns := 0
        highPatterns := 0
        patternTypes := make(map[string]int)
        var highestConfidence int

        for _, p := range ctx.Patterns {
                if p.Status != "active" {
                        continue
                }
                activePatterns++
                patternTypes[p.PatternType]++

                if p.Severity == "CRÍTICA" {
                        criticalPatterns++
                }
                if p.Severity == "ALTA" {
                        highPatterns++
                }
                if p.Confidence > highestConfidence {
                        highestConfidence = p.Confidence
                }
        }

        if activePatterns == 0 {
                return &StrategyResult{
                        Action:     "monitor",
                        Severity:   "INFO",
                        Confidence: 85,
                        Reasoning:  "No active patterns",
                }, nil
        }

        // Determine action based on pattern severity
        action := "alert"
        severity := "MEDIA"
        confidence := highestConfidence

        if criticalPatterns > 0 {
                action = "escalate"
                severity = "CRÍTICA"
        } else if highPatterns > 0 {
                severity = "ALTA"
        }

        // Multiple pattern types = higher confidence
        if len(patternTypes) >= 3 {
                confidence = min(confidence+10, 98)
        }

        return &StrategyResult{
                Action:     action,
                Severity:   severity,
                Confidence: confidence,
                Reasoning:  fmt.Sprintf("Active patterns: %d (%d critical, %d high), types: %v", activePatterns, criticalPatterns, highPatterns, patternTypes),
                Data: map[string]interface{}{
                        "activePatterns":  activePatterns,
                        "criticalPatterns": criticalPatterns,
                        "patternTypes":    patternTypes,
                },
        }, nil
}

// ============================================================
// Strategy 3: Risk Scoring Strategy
// Weighted model: Nature 35%, Volume 25%, Connections 20%, OSINT 15%, Recency 5%
// ============================================================

// RiskScoringStrategy computes risk scores using a weighted multi-factor model
type RiskScoringStrategy struct {
        eventStore *EventStore
        log        logf.Logger
}

// NewRiskScoringStrategy creates a new RiskScoringStrategy
func NewRiskScoringStrategy(es *EventStore, log logf.Logger) *RiskScoringStrategy {
        return &RiskScoringStrategy{eventStore: es, log: log}
}

func (rss *RiskScoringStrategy) ID() string   { return "risk_scoring" }
func (rss *RiskScoringStrategy) Name() string { return "Risk Scoring Strategy" }

func (rss *RiskScoringStrategy) Evaluate(ctx StrategyContext) (*StrategyResult, error) {
        if len(ctx.Entities) == 0 {
                return &StrategyResult{
                        Action:     "monitor",
                        Severity:   "INFO",
                        Confidence: 80,
                        Reasoning:  "No entities to evaluate",
                }, nil
        }

        // Calculate risk for each entity
        var assessments []RiskAssessment
        var highestRisk *RiskAssessment

        for _, entity := range ctx.Entities {
                assessment := rss.assessRisk(entity, ctx)

                // Store risk assessment event
                _ = rss.eventStore.Append(context.Background(), StreamThreatAssessments, IntelligenceEvent{
                        EventType:     EventTypeRiskAssessed,
                        AggregateID:   entity.ID,
                        AggregateType: "entity",
                        Payload: map[string]interface{}{
                                "entityId":     entity.ID,
                                "entityName":   entity.Name,
                                "score":        assessment.Score,
                                "nature":       assessment.Nature,
                                "volume":       assessment.Volume,
                                "connections":  assessment.Connections,
                                "osintContext":  assessment.OSINTContext,
                                "recency":      assessment.Recency,
                                "riskLevel":    entity.RiskLevel,
                        },
                        Timestamp: time.Now(),
                })

                assessments = append(assessments, assessment)

                if highestRisk == nil || assessment.Score > highestRisk.Score {
                        highestRisk = &assessment
                }
        }

        if highestRisk == nil {
                return &StrategyResult{
                        Action:     "monitor",
                        Severity:   "INFO",
                        Confidence: 80,
                        Reasoning:  "No risk assessments generated",
                }, nil
        }

        // Determine action based on highest risk
        action := "monitor"
        severity := "INFO"
        confidence := highestRisk.Score

        switch {
        case highestRisk.Score >= 80:
                action = "escalate"
                severity = "CRÍTICA"
        case highestRisk.Score >= 60:
                action = "alert"
                severity = "ALTA"
        case highestRisk.Score >= 40:
                action = "alert"
                severity = "MEDIA"
        }

        return &StrategyResult{
                Action:     action,
                Severity:   severity,
                Confidence: confidence,
                Reasoning:  fmt.Sprintf("Risk assessment: %d entities evaluated, highest risk=%d (entity %s)", len(assessments), highestRisk.Score, highestRisk.EntityID),
                Data: map[string]interface{}{
                        "assessments": assessments,
                        "highestRisk": highestRisk,
                },
        }, nil
}

// assessRisk computes a weighted risk score for an entity
func (rss *RiskScoringStrategy) assessRisk(entity Entity, ctx StrategyContext) RiskAssessment {
        // Nature factor (35%) - based on entity type and keywords
        nature := rss.computeNatureScore(entity, ctx)

        // Volume factor (25%) - based on mention count
        volume := rss.computeVolumeScore(entity)

        // Connections factor (20%) - based on cross-platform presence
        connections := rss.computeConnectionsScore(entity)

        // OSINT context factor (15%) - based on OSINT data correlation
        osintContext := rss.computeOSINTScore(entity, ctx)

        // Recency factor (5%) - based on how recently the entity was seen
        recency := rss.computeRecencyScore(entity)

        // Weighted sum
        score := int(float64(nature)*0.35 +
                float64(volume)*0.25 +
                float64(connections)*0.20 +
                float64(osintContext)*0.15 +
                float64(recency)*0.05)

        if score > 100 {
                score = 100
        }

        return RiskAssessment{
                ID:           uuid.New().String(),
                EntityID:     entity.ID,
                Score:        score,
                Nature:       nature,
                Volume:       volume,
                Connections:  connections,
                OSINTContext: osintContext,
                Recency:      recency,
                Strategy:     "risk_scoring",
                Reasoning:    fmt.Sprintf("Nature=%d(35%%), Volume=%d(25%%), Connections=%d(20%%), OSINT=%d(15%%), Recency=%d(5%%)", nature, volume, connections, osintContext, recency),
                Timestamp:    time.Now(),
        }
}

func (rss *RiskScoringStrategy) computeNatureScore(entity Entity, ctx StrategyContext) int {
        score := 10
        switch entity.Type {
        case "crypto_wallet":
                score = 60
        case "organization":
                score = 50
        case "person":
                score = 30
        case "location":
                score = 20
        case "phone":
                score = 25
        case "email":
                score = 20
        case "url":
                score = 35
        }

        // Boost if entity appears in high-severity patterns
        for _, pattern := range ctx.Patterns {
                if pattern.Status != "active" {
                        continue
                }
                for _, eID := range pattern.EntityIDs {
                        if eID == entity.ID {
                                score += 15
                                break
                        }
                }
        }

        return min(score, 100)
}

func (rss *RiskScoringStrategy) computeVolumeScore(entity Entity) int {
        // Score based on mention count
        switch {
        case entity.MentionCount >= 20:
                return 90
        case entity.MentionCount >= 10:
                return 70
        case entity.MentionCount >= 5:
                return 50
        case entity.MentionCount >= 2:
                return 30
        default:
                return 10
        }
}

func (rss *RiskScoringStrategy) computeConnectionsScore(entity Entity) int {
        // Score based on number of sources/platforms
        switch len(entity.Sources) {
        case 0:
                return 5
        case 1:
                return 15
        case 2:
                return 40
        case 3:
                return 65
        default:
                return min(60+len(entity.Sources)*10, 100)
        }
}

func (rss *RiskScoringStrategy) computeOSINTScore(entity Entity, ctx StrategyContext) int {
        if ctx.OSINTData == nil {
                return 10 // No OSINT data available
        }

        score := 10

        // Boost if there are active OSINT events that might correlate
        osintEventCount := 0
        osintEventCount += len(ctx.OSINTData.Earthquakes)
        osintEventCount += len(ctx.OSINTData.Fires)
        osintEventCount += len(ctx.OSINTData.GPSJamming)
        osintEventCount += len(ctx.OSINTData.UAVs)
        osintEventCount += len(ctx.OSINTData.LiveUAMap)
        osintEventCount += len(ctx.OSINTData.SIGINT)

        if osintEventCount > 0 {
                score += min(osintEventCount*5, 50)
        }

        if ctx.OSINTData.Weather != nil && ctx.OSINTData.Weather.ActiveAlerts > 0 {
                score += 10
        }

        return min(score, 100)
}

func (rss *RiskScoringStrategy) computeRecencyScore(entity Entity) int {
        if entity.LastSeen.IsZero() {
                return 5
        }

        // More recent = higher score
        hoursAgo := time.Since(entity.LastSeen).Hours()
        switch {
        case hoursAgo <= 1:
                return 90
        case hoursAgo <= 6:
                return 70
        case hoursAgo <= 24:
                return 50
        case hoursAgo <= 72:
                return 30
        default:
                return 10
        }
}

// ============================================================
// Strategy 4: Consensus Strategy
// Multi-agent voting with reputation weights
// ============================================================

// ConsensusAgent represents a voting agent in the consensus system
type ConsensusAgent struct {
        ID         string
        Name       string
        Weight     float64 // Reputation-based weight
        Role       string  // "analyst", "investigator", "supervisor", "auditor"
}

// ConsensusStrategy implements multi-agent voting for decision making
type ConsensusStrategy struct {
        eventStore  *EventStore
        log         logf.Logger
        agents      []ConsensusAgent
        analysisEng *AnalysisEngine // Shared analysis engine for keyword detection
}

// NewConsensusStrategy creates a new ConsensusStrategy with default agents
func NewConsensusStrategy(es *EventStore, log logf.Logger) *ConsensusStrategy {
        return &ConsensusStrategy{
                eventStore:  es,
                log:         log,
                analysisEng: NewAnalysisEngine(es, log),
                agents: []ConsensusAgent{
                        {ID: "agent-analyst", Name: "Analyst Agent", Weight: 1.0, Role: "analyst"},
                        {ID: "agent-investigator", Name: "Investigator Agent", Weight: 1.2, Role: "investigator"},
                        {ID: "agent-supervisor", Name: "Supervisor Agent", Weight: 1.5, Role: "supervisor"},
                        {ID: "agent-auditor", Name: "Auditor Agent", Weight: 0.8, Role: "auditor"},
                },
        }
}

func (cs *ConsensusStrategy) ID() string   { return "consensus" }
func (cs *ConsensusStrategy) Name() string { return "Consensus Strategy" }

func (cs *ConsensusStrategy) Evaluate(ctx StrategyContext) (*StrategyResult, error) {
        var votes []ConsensusVote

        // Each agent votes based on the context
        for _, agent := range cs.agents {
                vote := cs.agentVote(agent, ctx)
                votes = append(votes, vote)

                // Store vote event
                _ = cs.eventStore.Append(context.Background(), StreamDecisions, IntelligenceEvent{
                        EventType:     EventTypeConsensusVote,
                        AggregateID:   uuid.New().String(),
                        AggregateType: "consensus",
                        Payload: map[string]interface{}{
                                "agentId":    agent.ID,
                                "agentName":  agent.Name,
                                "vote":       vote.Vote,
                                "confidence": vote.Confidence,
                                "weight":     vote.Weight,
                                "reasoning":  vote.Reasoning,
                        },
                        Timestamp: time.Now(),
                })
        }

        // Count weighted votes
        favorScore := 0.0
        contraScore := 0.0
        abstainScore := 0.0
        totalWeight := 0.0
        favorCount := 0

        for _, v := range votes {
                totalWeight += v.Weight
                switch v.Vote {
                case "favor":
                        favorScore += v.Weight * float64(v.Confidence) / 100.0
                        favorCount++
                case "contra":
                        contraScore += v.Weight * float64(v.Confidence) / 100.0
                case "abstencion":
                        abstainScore += v.Weight * float64(v.Confidence) / 100.0
                }
        }

        // Determine consensus
        action := "dismiss"
        severity := "INFO"
        confidence := 50
        reasoning := ""

        switch favorCount {
        case 4: // 4/4 unanimous
                action = "alert"
                severity = "ALTA"
                confidence = 95
                reasoning = "Unanimous consensus (4/4): automatic action"
        case 3: // 3/4 supermajority
                action = "alert"
                severity = "MEDIA"
                confidence = 80
                reasoning = "Supermajority consensus (3/4): automatic action with notification"
        case 2: // 2/4 simple majority
                action = "monitor"
                severity = "MEDIA"
                confidence = 60
                reasoning = "Simple majority (2/4): requires human review"
        case 1: // 1/4 minority
                action = "dismiss"
                severity = "INFO"
                confidence = 30
                reasoning = "Minority support (1/4): likely false positive"
        default: // 0/4 no support
                action = "dismiss"
                severity = "INFO"
                confidence = 20
                reasoning = "No support (0/4): dismissed"
        }

        // Factor in weighted scores
        if favorScore > contraScore*2 {
                if action == "monitor" {
                        action = "alert"
                }
        }

        return &StrategyResult{
                Action:     action,
                Severity:   severity,
                Confidence: confidence,
                Reasoning:  reasoning,
                Data: map[string]interface{}{
                        "votes":       votes,
                        "favorScore":  favorScore,
                        "contraScore": contraScore,
                        "favorCount":  favorCount,
                },
        }, nil
}

// agentVote simulates an individual agent's vote
func (cs *ConsensusStrategy) agentVote(agent ConsensusAgent, ctx StrategyContext) ConsensusVote {
        // Each agent uses different criteria to vote
        var vote string
        confidence := 50
        reasoning := ""

        switch agent.Role {
        case "analyst":
                // Analyst focuses on message patterns and keywords
                riskIndicators := 0
                for _, msg := range ctx.Messages {
                        if len(msg.Content) > 0 {
                                kw := cs.analysisEng.DetectKeywords(msg.Content)
                                for _, k := range kw {
                                        if k.Category == "fraud" || k.Category == "scam" || k.Category == "laundering" {
                                                riskIndicators++
                                        }
                                }
                        }
                }
                if riskIndicators >= 3 {
                        vote = "favor"
                        confidence = 70 + min(riskIndicators*3, 25)
                        reasoning = fmt.Sprintf("Analyst: %d risk indicators detected in messages", riskIndicators)
                } else if riskIndicators >= 1 {
                        vote = "abstencion"
                        confidence = 50
                        reasoning = fmt.Sprintf("Analyst: Some risk indicators (%d) but below threshold", riskIndicators)
                } else {
                        vote = "contra"
                        confidence = 60
                        reasoning = "Analyst: No significant risk indicators in messages"
                }

        case "investigator":
                // Investigator focuses on entity connections and cross-platform activity
                crossPlatform := 0
                for _, e := range ctx.Entities {
                        if len(e.Sources) >= 2 {
                                crossPlatform++
                        }
                }
                if crossPlatform >= 2 {
                        vote = "favor"
                        confidence = 65 + crossPlatform*5
                        reasoning = fmt.Sprintf("Investigator: %d entities active across multiple platforms", crossPlatform)
                } else if crossPlatform == 1 {
                        vote = "abstencion"
                        confidence = 45
                        reasoning = "Investigator: Limited cross-platform activity"
                } else {
                        vote = "contra"
                        confidence = 55
                        reasoning = "Investigator: No cross-platform entity activity"
                }

        case "supervisor":
                // Supervisor looks at overall threat landscape and OSINT
                threatLevel := 0
                if ctx.OSINTData != nil {
                        threatLevel += len(ctx.OSINTData.GPSJamming) * 5
                        threatLevel += len(ctx.OSINTData.UAVs) * 3
                        threatLevel += len(ctx.OSINTData.LiveUAMap) * 4
                        threatLevel += len(ctx.OSINTData.SIGINT) * 5
                }
                activeCritical := 0
                for _, p := range ctx.Patterns {
                        if p.Severity == "CRÍTICA" && p.Status == "active" {
                                activeCritical++
                        }
                }
                threatLevel += activeCritical * 20

                if threatLevel >= 30 {
                        vote = "favor"
                        confidence = min(60+threatLevel, 95)
                        reasoning = fmt.Sprintf("Supervisor: High threat level (score %d), %d critical patterns", threatLevel, activeCritical)
                } else if threatLevel >= 10 {
                        vote = "abstencion"
                        confidence = 50
                        reasoning = fmt.Sprintf("Supervisor: Moderate threat level (score %d)", threatLevel)
                } else {
                        vote = "contra"
                        confidence = 60
                        reasoning = "Supervisor: Low threat level"
                }

        case "auditor":
                // Auditor focuses on data quality and false positive rate
                entityCount := len(ctx.Entities)
                messageCount := len(ctx.Messages)
                patternCount := len(ctx.Patterns)

                // High data volume with few patterns = likely false positives
                if entityCount > 0 && patternCount == 0 {
                        vote = "contra"
                        confidence = 70
                        reasoning = "Auditor: Entities detected but no patterns, possible false positives"
                } else if messageCount < 3 && patternCount > 0 {
                        vote = "contra"
                        confidence = 65
                        reasoning = "Auditor: Patterns detected on insufficient data, likely false positives"
                } else if patternCount > 0 && entityCount > 0 {
                        vote = "favor"
                        confidence = 60
                        reasoning = "Auditor: Patterns and entities corroborate each other"
                } else {
                        vote = "abstencion"
                        confidence = 40
                        reasoning = "Auditor: Insufficient data for quality assessment"
                }
        }

        return ConsensusVote{
                AgentID:    agent.ID,
                AgentName:  agent.Name,
                Vote:       vote,
                Confidence: confidence,
                Weight:     agent.Weight,
                Reasoning:  reasoning,
        }
}

// ============================================================
// Strategy 5: Predictive Strategy
// Trend analysis with Holt-Winters triple exponential smoothing
// ============================================================

// PredictiveStrategy uses time-series forecasting to predict future values
type PredictiveStrategy struct {
        eventStore *EventStore
        log        logf.Logger
        // Historical data points for Holt-Winters
        history map[string][]float64
        mu      sync.RWMutex
}

// NewPredictiveStrategy creates a new PredictiveStrategy
func NewPredictiveStrategy(es *EventStore, log logf.Logger) *PredictiveStrategy {
        return &PredictiveStrategy{
                eventStore: es,
                log:        log,
                history:    make(map[string][]float64),
        }
}

func (ps *PredictiveStrategy) ID() string   { return "predictive" }
func (ps *PredictiveStrategy) Name() string { return "Predictive Strategy" }

func (ps *PredictiveStrategy) Evaluate(ctx StrategyContext) (*StrategyResult, error) {
        // Compute current metrics
        currentMetrics := map[string]float64{
                "message_volume": float64(len(ctx.Messages)),
                "entity_count":   float64(len(ctx.Entities)),
                "pattern_count":  float64(len(ctx.Patterns)),
        }

        // Update history
        ps.mu.Lock()
        for metric, value := range currentMetrics {
                ps.history[metric] = append(ps.history[metric], value)
                // Keep last 100 data points
                if len(ps.history[metric]) > 100 {
                        ps.history[metric] = ps.history[metric][len(ps.history[metric])-100:]
                }
        }
        ps.mu.Unlock()

        // Make predictions
        var predictions []Prediction
        alertPredicted := false
        predictedMetric := ""

        for metric, values := range ps.history {
                if len(values) < 3 {
                        continue // Need at least 3 data points
                }

                ps.mu.RLock()
                predicted, confidence := ps.holtWintersForecast(values, 0.3, 0.1, 0.1, 7) // 7 periods ahead
                ps.mu.RUnlock()

                pred := Prediction{
                        ID:          uuid.New().String(),
                        Metric:      metric,
                        Period:      "7-period",
                        PredictedAt: time.Now(),
                        TargetTime:  time.Now().Add(7 * time.Hour), // Assuming hourly data
                        Value:       predicted,
                        Confidence:  confidence,
                }
                predictions = append(predictions, pred)

                // Store prediction event
                _ = ps.eventStore.Append(context.Background(), StreamPredictions, IntelligenceEvent{
                        EventType:     EventTypePredictionMade,
                        AggregateID:   pred.ID,
                        AggregateType: "prediction",
                        Payload: map[string]interface{}{
                                "metric":     metric,
                                "predicted":  predicted,
                                "confidence": confidence,
                                "current":    currentMetrics[metric],
                        },
                        Timestamp: time.Now(),
                })

                // Check if predicted value exceeds current by significant margin
                current := currentMetrics[metric]
                if current > 0 && predicted > current*1.5 && confidence > 0.6 {
                        alertPredicted = true
                        predictedMetric = metric
                }
        }

        if alertPredicted {
                return &StrategyResult{
                        Action:     "alert",
                        Severity:   "MEDIA",
                        Confidence: 70,
                        Reasoning:  fmt.Sprintf("Predictive model forecasts significant increase in '%s'", predictedMetric),
                        Data: map[string]interface{}{
                                "predictions": predictions,
                        },
                }, nil
        }

        return &StrategyResult{
                Action:     "monitor",
                Severity:   "INFO",
                Confidence: 75,
                Reasoning:  fmt.Sprintf("Predictive analysis: %d metrics forecasted, no significant trends detected", len(predictions)),
                Data: map[string]interface{}{
                        "predictions": predictions,
                },
        }, nil
}

// holtWintersForecast implements Holt-Winters triple exponential smoothing
// alpha: level smoothing, beta: trend smoothing, gamma: seasonality smoothing
func (ps *PredictiveStrategy) holtWintersForecast(data []float64, alpha, beta, gamma float64, periodsAhead int) (float64, float64) {
        n := len(data)
        if n < 3 {
                return data[n-1], 0.3 // Low confidence with insufficient data
        }

        // Simple Holt-Winters without seasonality (double exponential smoothing)
        // since we need at least 2 full seasons for proper seasonal decomposition

        // Initialize level and trend
        level := data[0]
        trend := data[1] - data[0]

        // Smoothing
        for i := 1; i < n; i++ {
                newLevel := alpha*data[i] + (1-alpha)*(level+trend)
                newTrend := beta*(newLevel-level) + (1-beta)*trend
                level = newLevel
                trend = newTrend
        }

        // Forecast
        forecast := level + float64(periodsAhead)*trend

        // Ensure non-negative for count metrics
        if forecast < 0 {
                forecast = 0
        }

        // Calculate confidence based on forecast error
        var sse float64
        predicted := data[0]
        for i := 1; i < n; i++ {
                predicted = level + trend // rough approximation
                err := data[i] - predicted
                sse += err * err
        }

        // RMSE-based confidence
        rmse := math.Sqrt(sse / float64(n))
        mean := 0.0
        for _, v := range data {
                mean += v
        }
        mean /= float64(n)

        confidence := 0.5
        if mean > 0 {
                cv := rmse / mean // Coefficient of variation
                confidence = 1.0 - math.Min(cv, 0.8)
        }

        return forecast, confidence
}

// ============================================================
// Strategy 6: Adaptive Strategy
// Self-adjusting thresholds based on FPR (False Positive Rate) feedback
// ============================================================

// AdaptiveStrategy adjusts thresholds based on feedback to minimize false positives
type AdaptiveStrategy struct {
        eventStore       *EventStore
        log              logf.Logger
        falsePositiveLog map[string]int // metric -> false positive count
        totalAlertLog    map[string]int // metric -> total alert count
        adjustmentFactor float64        // How much to adjust thresholds (0.0-1.0)
        mu               sync.RWMutex
}

// NewAdaptiveStrategy creates a new AdaptiveStrategy
func NewAdaptiveStrategy(es *EventStore, log logf.Logger) *AdaptiveStrategy {
        return &AdaptiveStrategy{
                eventStore:       es,
                log:              log,
                falsePositiveLog: make(map[string]int),
                totalAlertLog:    make(map[string]int),
                adjustmentFactor: 0.1, // 10% adjustment per feedback cycle
        }
}

func (as *AdaptiveStrategy) ID() string   { return "adaptive" }
func (as *AdaptiveStrategy) Name() string { return "Adaptive Strategy" }

func (as *AdaptiveStrategy) Evaluate(ctx StrategyContext) (*StrategyResult, error) {
        // The adaptive strategy evaluates the current FPR and adjusts thresholds
        as.mu.RLock()
        defer as.mu.RUnlock()

        // Compute current FPR for each metric
        fprByMetric := make(map[string]float64)
        for metric, totalAlerts := range as.totalAlertLog {
                if totalAlerts > 0 {
                        fprByMetric[metric] = float64(as.falsePositiveLog[metric]) / float64(totalAlerts)
                }
        }

        // Determine if any adjustments are needed
        adjustmentsNeeded := 0
        adjustedMetrics := map[string]interface{}{}

        for metric, fpr := range fprByMetric {
                if fpr > 0.3 { // FPR too high - need to raise thresholds
                        adjustmentsNeeded++
                        adjustedMetrics[metric] = map[string]interface{}{
                                "currentFPR":     fpr,
                                "action":         "increase_threshold",
                                "adjustment":     as.adjustmentFactor,
                                "recommendation": fmt.Sprintf("Increase threshold by %.0f%% to reduce FPR from %.1f%%", as.adjustmentFactor*100, fpr*100),
                        }
                } else if fpr > 0 && fpr < 0.05 { // FPR very low - might be missing true positives
                        adjustmentsNeeded++
                        adjustedMetrics[metric] = map[string]interface{}{
                                "currentFPR":     fpr,
                                "action":         "decrease_threshold",
                                "adjustment":     as.adjustmentFactor,
                                "recommendation": fmt.Sprintf("Consider decreasing threshold (FPR only %.1f%%, may miss true positives)", fpr*100),
                        }
                }
        }

        if adjustmentsNeeded > 0 {
                // Store threshold adjustment event
                _ = as.eventStore.Append(context.Background(), StreamDecisions, IntelligenceEvent{
                        EventType:     EventTypeThresholdAdjusted,
                        AggregateID:   uuid.New().String(),
                        AggregateType: "adaptive_threshold",
                        Payload: map[string]interface{}{
                                "adjustments": adjustedMetrics,
                                "fprByMetric": fprByMetric,
                        },
                        Timestamp: time.Now(),
                })

                return &StrategyResult{
                        Action:     "monitor",
                        Severity:   "INFO",
                        Confidence: 70,
                        Reasoning:  fmt.Sprintf("Adaptive strategy: %d threshold adjustment(s) recommended based on FPR analysis", adjustmentsNeeded),
                        Data:       adjustedMetrics,
                }, nil
        }

        return &StrategyResult{
                Action:     "monitor",
                Severity:   "INFO",
                Confidence: 80,
                Reasoning:  "Adaptive strategy: thresholds are well-calibrated (FPR within acceptable range)",
                Data: map[string]interface{}{
                        "fprByMetric": fprByMetric,
                },
        }, nil
}

// RecordFeedback records alert feedback (true positive or false positive) for adaptive learning
func (as *AdaptiveStrategy) RecordFeedback(metric string, isFalsePositive bool) {
        as.mu.Lock()
        defer as.mu.Unlock()

        as.totalAlertLog[metric]++
        if isFalsePositive {
                as.falsePositiveLog[metric]++
        }

        as.log.Info("Adaptive feedback recorded", "metric", metric, "isFP", isFalsePositive,
                "totalAlerts", as.totalAlertLog[metric], "fpCount", as.falsePositiveLog[metric])
}

// GetFPR returns the current false positive rate for a metric
func (as *AdaptiveStrategy) GetFPR(metric string) float64 {
        as.mu.RLock()
        defer as.mu.RUnlock()

        total := as.totalAlertLog[metric]
        if total == 0 {
                return 0
        }
        return float64(as.falsePositiveLog[metric]) / float64(total)
}

// GetAllFPRs returns FPR data for all tracked metrics
func (as *AdaptiveStrategy) GetAllFPRs() map[string]float64 {
        as.mu.RLock()
        defer as.mu.RUnlock()

        result := make(map[string]float64, len(as.totalAlertLog))
        for metric, total := range as.totalAlertLog {
                if total > 0 {
                        result[metric] = float64(as.falsePositiveLog[metric]) / float64(total)
                } else {
                        result[metric] = 0
                }
        }
        return result
}

// ResetFeedback clears all feedback data for a fresh start
func (as *AdaptiveStrategy) ResetFeedback() {
        as.mu.Lock()
        defer as.mu.Unlock()

        as.falsePositiveLog = make(map[string]int)
        as.totalAlertLog = make(map[string]int)
        as.log.Info("Adaptive feedback data reset")
}

// Helper functions

func min(a, b int) int {
        if a < b {
                return a
        }
        return b
}

func formatBreachedNames(breached []ThresholdConfig) string {
        names := make([]string, len(breached))
        for i, b := range breached {
                names[i] = b.Name
        }
        return fmt.Sprintf("%v", names)
}

func countFraudKeywords(content string) int {
        ae := &AnalysisEngine{}
        keywords := ae.DetectKeywords(content)
        count := 0
        for _, kw := range keywords {
                if kw.Category == "fraud" || kw.Category == "scam" || kw.Category == "laundering" {
                        count += kw.Count
                }
        }
        return count
}
