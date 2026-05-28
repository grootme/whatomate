package intelligence

import (
	"context"
	"encoding/json"
	"fmt"
	"sync"
	"time"

	"github.com/redis/go-redis/v9"
	"github.com/zerodha/logf"
)

// OSINTCacheManager provides advanced caching with prefetch, staleness detection,
// and category-level caching for more granular cache control
type OSINTCacheManager struct {
	redis   *redis.Client
	osint   *OSINTClient
	basic   *OSINTCache
	log     logf.Logger
	ttl     time.Duration
	mu      sync.RWMutex
	prefetchRunning bool
	cancel  context.CancelFunc
}

// NewOSINTCacheManager creates a new advanced OSINT cache manager
func NewOSINTCacheManager(rdb *redis.Client, osint *OSINTClient, basic *OSINTCache, log logf.Logger, ttl time.Duration) *OSINTCacheManager {
	return &OSINTCacheManager{
		redis: rdb,
		osint: osint,
		basic: basic,
		log:   log,
		ttl:   ttl,
	}
}

const (
	osintCacheCategoryPrefix = "whatomate:osint_cache:cat:"
	osintCacheStalenessKey   = "whatomate:osint_cache:staleness"
)

// OSINTCacheEntry represents a cached OSINT category with metadata
type OSINTCacheEntry struct {
	Category   string      `json:"category"`
	Data       interface{} `json:"data"`
	CachedAt   time.Time   `json:"cachedAt"`
	ExpiresAt  time.Time   `json:"expiresAt"`
	ItemCount  int         `json:"itemCount"`
	IsStale    bool        `json:"isStale"`
}

// CacheFreshness represents the freshness status of cached OSINT data
type CacheFreshness struct {
	OverallFresh  bool                       `json:"overallFresh"`
	LastFetch     *time.Time                 `json:"lastFetch,omitempty"`
	CategoryFresh map[string]bool            `json:"categoryFresh"`
	Staleness     map[string]time.Duration   `json:"staleness,omitempty"`
}

// GetSnapshotWithFallback tries cache first, then fetches on miss
func (ocm *OSINTCacheManager) GetSnapshotWithFallback(ctx context.Context) *OSINTSnapshot {
	// Try cache first
	cached := ocm.basic.GetSnapshot(ctx)
	if cached != nil {
		// Check if data is stale
		freshness := ocm.CheckFreshness(ctx)
		if freshness.OverallFresh {
			ocm.log.Debug("OSINT cache hit", "categories", len(freshness.CategoryFresh))
			return cached
		}
		ocm.log.Info("OSINT cache stale, fetching fresh data")
	}

	// Fetch fresh data
	fresh, err := ocm.osint.FetchOSINTData(ctx)
	if err != nil {
		ocm.log.Warn("Failed to fetch fresh OSINT data, using stale cache", "error", err)
		return cached // Return stale cache if fetch fails
	}

	// Update cache
	if err := ocm.basic.SetSnapshot(ctx, fresh); err != nil {
		ocm.log.Error("Failed to update OSINT cache", "error", err)
	}

	// Cache individual categories
	ocm.cacheCategories(ctx, fresh)

	return fresh
}

// CheckFreshness checks how fresh the cached OSINT data is
func (ocm *OSINTCacheManager) CheckFreshness(ctx context.Context) CacheFreshness {
	freshness := CacheFreshness{
		CategoryFresh: make(map[string]bool),
		Staleness:     make(map[string]time.Duration),
	}

	lastFetch := ocm.basic.GetLastFetchTime(ctx)
	freshness.LastFetch = lastFetch

	if lastFetch == nil {
		freshness.OverallFresh = false
		return freshness
	}

	staleness := time.Since(*lastFetch)
	freshness.OverallFresh = staleness <= ocm.ttl

	// Check per-category freshness
	categories := []string{
		"earthquakes", "flights", "fires", "ships", "gdelt",
		"news", "gps_jamming", "uavs", "liveuamap", "sigint", "weather",
	}

	for _, cat := range categories {
		catCachedAt := ocm.getCategoryCachedAt(ctx, cat)
		if catCachedAt == nil {
			freshness.CategoryFresh[cat] = false
			freshness.Staleness[cat] = ocm.ttl + time.Hour // Very stale
		} else {
			catStaleness := time.Since(*catCachedAt)
			freshness.CategoryFresh[cat] = catStaleness <= ocm.ttl
			freshness.Staleness[cat] = catStaleness
		}
	}

	return freshness
}

// StartPrefetch starts a background goroutine that prefetches OSINT data before it expires
func (ocm *OSINTCacheManager) StartPrefetch(ctx context.Context) {
	ocm.mu.Lock()
	if ocm.prefetchRunning {
		ocm.mu.Unlock()
		return
	}
	ocm.prefetchRunning = true
	ocm.mu.Unlock()

	// Prefetch at 80% of TTL (e.g., if TTL=5min, prefetch at 4min)
	prefetchInterval := time.Duration(float64(ocm.ttl) * 0.8)
	if prefetchInterval < time.Minute {
		prefetchInterval = time.Minute
	}

	ctx, cancel := context.WithCancel(ctx)
	ocm.cancel = cancel

	go func() {
		ticker := time.NewTicker(prefetchInterval)
		defer ticker.Stop()

		for {
			select {
			case <-ctx.Done():
				ocm.mu.Lock()
				ocm.prefetchRunning = false
				ocm.mu.Unlock()
				return
			case <-ticker.C:
				ocm.log.Debug("OSINT cache prefetch triggered")
				fresh, err := ocm.osint.FetchOSINTData(ctx)
				if err != nil {
					ocm.log.Warn("OSINT cache prefetch failed", "error", err)
					continue
				}
				if err := ocm.basic.SetSnapshot(ctx, fresh); err != nil {
					ocm.log.Error("Failed to update OSINT cache during prefetch", "error", err)
				}
				ocm.cacheCategories(ctx, fresh)
				ocm.log.Info("OSINT cache prefetch completed")
			}
		}
	}()

	ocm.log.Info("OSINT cache prefetch started", "interval", prefetchInterval)
}

// StopPrefetch stops the background prefetch goroutine
func (ocm *OSINTCacheManager) StopPrefetch() {
	ocm.mu.Lock()
	defer ocm.mu.Unlock()

	if ocm.cancel != nil {
		ocm.cancel()
	}
	ocm.prefetchRunning = false
}

// GetCategory retrieves a cached OSINT category independently
func (ocm *OSINTCacheManager) GetCategory(ctx context.Context, category string) (interface{}, error) {
	if ocm.redis == nil {
		return nil, fmt.Errorf("Redis not available")
	}

	key := osintCacheCategoryPrefix + category
	data, err := ocm.redis.Get(ctx, key).Result()
	if err != nil {
		if err == redis.Nil {
			return nil, nil // Not cached
		}
		return nil, fmt.Errorf("failed to get cached category %s: %w", category, err)
	}

	var result interface{}
	if err := json.Unmarshal([]byte(data), &result); err != nil {
		return nil, fmt.Errorf("failed to unmarshal cached category %s: %w", category, err)
	}

	return result, nil
}

// cacheCategories caches individual OSINT categories for granular access
func (ocm *OSINTCacheManager) cacheCategories(ctx context.Context, snapshot *OSINTSnapshot) {
	if ocm.redis == nil || snapshot == nil {
		return
	}

	now := time.Now()
	categories := map[string]interface{}{
		"earthquakes": snapshot.Earthquakes,
		"flights":     snapshot.Flights,
		"fires":       snapshot.Fires,
		"ships":       snapshot.Ships,
		"gdelt":       snapshot.GDELT,
		"news":        snapshot.News,
		"gps_jamming": snapshot.GPSJamming,
		"uavs":        snapshot.UAVs,
		"liveuamap":   snapshot.LiveUAMap,
		"sigint":      snapshot.SIGINT,
	}

	pipe := ocm.redis.Pipeline()
	for cat, data := range categories {
		key := osintCacheCategoryPrefix + cat
		entry := OSINTCacheEntry{
			Category:  cat,
			Data:      data,
			CachedAt:  now,
			ExpiresAt: now.Add(ocm.ttl),
		}
		if slice, ok := data.([]interface{}); ok {
			entry.ItemCount = len(slice)
		}

		bytes, err := json.Marshal(entry)
		if err != nil {
			continue
		}
		pipe.Set(ctx, key, string(bytes), ocm.ttl)
	}

	if snapshot.Weather != nil {
		key := osintCacheCategoryPrefix + "weather"
		entry := OSINTCacheEntry{
			Category:  "weather",
			Data:      snapshot.Weather,
			CachedAt:  now,
			ExpiresAt: now.Add(ocm.ttl),
		}
		bytes, _ := json.Marshal(entry)
		pipe.Set(ctx, key, string(bytes), ocm.ttl)
	}

	_, err := pipe.Exec(ctx)
	if err != nil {
		ocm.log.Warn("Failed to cache some OSINT categories", "error", err)
	}
}

// getCategoryCachedAt returns when a specific category was last cached
func (ocm *OSINTCacheManager) getCategoryCachedAt(ctx context.Context, category string) *time.Time {
	if ocm.redis == nil {
		return nil
	}

	key := osintCacheCategoryPrefix + category
	data, err := ocm.redis.Get(ctx, key).Result()
	if err != nil {
		return nil
	}

	var entry OSINTCacheEntry
	if err := json.Unmarshal([]byte(data), &entry); err != nil {
		return nil
	}

	return &entry.CachedAt
}

// GetCacheInfo returns comprehensive cache information
func (ocm *OSINTCacheManager) GetCacheInfo(ctx context.Context) map[string]interface{} {
	info := make(map[string]interface{})
	info["ttl"] = ocm.ttl.String()

	basicStats := ocm.basic.GetStats(ctx)
	info["basicCache"] = basicStats

	freshness := ocm.CheckFreshness(ctx)
	info["freshness"] = freshness

	ocm.mu.RLock()
	info["prefetchRunning"] = ocm.prefetchRunning
	ocm.mu.RUnlock()

	return info
}
