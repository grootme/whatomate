package intelligence

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/zerodha/logf"
)

// CorrelationEngine implements cross-platform entity correlation and co-mention analysis
type CorrelationEngine struct {
	eventStore *EventStore
	log        logf.Logger
}

// NewCorrelationEngine creates a new CorrelationEngine
func NewCorrelationEngine(es *EventStore, log logf.Logger) *CorrelationEngine {
	return &CorrelationEngine{
		eventStore: es,
		log:        log,
	}
}

// CorrelateEntities performs Jaccard similarity cross-platform entity matching
// Entities appearing on multiple platforms (WhatsApp, Telegram, OSINT) are correlated
func (ce *CorrelationEngine) CorrelateEntities(ctx context.Context, entities []Entity) []CorrelationResult {
	var results []CorrelationResult

	// Group entities by normalized name
	nameGroups := make(map[string][]Entity)
	for _, e := range entities {
		normalizedName := normalizeEntityName(e.Name)
		nameGroups[normalizedName] = append(nameGroups[normalizedName], e)
	}

	// Find entities that appear across multiple sources (cross-platform)
	for _, group := range nameGroups {
		if len(group) < 2 {
			continue
		}

		// Calculate Jaccard similarity based on sources
		sourceSets := make(map[string]map[string]bool)
		for _, e := range group {
			if sourceSets[e.Type] == nil {
				sourceSets[e.Type] = make(map[string]bool)
			}
			for _, s := range e.Sources {
				sourceSets[e.Type][s] = true
			}
		}

		// Compare each pair within the group
		for i := 0; i < len(group); i++ {
			for j := i + 1; j < len(group); j++ {
				similarity := ce.jaccardSimilarity(group[i].Sources, group[j].Sources)
				if similarity > 0.3 { // Threshold for meaningful correlation
					results = append(results, CorrelationResult{
						EntityA:    group[i].ID,
						EntityB:    group[j].ID,
						Similarity: similarity,
						Method:     "jaccard",
					})
				}
			}
		}

		// Also correlate by same name across different types
		if len(sourceSets) > 1 {
			types := make([]string, 0, len(sourceSets))
			for t := range sourceSets {
				types = append(types, t)
			}
			for i := 0; i < len(types); i++ {
				for j := i + 1; j < len(types); j++ {
					similarity := ce.jaccardSimilaritySets(sourceSets[types[i]], sourceSets[types[j]])
					if similarity > 0.2 {
						// Find representative entities for each type
						var entityA, entityB string
						for _, e := range group {
							if e.Type == types[i] && entityA == "" {
								entityA = e.ID
							}
							if e.Type == types[j] && entityB == "" {
								entityB = e.ID
							}
						}
						if entityA != "" && entityB != "" {
							results = append(results, CorrelationResult{
								EntityA:    entityA,
								EntityB:    entityB,
								Similarity: similarity,
								Method:     "jaccard",
							})
						}
					}
				}
			}
		}
	}

	// Store correlation events
	for _, result := range results {
		_ = ce.eventStore.Append(ctx, StreamAnalyzedMessages, IntelligenceEvent{
			EventType:     EventTypeCorrelationFound,
			AggregateID:   uuid.New().String(),
			AggregateType: "correlation",
			Payload: map[string]interface{}{
				"entityA":    result.EntityA,
				"entityB":    result.EntityB,
				"similarity": result.Similarity,
				"method":     result.Method,
			},
			Timestamp: time.Now(),
		})
	}

	return results
}

// FindComentions analyzes co-mentions of entities within messages
// Two entities are co-mentioned if they appear in the same message or nearby messages
func (ce *CorrelationEngine) FindComentions(ctx context.Context, entities []Entity, messages []RawMessage) []CorrelationResult {
	var results []CorrelationResult

	// Build a map of which entities appear in which messages
	entityMessages := make(map[string][]string) // entityID -> []messageID
	messageEntities := make(map[string][]string) // messageID -> []entityID

	for _, msg := range messages {
		// Check which entities are mentioned in this message
		contentLower := strings.ToLower(msg.Content)
		for _, entity := range entities {
			if strings.Contains(contentLower, strings.ToLower(entity.Name)) {
				entityMessages[entity.ID] = append(entityMessages[entity.ID], msg.ID)
				messageEntities[msg.ID] = append(messageEntities[msg.ID], entity.ID)
			}
		}
	}

	// Count co-occurrences
	coMentionCount := make(map[string]int) // "entityA:entityB" -> count

	for _, entityIDs := range messageEntities {
		// All pairs of entities in the same message
		for i := 0; i < len(entityIDs); i++ {
			for j := i + 1; j < len(entityIDs); j++ {
				key := entityIDs[i] + ":" + entityIDs[j]
				if entityIDs[i] > entityIDs[j] {
					key = entityIDs[j] + ":" + entityIDs[i]
				}
				coMentionCount[key]++
			}
		}
	}

	// Convert significant co-mentions to correlation results
	for key, count := range coMentionCount {
		if count < 2 {
			continue // Require at least 2 co-mentions
		}

		parts := strings.SplitN(key, ":", 2)
		if len(parts) != 2 {
			continue
		}

		// Calculate similarity based on co-mention frequency
		entityAMentions := len(entityMessages[parts[0]])
		entityBMentions := len(entityMessages[parts[1]])
		if entityAMentions == 0 || entityBMentions == 0 {
			continue
		}

		// Jaccard-like similarity for co-mentions
		similarity := float64(count) / float64(entityAMentions+entityBMentions-count)
		if similarity < 0.1 {
			continue
		}

		results = append(results, CorrelationResult{
			EntityA:    parts[0],
			EntityB:    parts[1],
			Similarity: similarity,
			Method:     "comention",
		})
	}

	// Store co-mention events
	for _, result := range results {
		_ = ce.eventStore.Append(ctx, StreamAnalyzedMessages, IntelligenceEvent{
			EventType:     EventTypeCorrelationFound,
			AggregateID:   uuid.New().String(),
			AggregateType: "correlation",
			Payload: map[string]interface{}{
				"entityA":    result.EntityA,
				"entityB":    result.EntityB,
				"similarity": result.Similarity,
				"method":     "comention",
			},
			Timestamp: time.Now(),
		})
	}

	return results
}

// CorrelatePatterns finds correlations between different detected patterns
func (ce *CorrelationEngine) CorrelatePatterns(ctx context.Context, patterns []PatternDetection) []CorrelationResult {
	var results []CorrelationResult

	// Group patterns by shared entities
	entityPatterns := make(map[string][]string) // entityID -> []patternID
	for _, p := range patterns {
		for _, eID := range p.EntityIDs {
			entityPatterns[eID] = append(entityPatterns[eID], p.ID)
		}
	}

	// Find patterns that share entities
	for _, patternIDs := range entityPatterns {
		if len(patternIDs) < 2 {
			continue
		}

		for i := 0; i < len(patternIDs); i++ {
			for j := i + 1; j < len(patternIDs); j++ {
				results = append(results, CorrelationResult{
					EntityA:    patternIDs[i],
					EntityB:    patternIDs[j],
					Similarity: 0.7, // Shared entity is a strong correlation
					Method:     "temporal",
				})
			}
		}
	}

	// Find patterns of different types that overlap temporally
	for i := 0; i < len(patterns); i++ {
		for j := i + 1; j < len(patterns); j++ {
			if patterns[i].PatternType == patterns[j].PatternType {
				continue // Skip same-type patterns
			}

			// Check temporal proximity
			timeDiff := patterns[i].LastDetected.Sub(patterns[j].LastDetected)
			if timeDiff < 0 {
				timeDiff = -timeDiff
			}

			// If patterns were detected within 1 hour of each other
			if timeDiff < time.Hour {
				similarity := 1.0 - timeDiff.Seconds()/3600.0 // Closer in time = higher similarity
				if similarity > 0.5 {
					results = append(results, CorrelationResult{
						EntityA:    patterns[i].ID,
						EntityB:    patterns[j].ID,
						Similarity: similarity,
						Method:     "temporal",
					})
				}
			}
		}
	}

	// Store pattern correlation events
	for _, result := range results {
		_ = ce.eventStore.Append(ctx, StreamPatterns, IntelligenceEvent{
			EventType:     EventTypeCorrelationFound,
			AggregateID:   uuid.New().String(),
			AggregateType: "pattern_correlation",
			Payload: map[string]interface{}{
				"patternA":   result.EntityA,
				"patternB":   result.EntityB,
				"similarity": result.Similarity,
				"method":     result.Method,
			},
			Timestamp: time.Now(),
		})
	}

	return results
}

// jaccardSimilarity computes Jaccard similarity between two string slices
func (ce *CorrelationEngine) jaccardSimilarity(a, b []string) float64 {
	setA := make(map[string]bool)
	for _, s := range a {
		setA[s] = true
	}
	setB := make(map[string]bool)
	for _, s := range b {
		setB[s] = true
	}

	intersection := 0
	for s := range setA {
		if setB[s] {
			intersection++
		}
	}

	union := len(setA) + len(setB) - intersection
	if union == 0 {
		return 0
	}

	return float64(intersection) / float64(union)
}

// jaccardSimilaritySets computes Jaccard similarity between two map[string]bool sets
func (ce *CorrelationEngine) jaccardSimilaritySets(a, b map[string]bool) float64 {
	intersection := 0
	for s := range a {
		if b[s] {
			intersection++
		}
	}

	union := len(a) + len(b) - intersection
	if union == 0 {
		return 0
	}

	return float64(intersection) / float64(union)
}

// normalizeEntityName normalizes an entity name for comparison
func normalizeEntityName(name string) string {
	s := strings.ToLower(name)
	s = strings.TrimSpace(s)
	// Remove common prefixes
	s = strings.TrimPrefix(s, "+")
	// Remove common suffixes
	s = strings.TrimSuffix(s, ".com")
	s = strings.TrimSuffix(s, ".org")
	s = strings.TrimSuffix(s, ".net")
	return s
}

// BuildEntityGraph builds an adjacency graph of correlated entities
func (ce *CorrelationEngine) BuildEntityGraph(entities []Entity, correlations []CorrelationResult) map[string][]string {
	graph := make(map[string][]string)

	// Initialize graph with all entities
	for _, e := range entities {
		graph[e.ID] = []string{}
	}

	// Add edges from correlations
	for _, c := range correlations {
		graph[c.EntityA] = append(graph[c.EntityA], c.EntityB)
		graph[c.EntityB] = append(graph[c.EntityB], c.EntityA)
	}

	return graph
}

// FindClusters finds clusters of connected entities using the correlation graph
func (ce *CorrelationEngine) FindClusters(graph map[string][]string) [][]string {
	visited := make(map[string]bool)
	var clusters [][]string

	for node := range graph {
		if visited[node] {
			continue
		}

		// BFS to find connected component
		cluster := []string{}
		queue := []string{node}
		visited[node] = true

		for len(queue) > 0 {
			current := queue[0]
			queue = queue[1:]
			cluster = append(cluster, current)

			for _, neighbor := range graph[current] {
				if !visited[neighbor] {
					visited[neighbor] = true
					queue = append(queue, neighbor)
				}
			}
		}

		if len(cluster) > 1 {
			clusters = append(clusters, cluster)
		}
	}

	return clusters
}

// FormatCorrelationSummary produces a human-readable summary of correlations
func (ce *CorrelationEngine) FormatCorrelationSummary(correlations []CorrelationResult) string {
	if len(correlations) == 0 {
		return "No significant correlations found"
	}

	summary := fmt.Sprintf("Found %d correlations:\n", len(correlations))
	for i, c := range correlations {
		summary += fmt.Sprintf("  %d. %s ↔ %s (similarity: %.2f, method: %s)\n",
			i+1, c.EntityA, c.EntityB, c.Similarity, c.Method)
	}
	return summary
}
