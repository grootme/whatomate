package intelligence

import (
	"context"
	"fmt"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/zerodha/logf"
)

// RealtimeThreatComputer continuously computes threat levels from live OSINT data
// and triggers notifications when threat levels change significantly
type RealtimeThreatComputer struct {
	eventStore     *EventStore
	threatComputer *ThreatLevelComputer
	alertNotifier  *AlertNotifier
	osintClient    *OSINTClient
	log            logf.Logger

	currentAssessment *ThreatAssessment
	previousLevel    string
	mu               sync.RWMutex
	cancel           context.CancelFunc
}

// NewRealtimeThreatComputer creates a new real-time threat computer
func NewRealtimeThreatComputer(es *EventStore, tc *ThreatLevelComputer, an *AlertNotifier, oc *OSINTClient, log logf.Logger) *RealtimeThreatComputer {
	return &RealtimeThreatComputer{
		eventStore:     es,
		threatComputer: tc,
		alertNotifier:  an,
		osintClient:    oc,
		log:            log,
	}
}

// Start begins periodic threat level computation
func (rtc *RealtimeThreatComputer) Start(ctx context.Context, interval time.Duration) {
	if interval == 0 {
		interval = 2 * time.Minute
	}

	ctx, cancel := context.WithCancel(ctx)
	rtc.cancel = cancel

	// Compute initial assessment
	rtc.computeAndNotify(ctx)

	go func() {
		ticker := time.NewTicker(interval)
		defer ticker.Stop()

		for {
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
				rtc.computeAndNotify(ctx)
			}
		}
	}()

	rtc.log.Info("Real-time threat computer started", "interval", interval)
}

// Stop stops the real-time threat computer
func (rtc *RealtimeThreatComputer) Stop() {
	if rtc.cancel != nil {
		rtc.cancel()
	}
}

// GetCurrentAssessment returns the most recent threat assessment
func (rtc *RealtimeThreatComputer) GetCurrentAssessment() *ThreatAssessment {
	rtc.mu.RLock()
	defer rtc.mu.RUnlock()
	return rtc.currentAssessment
}

// computeAndNotify fetches OSINT data, computes threat level, and notifies on changes
func (rtc *RealtimeThreatComputer) computeAndNotify(ctx context.Context) {
	osintData := rtc.osintClient.GetLastSnapshot()
	if osintData == nil {
		// Try to fetch fresh data
		var err error
		osintData, err = rtc.osintClient.FetchOSINTData(ctx)
		if err != nil {
			rtc.log.Warn("Failed to fetch OSINT data for threat computation", "error", err)
			return
		}
	}

	assessment := rtc.threatComputer.ComputeThreatLevel(ctx, osintData)

	rtc.mu.Lock()
	previousLevel := rtc.previousLevel
	rtc.currentAssessment = assessment
	rtc.previousLevel = assessment.OverallLevel
	rtc.mu.Unlock()

	// Store threat assessment event
	_ = rtc.eventStore.Append(ctx, StreamThreatAssessments, IntelligenceEvent{
		EventType:     EventTypeRiskAssessed,
		AggregateID:   uuid.New().String(),
		AggregateType: "threat_level",
		Payload: map[string]interface{}{
			"overallScore": assessment.OverallScore,
			"overallLevel": assessment.OverallLevel,
			"factorCount":  len(assessment.FactorScores),
			"contributors": len(assessment.TopContributors),
		},
		Timestamp: time.Now(),
	})

	// Notify if threat level changed
	if previousLevel != "" && previousLevel != assessment.OverallLevel {
		rtc.alertNotifier.NotifyThreatLevelChange(ctx, previousLevel, assessment.OverallLevel, assessment.OverallScore)
		rtc.log.Info("Threat level changed",
			"previous", previousLevel,
			"current", assessment.OverallLevel,
			"score", assessment.OverallScore)
	}

	// Notify for high-severity factors
	for _, contributor := range assessment.TopContributors {
		if contributor.Score >= 60 {
			rtc.alertNotifier.NotifyPatternDetected(ctx, PatternDetection{
				ID:           uuid.New().String(),
				PatternType:  "osint_threat_factor",
				Confidence:   contributor.Score,
				Severity:     levelToSeverity(assessment.OverallLevel),
				Status:       "active",
				Description:  fmt.Sprintf("OSINT threat factor: %s (score: %d, %s)", contributor.Category, contributor.Score, contributor.Detail),
				LastDetected: time.Now(),
			})
		}
	}
}

// levelToSeverity converts a threat level to a severity string
func levelToSeverity(level string) string {
	switch level {
	case "critical":
		return "CRÍTICA"
	case "high":
		return "ALTA"
	case "elevated":
		return "MEDIA"
	case "moderate":
		return "BAJA"
	default:
		return "INFO"
	}
}

// GetThreatLevelHistory returns recent threat level assessments from the event store
func (rtc *RealtimeThreatComputer) GetThreatLevelHistory(ctx context.Context, limit int) ([]ThreatAssessment, error) {
	events, err := rtc.eventStore.GetRecent(ctx, StreamThreatAssessments, int64(limit))
	if err != nil {
		return nil, err
	}

	var assessments []ThreatAssessment
	for _, event := range events {
		if event.EventType == EventTypeRiskAssessed && event.AggregateType == "threat_level" {
			score := 0
			if s, ok := event.Payload["overallScore"]; ok {
				switch v := s.(type) {
				case int:
					score = v
				case float64:
					score = int(v)
				}
			}
			level := "low"
			if l, ok := event.Payload["overallLevel"]; ok {
				if ls, ok := l.(string); ok {
					level = ls
				}
			}
			assessments = append(assessments, ThreatAssessment{
				OverallScore: score,
				OverallLevel: level,
				ComputedAt:   event.Timestamp,
			})
		}
	}

	return assessments, nil
}
