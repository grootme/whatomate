package intelligence

import (
	"context"
	"sync"
	"time"

	"github.com/zerodha/logf"
)

// HealthCheckAggregator performs periodic health checks across all subsystems
// and maintains a rolling history of health states for trend analysis
type HealthCheckAggregator struct {
	service *IntelligenceService
	log     logf.Logger
	history []AggregatedHealth
	mu      sync.RWMutex
	maxHist int
	cancel  context.CancelFunc
}

// NewHealthCheckAggregator creates a new health check aggregator
func NewHealthCheckAggregator(service *IntelligenceService, log logf.Logger) *HealthCheckAggregator {
	return &HealthCheckAggregator{
		service: service,
		log:     log,
		history: make([]AggregatedHealth, 0),
		maxHist: 100, // Keep last 100 health snapshots
	}
}

// Start begins periodic health aggregation
func (hca *HealthCheckAggregator) Start(ctx context.Context, interval time.Duration) {
	if interval == 0 {
		interval = 30 * time.Second
	}

	ctx, cancel := context.WithCancel(ctx)
	hca.cancel = cancel

	go func() {
		ticker := time.NewTicker(interval)
		defer ticker.Stop()

		for {
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
				health := hca.service.GetAggregatedHealth(ctx)
				hca.mu.Lock()
				hca.history = append(hca.history, health)
				if len(hca.history) > hca.maxHist {
					hca.history = hca.history[len(hca.history)-hca.maxHist:]
				}
				hca.mu.Unlock()
			}
		}
	}()

	hca.log.Info("Health check aggregator started", "interval", interval)
}

// Stop stops the health check aggregator
func (hca *HealthCheckAggregator) Stop() {
	if hca.cancel != nil {
		hca.cancel()
	}
}

// GetHistory returns the health check history
func (hca *HealthCheckAggregator) GetHistory() []AggregatedHealth {
	hca.mu.RLock()
	defer hca.mu.RUnlock()

	result := make([]AggregatedHealth, len(hca.history))
	copy(result, hca.history)
	return result
}

// GetLatest returns the most recent health check
func (hca *HealthCheckAggregator) GetLatest() *AggregatedHealth {
	hca.mu.RLock()
	defer hca.mu.RUnlock()

	if len(hca.history) == 0 {
		return nil
	}
	latest := hca.history[len(hca.history)-1]
	return &latest
}

// HealthTrend represents the trend of a health component over time
type HealthTrend struct {
	Component    string  `json:"component"`
	CurrentState string  `json:"currentState"`
	Trend        string  `json:"trend"` // "improving", "degrading", "stable", "unknown"
	Score        float64 `json:"score"` // 0.0-1.0, higher is better
	Samples      int     `json:"samples"`
}

// AnalyzeTrends analyzes health trends over the history
func (hca *HealthCheckAggregator) AnalyzeTrends() map[string]HealthTrend {
	hca.mu.RLock()
	defer hca.mu.RUnlock()

	trends := make(map[string]HealthTrend)
	if len(hca.history) < 2 {
		return trends
	}

	// Collect component states over time
	componentStates := make(map[string][]string)
	for _, h := range hca.history {
		for comp, ch := range h.Components {
			componentStates[comp] = append(componentStates[comp], ch.Status)
		}
	}

	for comp, states := range componentStates {
		trend := HealthTrend{
			Component:    comp,
			CurrentState: states[len(states)-1],
			Samples:      len(states),
		}

		if len(states) < 2 {
			trend.Trend = "unknown"
			trend.Score = 0.5
			trends[comp] = trend
			continue
		}

		// Calculate score based on healthy/unhealthy ratio
		healthyCount := 0
		for _, s := range states {
			if s == "healthy" {
				healthyCount++
			}
		}
		trend.Score = float64(healthyCount) / float64(len(states))

		// Determine trend direction
		recentWindow := 5
		if len(states) < recentWindow {
			recentWindow = len(states)
		}

		recentHealthy := 0
		olderHealthy := 0
		splitPoint := len(states) - recentWindow

		for i, s := range states {
			if s == "healthy" {
				if i >= splitPoint {
					recentHealthy++
				} else {
					olderHealthy++
				}
			}
		}

		recentRatio := float64(recentHealthy) / float64(recentWindow)
		olderCount := splitPoint
		if olderCount == 0 {
			olderCount = 1
		}
		olderRatio := float64(olderHealthy) / float64(olderCount)

		switch {
		case recentRatio > olderRatio+0.1:
			trend.Trend = "improving"
		case recentRatio < olderRatio-0.1:
			trend.Trend = "degrading"
		default:
			trend.Trend = "stable"
		}

		trends[comp] = trend
	}

	return trends
}

// GetUptimePercentage calculates uptime percentage from health history
func (hca *HealthCheckAggregator) GetUptimePercentage() float64 {
	hca.mu.RLock()
	defer hca.mu.RUnlock()

	if len(hca.history) == 0 {
		return 100.0
	}

	healthyCount := 0
	for _, h := range hca.history {
		if h.Status == "healthy" {
			healthyCount++
		}
	}

	return float64(healthyCount) / float64(len(hca.history)) * 100.0
}
