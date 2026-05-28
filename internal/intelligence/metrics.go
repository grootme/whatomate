package intelligence

import (
	"context"
	"runtime"
	"sync"
	"sync/atomic"
	"time"
)

// MetricsCollector collects and exposes system metrics for the intelligence service
type MetricsCollector struct {
	service *IntelligenceService
	started  time.Time

	// Counters
	messagesIngested   atomic.Int64
	messagesAnalyzed   atomic.Int64
	eventsAppended     atomic.Int64
	alertsGenerated    atomic.Int64
	reportsGenerated   atomic.Int64
	correlationsFound  atomic.Int64
	osintFetches       atomic.Int64
	osintFetchErrors   atomic.Int64
	cacheHits          atomic.Int64
	cacheMisses        atomic.Int64

	// Gauges
	activeGoroutines atomic.Int64

	mu sync.RWMutex
}

// NewMetricsCollector creates a new metrics collector
func NewMetricsCollector(service *IntelligenceService) *MetricsCollector {
	return &MetricsCollector{
		service: service,
		started: time.Now(),
	}
}

// RecordMessageIngested increments the message ingested counter
func (mc *MetricsCollector) RecordMessageIngested() {
	mc.messagesIngested.Add(1)
	mc.eventsAppended.Add(1)
}

// RecordMessageAnalyzed increments the message analyzed counter
func (mc *MetricsCollector) RecordMessageAnalyzed() {
	mc.messagesAnalyzed.Add(1)
}

// RecordEventAppended increments the event appended counter
func (mc *MetricsCollector) RecordEventAppended() {
	mc.eventsAppended.Add(1)
}

// RecordAlertGenerated increments the alert generated counter
func (mc *MetricsCollector) RecordAlertGenerated() {
	mc.alertsGenerated.Add(1)
}

// RecordReportGenerated increments the report generated counter
func (mc *MetricsCollector) RecordReportGenerated() {
	mc.reportsGenerated.Add(1)
}

// RecordCorrelationFound increments the correlation found counter
func (mc *MetricsCollector) RecordCorrelationFound() {
	mc.correlationsFound.Add(1)
}

// RecordOSINTFetch increments the OSINT fetch counter
func (mc *MetricsCollector) RecordOSINTFetch(success bool) {
	mc.osintFetches.Add(1)
	if !success {
		mc.osintFetchErrors.Add(1)
	}
}

// RecordCacheHit increments the cache hit counter
func (mc *MetricsCollector) RecordCacheHit() {
	mc.cacheHits.Add(1)
}

// RecordCacheMiss increments the cache miss counter
func (mc *MetricsCollector) RecordCacheMiss() {
	mc.cacheMisses.Add(1)
}

// MetricsSnapshot represents a point-in-time snapshot of all metrics
type MetricsSnapshot struct {
	Timestamp          time.Time         `json:"timestamp"`
	Uptime             string            `json:"uptime"`
	UptimeSeconds      float64           `json:"uptimeSeconds"`

	// Counters
	MessagesIngested   int64             `json:"messagesIngested"`
	MessagesAnalyzed   int64             `json:"messagesAnalyzed"`
	EventsAppended     int64             `json:"eventsAppended"`
	AlertsGenerated    int64             `json:"alertsGenerated"`
	ReportsGenerated   int64             `json:"reportsGenerated"`
	CorrelationsFound  int64             `json:"correlationsFound"`
	OSINTFetches       int64             `json:"osintFetches"`
	OSINTFetchErrors   int64             `json:"osintFetchErrors"`
	CacheHits          int64             `json:"cacheHits"`
	CacheMisses        int64             `json:"cacheMisses"`

	// Rates (per minute)
	IngestRate         float64           `json:"ingestRate"`
	AnalysisRate       float64           `json:"analysisRate"`
	AlertRate          float64           `json:"alertRate"`

	// Cache hit rate
	CacheHitRate       float64           `json:"cacheHitRate"`

	// System
	Goroutines         int               `json:"goroutines"`
	MemoryAllocMB     float64           `json:"memoryAllocMB"`
	MemorySysMB       float64           `json:"memorySysMB"`
	NumGC             uint32            `json:"numGC"`

	// Service state
	ThreatScore        int               `json:"threatScore"`
	ThreatLevel        string            `json:"threatLevel"`
	ActiveAlerts       int               `json:"activeAlerts"`
	TotalEntities      int               `json:"totalEntities"`
	ActivePatterns     int               `json:"activePatterns"`
	AgentCount         int               `json:"agentCount"`
	SchedulerRunning   bool              `json:"schedulerRunning"`
}

// Snapshot captures the current metrics
func (mc *MetricsCollector) Snapshot(ctx context.Context) MetricsSnapshot {
	now := time.Now()
	uptime := now.Sub(mc.started)
	uptimeMinutes := uptime.Minutes()
	if uptimeMinutes < 1 {
		uptimeMinutes = 1
	}

	// Get runtime stats
	var memStats runtime.MemStats
	runtime.ReadMemStats(&memStats)

	// Get service state
	dashboard := mc.service.GetDashboardData(ctx)
	schedulerStatus := mc.service.GetSchedulerStatus()

	// Calculate rates
	messagesIngested := mc.messagesIngested.Load()
	messagesAnalyzed := mc.messagesAnalyzed.Load()
	alertsGenerated := mc.alertsGenerated.Load()
	cacheHits := mc.cacheHits.Load()
	cacheMisses := mc.cacheMisses.Load()

	// Calculate cache hit rate
	totalCache := cacheHits + cacheMisses
	cacheHitRate := 0.0
	if totalCache > 0 {
		cacheHitRate = float64(cacheHits) / float64(totalCache) * 100
	}

	return MetricsSnapshot{
		Timestamp:        now,
		Uptime:           uptime.String(),
		UptimeSeconds:    uptime.Seconds(),

		MessagesIngested:  messagesIngested,
		MessagesAnalyzed:  messagesAnalyzed,
		EventsAppended:    mc.eventsAppended.Load(),
		AlertsGenerated:   alertsGenerated,
		ReportsGenerated:  mc.reportsGenerated.Load(),
		CorrelationsFound: mc.correlationsFound.Load(),
		OSINTFetches:      mc.osintFetches.Load(),
		OSINTFetchErrors:  mc.osintFetchErrors.Load(),
		CacheHits:         cacheHits,
		CacheMisses:       cacheMisses,

		IngestRate:   float64(messagesIngested) / uptimeMinutes,
		AnalysisRate: float64(messagesAnalyzed) / uptimeMinutes,
		AlertRate:    float64(alertsGenerated) / uptimeMinutes,
		CacheHitRate: cacheHitRate,

		Goroutines:     runtime.NumGoroutine(),
		MemoryAllocMB:  float64(memStats.Alloc) / 1024 / 1024,
		MemorySysMB:    float64(memStats.Sys) / 1024 / 1024,
		NumGC:          memStats.NumGC,

		ThreatScore:      dashboard.ThreatScore,
		ThreatLevel:      dashboard.ThreatLevel,
		ActiveAlerts:     dashboard.ActiveAlerts,
		TotalEntities:    dashboard.TotalEntities,
		ActivePatterns:   dashboard.ActivePatterns,
		AgentCount:       len(dashboard.AgentStates),
		SchedulerRunning: schedulerStatus.Running,
	}
}

// GetPrometheusMetrics returns metrics in a simple key=value format
// suitable for exposition to monitoring systems
func (mc *MetricsCollector) GetPrometheusMetrics(ctx context.Context) map[string]float64 {
	snapshot := mc.Snapshot(ctx)
	return map[string]float64{
		"intelligence_messages_ingested_total":   float64(snapshot.MessagesIngested),
		"intelligence_messages_analyzed_total":   float64(snapshot.MessagesAnalyzed),
		"intelligence_events_appended_total":     float64(snapshot.EventsAppended),
		"intelligence_alerts_generated_total":    float64(snapshot.AlertsGenerated),
		"intelligence_reports_generated_total":   float64(snapshot.ReportsGenerated),
		"intelligence_correlations_found_total":  float64(snapshot.CorrelationsFound),
		"intelligence_osint_fetches_total":       float64(snapshot.OSINTFetches),
		"intelligence_osint_fetch_errors_total":  float64(snapshot.OSINTFetchErrors),
		"intelligence_cache_hits_total":          float64(snapshot.CacheHits),
		"intelligence_cache_misses_total":        float64(snapshot.CacheMisses),
		"intelligence_ingest_rate_per_minute":    snapshot.IngestRate,
		"intelligence_analysis_rate_per_minute":  snapshot.AnalysisRate,
		"intelligence_alert_rate_per_minute":     snapshot.AlertRate,
		"intelligence_cache_hit_rate_percent":    snapshot.CacheHitRate,
		"intelligence_goroutines":                float64(snapshot.Goroutines),
		"intelligence_memory_alloc_mb":           snapshot.MemoryAllocMB,
		"intelligence_memory_sys_mb":             snapshot.MemorySysMB,
		"intelligence_threat_score":              float64(snapshot.ThreatScore),
		"intelligence_active_alerts":             float64(snapshot.ActiveAlerts),
		"intelligence_total_entities":            float64(snapshot.TotalEntities),
		"intelligence_active_patterns":           float64(snapshot.ActivePatterns),
		"intelligence_uptime_seconds":            snapshot.UptimeSeconds,
	}
}

// HealthMetrics returns a simplified metrics view for health checks
func (mc *MetricsCollector) HealthMetrics(ctx context.Context) map[string]interface{} {
	snapshot := mc.Snapshot(ctx)
	return map[string]interface{}{
		"uptime":          snapshot.Uptime,
		"threatScore":     snapshot.ThreatScore,
		"threatLevel":     snapshot.ThreatLevel,
		"activeAlerts":    snapshot.ActiveAlerts,
		"totalEntities":   snapshot.TotalEntities,
		"goroutines":      snapshot.Goroutines,
		"memoryAllocMB":   snapshot.MemoryAllocMB,
		"cacheHitRate":    snapshot.CacheHitRate,
		"schedulerRunning": snapshot.SchedulerRunning,
	}
}
