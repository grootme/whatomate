package intelligence

import "time"

// DNALayer represents one of the 4 DNA processing layers
type DNALayer int

const (
        LayerIngestion DNALayer = iota + 1
        LayerAnalysis
        LayerMonitoring
        LayerReports
)

// IntelligenceEvent represents an event in the event sourcing system
type IntelligenceEvent struct {
        ID            string                 `json:"id"`
        EventType     string                 `json:"eventType"`
        AggregateID   string                 `json:"aggregateId"`
        AggregateType string                 `json:"aggregateType"`
        Stream        string                 `json:"stream"`
        Payload       map[string]interface{} `json:"payload"`
        Metadata      map[string]interface{} `json:"metadata,omitempty"`
        Timestamp     time.Time              `json:"timestamp"`
        Processed     bool                   `json:"processed"`
}

// Event streams
const (
        StreamWhatsAppMessages  = "whatomate:whatsapp_messages"
        StreamTelegramMessages  = "whatomate:telegram_messages"
        StreamOSINTEvents       = "whatomate:osint_events"
        StreamAnalyzedMessages  = "whatomate:analyzed_messages"
        StreamIntelEvents       = "whatomate:intel_events"
        StreamThreatAssessments = "whatomate:threat_assessments"
        StreamAlerts            = "whatomate:alerts"
        StreamDecisions         = "whatomate:decisions"
        StreamPatterns          = "whatomate:patterns"
        StreamPredictions       = "whatomate:predictions"
        StreamReports           = "whatomate:reports"
)

// Event types
const (
        EventTypeMessageIngested   = "message.ingested"
        EventTypeMessageAnalyzed   = "message.analyzed"
        EventTypeEntityExtracted   = "entity.extracted"
        EventTypePatternDetected   = "pattern.detected"
        EventTypeCorrelationFound  = "correlation.found"
        EventTypeAlertGenerated    = "alert.generated"
        EventTypeAlertAcknowledged = "alert.acknowledged"
        EventTypeAlertEscalated    = "alert.escalated"
        EventTypeRiskAssessed      = "risk.assessed"
        EventTypeDecisionMade      = "decision.made"
        EventTypeReportGenerated   = "report.generated"
        EventTypeOSINTFetched      = "osint.fetched"
        EventTypePredictionMade    = "prediction.made"
        EventTypeThresholdBreached = "threshold.breached"
        EventTypeThresholdAdjusted = "threshold.adjusted"
        EventTypeConsensusVote     = "consensus.vote"
        EventTypeAgentHeartbeat    = "agent.heartbeat"
)

// RawMessage represents an ingested message from any source
type RawMessage struct {
        ID          string                 `json:"id"`
        Source      string                 `json:"source"` // "whatsapp", "telegram", "osint"
        SourceID    string                 `json:"sourceId"`
        ChannelName string                 `json:"channelName"`
        ChannelID   string                 `json:"channelId"`
        SenderName  string                 `json:"senderName"`
        Content     string                 `json:"content"`
        ContentHash string                 `json:"contentHash"`
        Timestamp   time.Time              `json:"timestamp"`
        Metadata    map[string]interface{} `json:"metadata,omitempty"`
}

// Entity represents an extracted entity
type Entity struct {
        ID           string    `json:"id"`
        Name         string    `json:"name"`
        Type         string    `json:"type"` // "person", "organization", "location", "crypto_wallet"
        RiskScore    int       `json:"riskScore"`    // 0-100
        RiskLevel    string    `json:"riskLevel"`    // "low", "medium", "high", "critical"
        MentionCount int       `json:"mentionCount"`
        LastSeen     time.Time `json:"lastSeen"`
        Sources      []string  `json:"sources"`
        Lat          float64   `json:"lat,omitempty"` // Optional geospatial latitude
        Lon          float64   `json:"lon,omitempty"` // Optional geospatial longitude
}

// PatternDetection represents a detected pattern
type PatternDetection struct {
        ID           string    `json:"id"`
        PatternType  string    `json:"patternType"`  // "fraud", "laundering", "disinformation", "crypto_manipulation", "irregular_migration"
        Confidence   int       `json:"confidence"`   // 0-100
        Severity     string    `json:"severity"`     // "INFO", "BAJA", "MEDIA", "ALTA", "CRÍTICA"
        Status       string    `json:"status"`       // "active", "expired", "dismissed"
        Description  string    `json:"description"`
        Occurrences  int       `json:"occurrences"`
        LastDetected time.Time `json:"lastDetected"`
        EntityIDs    []string  `json:"entityIds"`
}

// Alert represents a generated alert
type Alert struct {
        ID           string    `json:"id"`
        Source       string    `json:"source"`
        Severity     string    `json:"severity"`
        Title        string    `json:"title"`
        Description  string    `json:"description"`
        ActionTaken  string    `json:"actionTaken"`
        Strategy     string    `json:"strategy"`
        Fingerprint  string    `json:"fingerprint"` // Dedup key: hash of (type + source + title)
        Timestamp    time.Time `json:"timestamp"`
        Acknowledged bool      `json:"acknowledged"`
        Escalated    bool      `json:"escalated"`
}

// RiskAssessment represents a risk score evaluation
type RiskAssessment struct {
        ID           string    `json:"id"`
        EntityID     string    `json:"entityId"`
        Score        int       `json:"score"`        // 0-100
        Nature       int       `json:"nature"`       // 35% weight
        Volume       int       `json:"volume"`       // 25% weight
        Connections  int       `json:"connections"`  // 20% weight
        OSINTContext int       `json:"osintContext"` // 15% weight
        Recency      int       `json:"recency"`      // 5% weight
        Strategy     string    `json:"strategy"`
        Reasoning    string    `json:"reasoning"`
        Timestamp    time.Time `json:"timestamp"`
}

// ConsensusVote represents a multi-agent vote
type ConsensusVote struct {
        AgentID    string  `json:"agentId"`
        AgentName  string  `json:"agentName"`
        Vote       string  `json:"vote"` // "favor", "contra", "abstencion"
        Confidence int     `json:"confidence"`
        Weight     float64 `json:"weight"` // Reputation-based weight
        Reasoning  string  `json:"reasoning"`
}

// ThresholdConfig represents a configurable threshold
type ThresholdConfig struct {
        ID            string                 `json:"id"`
        Name          string                 `json:"name"`
        Metric        string                 `json:"metric"`
        Value         float64                `json:"value"`
        CurrentValue  float64                `json:"currentValue"`
        Unit          string                 `json:"unit"`
        AlertType     string                 `json:"alertType"`
        AlertSeverity string                 `json:"alertSeverity"`
        LastTriggered *time.Time             `json:"lastTriggered,omitempty"`
        Metadata      map[string]interface{} `json:"metadata,omitempty"`
}

// StrategyResult represents the result of a strategy evaluation
type StrategyResult struct {
        StrategyID string                 `json:"strategyId"`
        Action     string                 `json:"action"` // "alert", "escalate", "monitor", "dismiss"
        Severity   string                 `json:"severity"`
        Confidence int                    `json:"confidence"`
        Reasoning  string                 `json:"reasoning"`
        Data       map[string]interface{} `json:"data,omitempty"`
}

// StrategyContext provides data for strategy evaluation
type StrategyContext struct {
        Messages   []RawMessage       `json:"messages"`
        Entities   []Entity           `json:"entities"`
        Patterns   []PatternDetection `json:"patterns"`
        Thresholds []ThresholdConfig  `json:"thresholds"`
        OSINTData  *OSINTSnapshot     `json:"osintData,omitempty"`
}

// OSINTSnapshot represents aggregated OSINT data
type OSINTSnapshot struct {
        Earthquakes []OSINTEarthquake `json:"earthquakes,omitempty"`
        Flights     []OSINTFlight     `json:"flights,omitempty"`
        Weather     *OSINTWeather     `json:"weather,omitempty"`
        Fires       []OSINTFire       `json:"fires,omitempty"`
        Ships       []OSINTShip       `json:"ships,omitempty"`
        GDELT       []OSINTGDELT      `json:"gdelt,omitempty"`
        News        []OSINTNews       `json:"news,omitempty"`
        GPSJamming  []OSINTGPSJam     `json:"gpsJamming,omitempty"`
        UAVs        []OSINTUAV        `json:"uavs,omitempty"`
        LiveUAMap   []OSINTLiveUAMap  `json:"liveuamap,omitempty"`
        SIGINT      []OSINTSIGINT     `json:"sigint,omitempty"`
}

// OSINTEarthquake represents an earthquake event
type OSINTEarthquake struct {
        Location  string  `json:"location"`
        Magnitude float64 `json:"magnitude"`
        Depth     float64 `json:"depth"`
        Time      string  `json:"time"`
        Source    string  `json:"source"`
}

// OSINTFlight represents a flight tracking entry
type OSINTFlight struct {
        Callsign string  `json:"callsign"`
        Type     string  `json:"type"`
        Altitude float64 `json:"altitude"`
        Heading  float64 `json:"heading"`
        Zone     string  `json:"zone"`
        Time     string  `json:"time"`
}

// OSINTWeather represents weather data
type OSINTWeather struct {
        ActiveAlerts  int      `json:"activeAlerts"`
        ExtremeEvents []string `json:"extremeEvents,omitempty"`
}

// OSINTFire represents a fire detection entry
type OSINTFire struct {
        Location   string  `json:"location"`
        Confidence int     `json:"confidence"`
        Lat        float64 `json:"lat"`
        Lon        float64 `json:"lon"`
}

// OSINTShip represents a ship tracking entry
type OSINTShip struct {
        Name  string  `json:"name"`
        Type  string  `json:"type"`
        Lat   float64 `json:"lat"`
        Lon   float64 `json:"lon"`
        Speed float64 `json:"speed"`
}

// OSINTGDELT represents a GDELT event
type OSINTGDELT struct {
        Name   string `json:"name"`
        URL    string `json:"url,omitempty"`
        Date   string `json:"date,omitempty"`
        Source string `json:"source,omitempty"`
}

// OSINTNews represents a news article
type OSINTNews struct {
        Title       string `json:"title"`
        Source      string `json:"source"`
        URL         string `json:"url,omitempty"`
        PublishedAt string `json:"publishedAt,omitempty"`
        Category    string `json:"category,omitempty"`
}

// OSINTGPSJam represents a GPS jamming event
type OSINTGPSJam struct {
        Region      string  `json:"region"`
        Lat         float64 `json:"lat"`
        Lon         float64 `json:"lon"`
        Severity    string  `json:"severity"`
        Description string  `json:"description"`
        Time        string  `json:"time"`
        Source      string  `json:"source"`
}

// OSINTUAV represents a UAV tracking entry
type OSINTUAV struct {
        Callsign string  `json:"callsign"`
        Type     string  `json:"type"`
        Altitude float64 `json:"altitude"`
        Lat      float64 `json:"lat"`
        Lon      float64 `json:"lon"`
        Heading  float64 `json:"heading"`
        Zone     string  `json:"zone"`
        Time     string  `json:"time"`
}

// OSINTLiveUAMap represents a LiveUAMap event
type OSINTLiveUAMap struct {
        Title       string  `json:"title"`
        Description string  `json:"description"`
        Lat         float64 `json:"lat"`
        Lon         float64 `json:"lon"`
        EventType   string  `json:"eventType"`
        Time        string  `json:"time"`
        Source      string  `json:"source"`
}

// OSINTSIGINT represents a SIGINT entry (Meshtastic/APRS)
type OSINTSIGINT struct {
        Type      string  `json:"type"` // "meshtastic" or "aprs"
        Callsign  string  `json:"callsign"`
        Frequency string  `json:"frequency"`
        Lat       float64 `json:"lat"`
        Lon       float64 `json:"lon"`
        Altitude  float64 `json:"altitude"`
        Time      string  `json:"time"`
        Source    string  `json:"source"`
        Message   string  `json:"message,omitempty"`
}

// Prediction represents a predictive analysis result
type Prediction struct {
        ID          string    `json:"id"`
        Metric      string    `json:"metric"`
        Period      string    `json:"period"`
        PredictedAt time.Time `json:"predictedAt"`
        TargetTime  time.Time `json:"targetTime"`
        Value       float64   `json:"value"`
        Confidence  float64   `json:"confidence"`
}

// Report represents a generated intelligence report
type Report struct {
        ID          string    `json:"id"`
        Title       string    `json:"title"`
        Type        string    `json:"type"` // "threat_summary", "risk_analysis", "pattern_report", "full_intelligence"
        Content     string    `json:"content"`
        Severity    string    `json:"severity"`
        GeneratedAt time.Time `json:"generatedAt"`
        AgentID     string    `json:"agentId"`
}

// AgentState represents a running agent's state
type AgentState struct {
        AgentID           string     `json:"agentId"`
        Name              string     `json:"name"`
        Layer             int        `json:"layer"`
        LayerName         string     `json:"layerName"`
        Status            string     `json:"status"` // "active", "idle", "error", "offline"
        Health            int        `json:"health"` // 0-100
        MessagesProcessed int        `json:"messagesProcessed"`
        LastHeartbeat     time.Time  `json:"lastHeartbeat"`
        StartedAt         *time.Time `json:"startedAt,omitempty"`
}

// DashboardData represents aggregated data for the frontend dashboard
type DashboardData struct {
        ThreatLevel        string              `json:"threatLevel"`
        ThreatScore        int                 `json:"threatScore"`
        ActiveAlerts       int                 `json:"activeAlerts"`
        CriticalAlerts     int                 `json:"criticalAlerts"`
        TotalEntities      int                 `json:"totalEntities"`
        HighRiskEntities   int                 `json:"highRiskEntities"`
        ActivePatterns     int                 `json:"activePatterns"`
        RecentEvents       []IntelligenceEvent `json:"recentEvents"`
        AgentStates        []AgentState        `json:"agentStates"`
        TopEntities        []Entity            `json:"topEntities"`
        ActiveAlertsList   []Alert             `json:"activeAlertsList"`
        StreamStats        map[string]int64    `json:"streamStats"`
        LastOSINTFetch     *time.Time          `json:"lastOSINTFetch,omitempty"`
        TotalMessages      int64               `json:"totalMessages"`
        ProcessedMessages  int64               `json:"processedMessages"`
}

// StreamInfo represents information about an event stream
type StreamInfo struct {
        Name     string `json:"name"`
        Length   int64  `json:"length"`
        ConsumerGroups int `json:"consumerGroups"`
        LastEventID string `json:"lastEventId"`
}

// KeywordMatch represents a keyword detection result
type KeywordMatch struct {
        Keyword   string `json:"keyword"`
        Category  string `json:"category"`
        Language  string `json:"language"`
        Count     int    `json:"count"`
}

// SentimentResult represents a sentiment analysis result
type SentimentResult struct {
        Score   float64 `json:"score"`   // -1.0 to 1.0
        Label   string  `json:"label"`   // "negative", "neutral", "positive"
        Magnitude float64 `json:"magnitude"` // 0.0 to 1.0
}

// CorrelationResult represents a correlation analysis result
type CorrelationResult struct {
        EntityA    string  `json:"entityA"`
        EntityB    string  `json:"entityB"`
        Similarity float64 `json:"similarity"`
        Method     string  `json:"method"` // "jaccard", "comention", "temporal"
}

// HealthStatus represents the health of the intelligence service
type HealthStatus struct {
        Status       string            `json:"status"` // "healthy", "degraded", "unhealthy"
        Redis        bool              `json:"redis"`
        Postgres     bool              `json:"postgres"`
        OSINTService bool              `json:"osintService"`
        Agents       map[string]string `json:"agents"`
        Uptime       string            `json:"uptime"`
        Version      string            `json:"version"`
}

// AggregatedHealth represents a comprehensive health check across all subsystems
type AggregatedHealth struct {
        Status       string                     `json:"status"` // "healthy", "degraded", "unhealthy"
        Timestamp    time.Time                  `json:"timestamp"`
        Uptime       string                     `json:"uptime"`
        Version      string                     `json:"version"`
        Components   map[string]ComponentHealth `json:"components"`
        AgentSummary AgentHealthSummary         `json:"agentSummary"`
}

// ComponentHealth represents the health of a single component
type ComponentHealth struct {
        Status    string `json:"status"` // "healthy", "degraded", "unhealthy", "unavailable"
        LatencyMs int64  `json:"latencyMs"`
        Message   string `json:"message,omitempty"`
}

// AgentHealthSummary summarizes agent health across all layers
type AgentHealthSummary struct {
        Total   int `json:"total"`
        Active  int `json:"active"`
        Idle    int `json:"idle"`
        Error   int `json:"error"`
        Offline int `json:"offline"`
}
