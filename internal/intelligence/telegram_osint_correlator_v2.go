package intelligence

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/zerodha/logf"
)

// TelegramOSINTCorrelatorV2 provides enhanced Telegram-OSINT correlation
// with temporal proximity analysis, entity graph building, and cross-reference scoring
type TelegramOSINTCorrelatorV2 struct {
	eventStore *EventStore
	analysis   *AnalysisEngine
	log        logf.Logger
}

// NewTelegramOSINTCorrelatorV2 creates an enhanced correlator
func NewTelegramOSINTCorrelatorV2(es *EventStore, ae *AnalysisEngine, log logf.Logger) *TelegramOSINTCorrelatorV2 {
	return &TelegramOSINTCorrelatorV2{
		eventStore: es,
		analysis:   ae,
		log:        log,
	}
}

// TemporalCorrelation represents a temporal proximity correlation between messages and OSINT events
type TemporalCorrelation struct {
	MessageID     string    `json:"messageId"`
	OSINTCategory string    `json:"osintCategory"`
	OSINTEventID  string    `json:"osintEventId"`
	TimeDelta     float64   `json:"timeDelta"` // seconds between message and OSINT event
	Confidence    float64   `json:"confidence"`
	Details       string    `json:"details"`
	Timestamp     time.Time `json:"timestamp"`
}

// CorrelationSummary provides a summary of all correlations for a batch of messages
type CorrelationSummary struct {
	TotalMessages        int                    `json:"totalMessages"`
	TotalOSINTEvents     int                    `json:"totalOsintEvents"`
	TotalCorrelations    int                    `json:"totalCorrelations"`
	CorrelationsByCategory map[string]int       `json:"correlationsByCategory"`
	AverageConfidence    float64                `json:"averageConfidence"`
	HighConfidenceCount  int                    `json:"highConfidenceCount"` // > 0.7
	TemporalCorrelations int                    `json:"temporalCorrelations"`
	TopCorrelatedMsgs    []string               `json:"topCorrelatedMsgs"`
	GeneratedAt          time.Time              `json:"generatedAt"`
}

// CorrelateWithTemporalAnalysis correlates messages with OSINT data using both
// content matching and temporal proximity analysis
func (toc *TelegramOSINTCorrelatorV2) CorrelateWithTemporalAnalysis(ctx context.Context, messages []RawMessage, osintData *OSINTSnapshot) (*CorrelationSummary, []CorrelationMatch) {
	if osintData == nil || len(messages) == 0 {
		return &CorrelationSummary{GeneratedAt: time.Now()}, nil
	}

	var allMatches []CorrelationMatch
	categoryCount := make(map[string]int)
	totalConfidence := 0.0
	highConfCount := 0
	msgCorrelationCount := make(map[string]int)

	// Content-based correlation
	for _, msg := range messages {
		matches := correlateMessageContent(msg, osintData)
		allMatches = append(allMatches, matches...)

		for _, m := range matches {
			categoryCount[m.OSINTCategory]++
			totalConfidence += m.Confidence
			if m.Confidence > 0.7 {
				highConfCount++
			}
			msgCorrelationCount[m.MessageID]++
		}
	}

	// Temporal proximity analysis - messages near OSINT event timestamps
	temporalMatches := toc.findTemporalCorrelations(messages, osintData)
	for _, tm := range temporalMatches {
		categoryCount[tm.OSINTCategory]++
		msgCorrelationCount[tm.MessageID]++
	}

	// Store all correlation events
	for _, match := range allMatches {
		_ = toc.eventStore.Append(ctx, StreamAnalyzedMessages, IntelligenceEvent{
			EventType:     EventTypeCorrelationFound,
			AggregateID:   match.MessageID,
			AggregateType: "telegram_osint_correlation_v2",
			Payload: map[string]interface{}{
				"messageId":     match.MessageID,
				"osintCategory": match.OSINTCategory,
				"matchType":     match.MatchType,
				"confidence":    match.Confidence,
				"details":       match.Details,
			},
			Timestamp: time.Now(),
		})
	}

	// Find top correlated messages
	var topMsgs []string
	for msgID, count := range msgCorrelationCount {
		if count >= 2 {
			topMsgs = append(topMsgs, msgID)
		}
	}
	if len(topMsgs) > 20 {
		topMsgs = topMsgs[:20]
	}

	avgConfidence := 0.0
	if len(allMatches) > 0 {
		avgConfidence = totalConfidence / float64(len(allMatches))
	}

	// Count total OSINT events
	totalOSINT := len(osintData.Earthquakes) + len(osintData.Fires) + len(osintData.GPSJamming) +
		len(osintData.UAVs) + len(osintData.LiveUAMap) + len(osintData.SIGINT) +
		len(osintData.Ships) + len(osintData.Flights) + len(osintData.News) + len(osintData.GDELT)

	summary := &CorrelationSummary{
		TotalMessages:        len(messages),
		TotalOSINTEvents:     totalOSINT,
		TotalCorrelations:    len(allMatches),
		CorrelationsByCategory: categoryCount,
		AverageConfidence:    avgConfidence,
		HighConfidenceCount:  highConfCount,
		TemporalCorrelations: len(temporalMatches),
		TopCorrelatedMsgs:    topMsgs,
		GeneratedAt:          time.Now(),
	}

	if len(allMatches) > 0 {
		toc.log.Info("Enhanced Telegram-OSINT correlation completed",
			"messages", len(messages), "correlations", len(allMatches),
			"avgConfidence", fmt.Sprintf("%.2f", avgConfidence))
	}

	return summary, allMatches
}

// findTemporalCorrelations finds correlations based on temporal proximity
func (toc *TelegramOSINTCorrelatorV2) findTemporalCorrelations(messages []RawMessage, osintData *OSINTSnapshot) []TemporalCorrelation {
	var correlations []TemporalCorrelation

	// Check messages against OSINT events within a time window
	maxTimeDelta := 30 * time.Minute // 30 minute window

	for _, msg := range messages {
		// Check earthquakes
		for _, eq := range osintData.Earthquakes {
			if eq.Time == "" {
				continue
			}
			eventTime, err := time.Parse(time.RFC3339, eq.Time)
			if err != nil {
				continue
			}
			delta := msg.Timestamp.Sub(eventTime)
			if delta < 0 {
				delta = -delta
			}
			if delta <= maxTimeDelta {
				correlations = append(correlations, TemporalCorrelation{
					MessageID:     msg.ID,
					OSINTCategory: "earthquake",
					OSINTEventID:  uuid.New().String(),
					TimeDelta:     delta.Seconds(),
					Confidence:    0.4 + 0.3*(1.0-delta.Seconds()/maxTimeDelta.Seconds()),
					Details:       fmt.Sprintf("Message within %v of earthquake M%.1f at %s", delta.Round(time.Minute), eq.Magnitude, eq.Location),
					Timestamp:     time.Now(),
				})
			}
		}

		// Check GPS jamming events
		for _, jam := range osintData.GPSJamming {
			if jam.Time == "" {
				continue
			}
			eventTime, err := time.Parse(time.RFC3339, jam.Time)
			if err != nil {
				continue
			}
			delta := msg.Timestamp.Sub(eventTime)
			if delta < 0 {
				delta = -delta
			}
			if delta <= maxTimeDelta {
				confidence := 0.3 + 0.3*(1.0-delta.Seconds()/maxTimeDelta.Seconds())
				if jam.Severity == "severe" {
					confidence += 0.15
				}
				correlations = append(correlations, TemporalCorrelation{
					MessageID:     msg.ID,
					OSINTCategory: "gps_jamming",
					OSINTEventID:  uuid.New().String(),
					TimeDelta:     delta.Seconds(),
					Confidence:    confidence,
					Details:       fmt.Sprintf("Message within %v of GPS jamming in %s (%s)", delta.Round(time.Minute), jam.Region, jam.Severity),
					Timestamp:     time.Now(),
				})
			}
		}

		// Check LiveUAMap conflict events
		for _, lua := range osintData.LiveUAMap {
			if lua.Time == "" {
				continue
			}
			eventTime, err := time.Parse(time.RFC3339, lua.Time)
			if err != nil {
				continue
			}
			delta := msg.Timestamp.Sub(eventTime)
			if delta < 0 {
				delta = -delta
			}
			if delta <= maxTimeDelta {
				correlations = append(correlations, TemporalCorrelation{
					MessageID:     msg.ID,
					OSINTCategory: "conflict",
					OSINTEventID:  uuid.New().String(),
					TimeDelta:     delta.Seconds(),
					Confidence:    0.5 + 0.3*(1.0-delta.Seconds()/maxTimeDelta.Seconds()),
					Details:       fmt.Sprintf("Message within %v of conflict event: %s", delta.Round(time.Minute), lua.Title),
					Timestamp:     time.Now(),
				})
			}
		}
	}

	return correlations
}

// correlateMessageContent performs content-based correlation (extracted from original correlator for reuse)
func correlateMessageContent(msg RawMessage, osintData *OSINTSnapshot) []CorrelationMatch {
	var matches []CorrelationMatch
	contentLower := strings.ToLower(msg.Content)

	// Correlate with earthquakes by location
	for _, eq := range osintData.Earthquakes {
		locLower := strings.ToLower(eq.Location)
		if locLower != "" && (strings.Contains(contentLower, locLower) || containsAnyWord(contentLower, locLower)) {
			confidence := 0.6
			if eq.Magnitude >= 6.0 {
				confidence = 0.85
			}
			matches = append(matches, CorrelationMatch{
				MessageID:     msg.ID,
				OSINTCategory: "earthquake",
				MatchType:     "location",
				Confidence:    confidence,
				Details: map[string]interface{}{
					"location":  eq.Location,
					"magnitude": eq.Magnitude,
				},
				Timestamp: time.Now(),
			})
		}
	}

	// Correlate with GPS jamming by region/keywords
	for _, jam := range osintData.GPSJamming {
		regionLower := strings.ToLower(jam.Region)
		if regionLower != "" && (strings.Contains(contentLower, regionLower) || strings.Contains(contentLower, "gps") || strings.Contains(contentLower, "jamming")) {
			confidence := 0.5
			if jam.Severity == "severe" {
				confidence = 0.8
			}
			matches = append(matches, CorrelationMatch{
				MessageID:     msg.ID,
				OSINTCategory: "gps_jamming",
				MatchType:     "keyword",
				Confidence:    confidence,
				Details: map[string]interface{}{
					"region":   jam.Region,
					"severity": jam.Severity,
				},
				Timestamp: time.Now(),
			})
		}
	}

	// Correlate with conflict events
	for _, lua := range osintData.LiveUAMap {
		titleLower := strings.ToLower(lua.Title)
		if titleLower != "" && containsAnyWord(contentLower, titleLower) {
			matches = append(matches, CorrelationMatch{
				MessageID:     msg.ID,
				OSINTCategory: "conflict",
				MatchType:     "keyword",
				Confidence:    0.7,
				Details: map[string]interface{}{
					"title":     lua.Title,
					"eventType": lua.EventType,
				},
				Timestamp: time.Now(),
			})
		}
	}

	// Correlate with UAV activity
	for _, uav := range osintData.UAVs {
		zoneLower := strings.ToLower(uav.Zone)
		if zoneLower != "" && strings.Contains(contentLower, zoneLower) {
			matches = append(matches, CorrelationMatch{
				MessageID:     msg.ID,
				OSINTCategory: "uav",
				MatchType:     "location",
				Confidence:    0.65,
				Details: map[string]interface{}{
					"callsign": uav.Callsign,
					"type":     uav.Type,
					"zone":     uav.Zone,
				},
				Timestamp: time.Now(),
			})
		}
	}

	// Correlate with news events
	for _, news := range osintData.News {
		titleLower := strings.ToLower(news.Title)
		if titleLower != "" && containsAnyWord(contentLower, titleLower) {
			matches = append(matches, CorrelationMatch{
				MessageID:     msg.ID,
				OSINTCategory: "news",
				MatchType:     "keyword",
				Confidence:    0.55,
				Details: map[string]interface{}{
					"title":  news.Title,
					"source": news.Source,
				},
				Timestamp: time.Now(),
			})
		}
	}

	// Correlate with SIGINT
	for _, sig := range osintData.SIGINT {
		callsignLower := strings.ToLower(sig.Callsign)
		if callsignLower != "" && strings.Contains(contentLower, callsignLower) {
			matches = append(matches, CorrelationMatch{
				MessageID:     msg.ID,
				OSINTCategory: "sigint",
				MatchType:     "keyword",
				Confidence:    0.7,
				Details: map[string]interface{}{
					"callsign":  sig.Callsign,
					"type":      sig.Type,
					"frequency": sig.Frequency,
				},
				Timestamp: time.Now(),
			})
		}
	}

	// Correlate with GDELT events
	for _, gdelt := range osintData.GDELT {
		nameLower := strings.ToLower(gdelt.Name)
		if nameLower != "" && containsAnyWord(contentLower, nameLower) {
			matches = append(matches, CorrelationMatch{
				MessageID:     msg.ID,
				OSINTCategory: "gdelt",
				MatchType:     "keyword",
				Confidence:    0.5,
				Details: map[string]interface{}{
					"name":   gdelt.Name,
					"source": gdelt.Source,
				},
				Timestamp: time.Now(),
			})
		}
	}

	return matches
}
