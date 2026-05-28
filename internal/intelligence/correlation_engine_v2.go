package intelligence

import (
        "context"
        "fmt"
        "math"
        "sort"
        "sync"
        "time"

        "github.com/google/uuid"
        "github.com/zerodha/logf"
)

// CorrelationEngineV2 provides an enhanced correlation engine with
// multi-method correlation, temporal analysis, and graph-based entity resolution
type CorrelationEngineV2 struct {
        eventStore *EventStore
        log        logf.Logger
        // Cache of recent correlations for fast access
        correlationCache []CorrelationResult
        cacheTime        time.Time
        mu               sync.RWMutex
}

// NewCorrelationEngineV2 creates a new enhanced correlation engine
func NewCorrelationEngineV2(es *EventStore, log logf.Logger) *CorrelationEngineV2 {
        return &CorrelationEngineV2{
                eventStore: es,
                log:        log,
        }
}

// CorrelationMethod represents a correlation analysis method
type CorrelationMethod string

const (
        CorrelationMethodJaccard    CorrelationMethod = "jaccard"
        CorrelationMethodCoMention  CorrelationMethod = "comention"
        CorrelationMethodTemporal   CorrelationMethod = "temporal"
        CorrelationMethodGeospatial CorrelationMethod = "geospatial"
        CorrelationMethodSemantic   CorrelationMethod = "semantic"
)

// EnhancedCorrelationResult extends CorrelationResult with additional metadata
type EnhancedCorrelationResult struct {
        EntityA      string            `json:"entityA"`
        EntityB      string            `json:"entityB"`
        Similarity   float64           `json:"similarity"`
        Methods      []CorrelationMethod `json:"methods"` // Multiple methods can agree
        Confidence   float64           `json:"confidence"` // Weighted confidence across methods
        Evidence     []CorrelationEvidence `json:"evidence"`
        DiscoveredAt time.Time         `json:"discoveredAt"`
}

// CorrelationEvidence represents evidence supporting a correlation
type CorrelationEvidence struct {
        Method      CorrelationMethod `json:"method"`
        Score       float64           `json:"score"`
        Description string            `json:"description"`
}

// CorrelationGraph represents the full entity correlation graph
type CorrelationGraph struct {
        Nodes     []CorrelationNode    `json:"nodes"`
        Edges     []CorrelationEdge    `json:"edges"`
        Clusters  []CorrelationCluster `json:"clusters"`
        Generated time.Time            `json:"generated"`
}

// CorrelationNode represents a node in the correlation graph
type CorrelationNode struct {
        ID         string   `json:"id"`
        Name       string   `json:"name"`
        Type       string   `json:"type"`
        RiskScore  int      `json:"riskScore"`
        Sources    []string `json:"sources"`
        EdgeCount  int      `json:"edgeCount"`
}

// CorrelationEdge represents an edge in the correlation graph
type CorrelationEdge struct {
        Source     string  `json:"source"`
        Target     string  `json:"target"`
        Similarity float64 `json:"similarity"`
        Methods    []CorrelationMethod `json:"methods"`
        Confidence float64 `json:"confidence"`
}

// CorrelationCluster represents a cluster of correlated entities
type CorrelationCluster struct {
        ID          string   `json:"id"`
        EntityIDs   []string `json:"entityIds"`
        Size        int      `json:"size"`
        AvgRisk     float64  `json:"avgRisk"`
        DominantType string  `json:"dominantType"`
}

// MultiMethodCorrelate performs correlation using multiple methods and combines results
func (ce *CorrelationEngineV2) MultiMethodCorrelate(ctx context.Context, entities []Entity, messages []RawMessage) []EnhancedCorrelationResult {
        if len(entities) < 2 {
                return nil
        }

        // Run all correlation methods
        jaccardResults := ce.jaccardCorrelation(entities)
        comentionResults := ce.coMentionCorrelation(entities, messages)
        temporalResults := ce.temporalCorrelation(entities, messages)
        geospatialResults := ce.geospatialCorrelation(entities)

        // Merge results by entity pair
        pairMap := make(map[string]*EnhancedCorrelationResult)

        mergeResults := func(results []CorrelationResult, method CorrelationMethod) {
                for _, r := range results {
                        key := r.EntityA + ":" + r.EntityB
                        if r.EntityA > r.EntityB {
                                key = r.EntityB + ":" + r.EntityA
                        }

                        if existing, ok := pairMap[key]; ok {
                                existing.Methods = append(existing.Methods, method)
                                existing.Evidence = append(existing.Evidence, CorrelationEvidence{
                                        Method:      method,
                                        Score:       r.Similarity,
                                        Description: fmt.Sprintf("%s similarity: %.2f", method, r.Similarity),
                                })
                                // Weighted average: more methods = higher confidence
                                existing.Similarity = (existing.Similarity + r.Similarity) / 2
                                existing.Confidence = float64(len(existing.Methods)) / 4.0 // 4 total methods (incl. geospatial)
                                if existing.Confidence > 1.0 {
                                        existing.Confidence = 1.0
                                }
                        } else {
                                pairMap[key] = &EnhancedCorrelationResult{
                                        EntityA:    r.EntityA,
                                        EntityB:    r.EntityB,
                                        Similarity: r.Similarity,
                                        Methods:    []CorrelationMethod{method},
                                        Confidence: 1.0 / 4.0,
                                        Evidence: []CorrelationEvidence{
                                                {
                                                        Method:      method,
                                                        Score:       r.Similarity,
                                                        Description: fmt.Sprintf("%s similarity: %.2f", method, r.Similarity),
                                                },
                                        },
                                        DiscoveredAt: time.Now(),
                                }
                        }
                }
        }

        mergeResults(jaccardResults, CorrelationMethodJaccard)
        mergeResults(comentionResults, CorrelationMethodCoMention)
        mergeResults(temporalResults, CorrelationMethodTemporal)
        mergeResults(geospatialResults, CorrelationMethodGeospatial)

        // Filter to only high-confidence correlations
        var results []EnhancedCorrelationResult
        for _, r := range pairMap {
                if r.Similarity > 0.2 || len(r.Methods) >= 2 {
                        results = append(results, *r)
                }
        }

        // Sort by confidence descending
        sort.Slice(results, func(i, j int) bool {
                return results[i].Confidence > results[j].Confidence
        })

        // Store correlation events
        for _, result := range results {
                _ = ce.eventStore.Append(ctx, StreamAnalyzedMessages, IntelligenceEvent{
                        EventType:     EventTypeCorrelationFound,
                        AggregateID:   uuid.New().String(),
                        AggregateType: "enhanced_correlation",
                        Payload: map[string]interface{}{
                                "entityA":    result.EntityA,
                                "entityB":    result.EntityB,
                                "similarity": result.Similarity,
                                "methods":    result.Methods,
                                "confidence": result.Confidence,
                        },
                        Timestamp: time.Now(),
                })
        }

        // Cache results
        ce.mu.Lock()
        ce.correlationCache = convertToBasicResults(results)
        ce.cacheTime = time.Now()
        ce.mu.Unlock()

        return results
}

// Correlate is the primary entry point that runs multi-method correlation
// and returns enhanced results. It wraps MultiMethodCorrelate for convenience.
func (ce *CorrelationEngineV2) Correlate(ctx context.Context, entities []Entity, messages []RawMessage) []EnhancedCorrelationResult {
        return ce.MultiMethodCorrelate(ctx, entities, messages)
}

// BuildCorrelationGraph builds a complete correlation graph from entities and correlations
func (ce *CorrelationEngineV2) BuildCorrelationGraph(entities []Entity, correlations []EnhancedCorrelationResult) *CorrelationGraph {
        graph := &CorrelationGraph{
                Generated: time.Now(),
        }

        // Build nodes
        edgeCountMap := make(map[string]int)
        for _, c := range correlations {
                edgeCountMap[c.EntityA]++
                edgeCountMap[c.EntityB]++
        }

        for _, e := range entities {
                graph.Nodes = append(graph.Nodes, CorrelationNode{
                        ID:        e.ID,
                        Name:      e.Name,
                        Type:      e.Type,
                        RiskScore: e.RiskScore,
                        Sources:   e.Sources,
                        EdgeCount: edgeCountMap[e.ID],
                })
        }

        // Build edges
        for _, c := range correlations {
                graph.Edges = append(graph.Edges, CorrelationEdge{
                        Source:     c.EntityA,
                        Target:     c.EntityB,
                        Similarity: c.Similarity,
                        Methods:    c.Methods,
                        Confidence: c.Confidence,
                })
        }

        // Find clusters using connected components
        graph.Clusters = ce.findClusters(entities, graph.Edges)

        return graph
}

// jaccardCorrelation performs Jaccard similarity correlation (delegated to original engine)
func (ce *CorrelationEngineV2) jaccardCorrelation(entities []Entity) []CorrelationResult {
        origEngine := &CorrelationEngine{eventStore: ce.eventStore, log: ce.log}
        return origEngine.CorrelateEntities(context.Background(), entities)
}

// coMentionCorrelation performs co-mention correlation
func (ce *CorrelationEngineV2) coMentionCorrelation(entities []Entity, messages []RawMessage) []CorrelationResult {
        origEngine := &CorrelationEngine{eventStore: ce.eventStore, log: ce.log}
        return origEngine.FindComentions(context.Background(), entities, messages)
}

// geospatialCorrelation correlates entities that are near the same geographic location.
// It uses the Lat/Lon fields on entities (if available) and applies the Haversine
// formula to compute great-circle distance. Entities within a configurable proximity
// threshold (default 50 km) receive a similarity score that decays with distance.
const geospatialProximityKm = 50.0

func (ce *CorrelationEngineV2) geospatialCorrelation(entities []Entity) []CorrelationResult {
        var results []CorrelationResult

        // Collect only entities that have valid lat/lon
        type geoEntity struct {
                id  string
                lat float64
                lon float64
        }
        var geoEntities []geoEntity
        for _, e := range entities {
                if e.Lat != 0 || e.Lon != 0 {
                        geoEntities = append(geoEntities, geoEntity{id: e.ID, lat: e.Lat, lon: e.Lon})
                }
        }

        // Pairwise Haversine comparison
        for i := 0; i < len(geoEntities); i++ {
                for j := i + 1; j < len(geoEntities); j++ {
                        dist := haversineDistance(geoEntities[i].lat, geoEntities[i].lon, geoEntities[j].lat, geoEntities[j].lon)
                        if dist <= geospatialProximityKm {
                                // Similarity decays linearly from 1.0 (same point) to 0.0 (at threshold)
                                similarity := 1.0 - (dist / geospatialProximityKm)
                                if similarity > 0.2 {
                                        results = append(results, CorrelationResult{
                                                EntityA:    geoEntities[i].id,
                                                EntityB:    geoEntities[j].id,
                                                Similarity: similarity,
                                                Method:     "geospatial",
                                        })
                                }
                        }
                }
        }

        return results
}

// haversineDistance computes the great-circle distance between two lat/lon points in km.
func haversineDistance(lat1, lon1, lat2, lon2 float64) float64 {
        const earthRadiusKm = 6371.0

        lat1Rad := lat1 * math.Pi / 180.0
        lat2Rad := lat2 * math.Pi / 180.0
        deltaLat := (lat2 - lat1) * math.Pi / 180.0
        deltaLon := (lon2 - lon1) * math.Pi / 180.0

        a := math.Sin(deltaLat/2)*math.Sin(deltaLat/2) +
                math.Cos(lat1Rad)*math.Cos(lat2Rad)*
                        math.Sin(deltaLon/2)*math.Sin(deltaLon/2)
        c := 2 * math.Atan2(math.Sqrt(a), math.Sqrt(1-a))

        return earthRadiusKm * c
}

// temporalCorrelation performs temporal proximity correlation
func (ce *CorrelationEngineV2) temporalCorrelation(entities []Entity, messages []RawMessage) []CorrelationResult {
        var results []CorrelationResult

        // Group entities by source
        entityBySource := make(map[string][]Entity)
        for _, e := range entities {
                for _, s := range e.Sources {
                        entityBySource[s] = append(entityBySource[s], e)
                }
        }

        // Find entities mentioned in temporally close messages
        type entityTime struct {
                entityID string
                time     time.Time
        }

        var entityTimes []entityTime
        for _, msg := range messages {
                for _, e := range entities {
                        for _, s := range e.Sources {
                                if s == msg.Source {
                                        entityTimes = append(entityTimes, entityTime{e.ID, msg.Timestamp})
                                }
                        }
                }
        }

        // Find temporally close entity pairs (within 1 hour)
        for i := 0; i < len(entityTimes); i++ {
                for j := i + 1; j < len(entityTimes); j++ {
                        if entityTimes[i].entityID == entityTimes[j].entityID {
                                continue
                        }
                        delta := entityTimes[i].time.Sub(entityTimes[j].time)
                        if delta < 0 {
                                delta = -delta
                        }
                        if delta <= time.Hour {
                                similarity := 1.0 - delta.Seconds()/3600.0
                                if similarity > 0.3 {
                                        results = append(results, CorrelationResult{
                                                EntityA:    entityTimes[i].entityID,
                                                EntityB:    entityTimes[j].entityID,
                                                Similarity: similarity,
                                                Method:     "temporal",
                                        })
                                }
                        }
                }
        }

        return results
}

// findClusters finds clusters in the correlation graph using connected components
func (ce *CorrelationEngineV2) findClusters(entities []Entity, edges []CorrelationEdge) []CorrelationCluster {
        // Build adjacency list
        adj := make(map[string]map[string]bool)
        for _, e := range edges {
                if adj[e.Source] == nil {
                        adj[e.Source] = make(map[string]bool)
                }
                if adj[e.Target] == nil {
                        adj[e.Target] = make(map[string]bool)
                }
                adj[e.Source][e.Target] = true
                adj[e.Target][e.Source] = true
        }

        // BFS to find connected components
        visited := make(map[string]bool)
        var clusters []CorrelationCluster

        entityMap := make(map[string]Entity)
        for _, e := range entities {
                entityMap[e.ID] = e
        }

        for _, e := range entities {
                if visited[e.ID] {
                        continue
                }

                var component []string
                queue := []string{e.ID}
                visited[e.ID] = true

                for len(queue) > 0 {
                        current := queue[0]
                        queue = queue[1:]
                        component = append(component, current)

                        for neighbor := range adj[current] {
                                if !visited[neighbor] {
                                        visited[neighbor] = true
                                        queue = append(queue, neighbor)
                                }
                        }
                }

                if len(component) > 1 {
                        cluster := CorrelationCluster{
                                ID:        uuid.New().String(),
                                EntityIDs: component,
                                Size:      len(component),
                        }

                        // Calculate average risk and dominant type
                        totalRisk := 0
                        typeCount := make(map[string]int)
                        for _, id := range component {
                                if e, ok := entityMap[id]; ok {
                                        totalRisk += e.RiskScore
                                        typeCount[e.Type]++
                                }
                        }

                        cluster.AvgRisk = float64(totalRisk) / float64(len(component))
                        maxCount := 0
                        for t, c := range typeCount {
                                if c > maxCount {
                                        maxCount = c
                                        cluster.DominantType = t
                                }
                        }

                        clusters = append(clusters, cluster)
                }
        }

        return clusters
}

// convertToBasicResults converts enhanced results to basic CorrelationResults
func convertToBasicResults(enhanced []EnhancedCorrelationResult) []CorrelationResult {
        results := make([]CorrelationResult, len(enhanced))
        for i, e := range enhanced {
                results[i] = CorrelationResult{
                        EntityA:    e.EntityA,
                        EntityB:    e.EntityB,
                        Similarity: e.Similarity,
                        Method:     "multi_method",
                }
        }
        return results
}
