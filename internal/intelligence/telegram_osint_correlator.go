package intelligence

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/zerodha/logf"
)

// TelegramOSINTCorrelator correlates Telegram messages with OSINT data
// to identify connections between chat activity and real-world events
type TelegramOSINTCorrelator struct {
	eventStore *EventStore
	analysis   *AnalysisEngine
	log        logf.Logger
}

// NewTelegramOSINTCorrelator creates a new correlator
func NewTelegramOSINTCorrelator(es *EventStore, ae *AnalysisEngine, log logf.Logger) *TelegramOSINTCorrelator {
	return &TelegramOSINTCorrelator{
		eventStore: es,
		analysis:   ae,
		log:        log,
	}
}

// CorrelationMatch represents a match between a Telegram message and OSINT data
type CorrelationMatch struct {
	MessageID      string                 `json:"messageId"`
	OSINTCategory  string                 `json:"osintCategory"`
	OSINTEventID   string                 `json:"osintEventId"`
	MatchType      string                 `json:"matchType"` // "location", "keyword", "entity", "temporal"
	Confidence     float64                `json:"confidence"`
	Details        map[string]interface{} `json:"details"`
	Timestamp      time.Time              `json:"timestamp"`
}

// CorrelateMessage correlates a single Telegram message with OSINT data
func (toc *TelegramOSINTCorrelator) CorrelateMessage(ctx context.Context, msg RawMessage, osintData *OSINTSnapshot) []CorrelationMatch {
	if osintData == nil {
		return nil
	}

	var matches []CorrelationMatch
	contentLower := strings.ToLower(msg.Content)

	// Correlate with earthquakes
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
					"depth":     eq.Depth,
					"time":      eq.Time,
				},
				Timestamp: time.Now(),
			})
		}
	}

	// Correlate with GPS jamming events
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
					"region":      jam.Region,
					"severity":    jam.Severity,
					"description": jam.Description,
				},
				Timestamp: time.Now(),
			})
		}
	}

	// Correlate with conflict events (LiveUAMap)
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
					"lat":       lua.Lat,
					"lon":       lua.Lon,
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
					"callsign":  uav.Callsign,
					"type":      uav.Type,
					"altitude":  uav.Altitude,
					"zone":      uav.Zone,
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
					"url":    news.URL,
				},
				Timestamp: time.Now(),
			})
		}
	}

	// Store correlation events
	for _, match := range matches {
		_ = toc.eventStore.Append(ctx, StreamAnalyzedMessages, IntelligenceEvent{
			EventType:     EventTypeCorrelationFound,
			AggregateID:   match.MessageID,
			AggregateType: "telegram_osint_correlation",
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

	if len(matches) > 0 {
		toc.log.Info("Telegram-OSINT correlations found", "messageId", msg.ID, "matches", len(matches))
	}

	return matches
}

// CorrelateBatch correlates multiple Telegram messages with OSINT data
func (toc *TelegramOSINTCorrelator) CorrelateBatch(ctx context.Context, messages []RawMessage, osintData *OSINTSnapshot) []CorrelationMatch {
	var allMatches []CorrelationMatch
	for _, msg := range messages {
		matches := toc.CorrelateMessage(ctx, msg, osintData)
		allMatches = append(allMatches, matches...)
	}
	return allMatches
}

// containsAnyWord checks if any word from the target string appears in the content
func containsAnyWord(content, target string) bool {
	words := strings.Fields(target)
	for _, word := range words {
		if len(word) > 3 && strings.Contains(content, word) {
			return true
		}
	}
	return false
}

// FormatCorrelationReport generates a human-readable report of correlations
func (toc *TelegramOSINTCorrelator) FormatCorrelationReport(matches []CorrelationMatch) string {
	if len(matches) == 0 {
		return "No Telegram-OSINT correlations found"
	}

	// Group by category
	byCategory := make(map[string][]CorrelationMatch)
	for _, m := range matches {
		byCategory[m.OSINTCategory] = append(byCategory[m.OSINTCategory], m)
	}

	report := fmt.Sprintf("Telegram-OSINT Correlation Report\n%d correlations found across %d categories\n\n", len(matches), len(byCategory))

	for cat, catMatches := range byCategory {
		report += fmt.Sprintf("## %s (%d matches)\n", strings.Title(cat), len(catMatches))
		for _, m := range catMatches {
			report += fmt.Sprintf("  - Message %s [%s] confidence: %.0f%%\n", m.MessageID, m.MatchType, m.Confidence*100)
		}
		report += "\n"
	}

	return report
}
