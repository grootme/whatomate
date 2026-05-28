package intelligence

import (
        "context"
        "encoding/json"
        "fmt"
        "time"

        "github.com/redis/go-redis/v9"
        "github.com/zerodha/logf"
)

// OSINTCache provides a caching layer for OSINT data with configurable TTL
type OSINTCache struct {
        redis *redis.Client
        log   logf.Logger
        ttl   time.Duration
}

// NewOSINTCache creates a new OSINT caching layer
func NewOSINTCache(rdb *redis.Client, log logf.Logger, ttl time.Duration) *OSINTCache {
        if ttl == 0 {
                ttl = 5 * time.Minute // Default TTL
        }
        return &OSINTCache{
                redis: rdb,
                log:   log,
                ttl:   ttl,
        }
}

const (
        osintCacheKey        = "whatomate:osint_cache:snapshot"
        osintCacheThreatKey  = "whatomate:osint_cache:threat_level"
        osintCacheTimestamp  = "whatomate:osint_cache:last_fetch"
)

// GetSnapshot retrieves the cached OSINT snapshot, returns nil if not cached or expired
func (oc *OSINTCache) GetSnapshot(ctx context.Context) *OSINTSnapshot {
        if oc.redis == nil {
                return nil
        }

        data, err := oc.redis.Get(ctx, osintCacheKey).Result()
        if err != nil {
                if err != redis.Nil {
                        oc.log.Warn("Failed to get cached OSINT snapshot", "error", err)
                }
                return nil
        }

        var snapshot OSINTSnapshot
        if err := json.Unmarshal([]byte(data), &snapshot); err != nil {
                oc.log.Error("Failed to unmarshal cached OSINT snapshot", "error", err)
                return nil
        }

        return &snapshot
}

// SetSnapshot stores the OSINT snapshot in cache with configured TTL
func (oc *OSINTCache) SetSnapshot(ctx context.Context, snapshot *OSINTSnapshot) error {
        if oc.redis == nil || snapshot == nil {
                return nil
        }

        data, err := json.Marshal(snapshot)
        if err != nil {
                return fmt.Errorf("failed to marshal OSINT snapshot for caching: %w", err)
        }

        pipe := oc.redis.Pipeline()
        pipe.Set(ctx, osintCacheKey, string(data), oc.ttl)
        pipe.Set(ctx, osintCacheTimestamp, time.Now().Format(time.RFC3339), oc.ttl)

        _, err = pipe.Exec(ctx)
        if err != nil {
                return fmt.Errorf("failed to cache OSINT snapshot: %w", err)
        }

        oc.log.Debug("OSINT snapshot cached", "ttl", oc.ttl)
        return nil
}

// GetThreatLevel retrieves the cached threat level assessment
func (oc *OSINTCache) GetThreatLevel(ctx context.Context) *ThreatAssessment {
        if oc.redis == nil {
                return nil
        }

        data, err := oc.redis.Get(ctx, osintCacheThreatKey).Result()
        if err != nil {
                if err != redis.Nil {
                        oc.log.Warn("Failed to get cached threat level", "error", err)
                }
                return nil
        }

        var assessment ThreatAssessment
        if err := json.Unmarshal([]byte(data), &assessment); err != nil {
                oc.log.Error("Failed to unmarshal cached threat level", "error", err)
                return nil
        }

        return &assessment
}

// SetThreatLevel stores the threat level assessment in cache
func (oc *OSINTCache) SetThreatLevel(ctx context.Context, assessment *ThreatAssessment) error {
        if oc.redis == nil || assessment == nil {
                return nil
        }

        data, err := json.Marshal(assessment)
        if err != nil {
                return fmt.Errorf("failed to marshal threat assessment for caching: %w", err)
        }

        return oc.redis.Set(ctx, osintCacheThreatKey, string(data), oc.ttl).Err()
}

// GetLastFetchTime returns the timestamp of the last successful OSINT data fetch
func (oc *OSINTCache) GetLastFetchTime(ctx context.Context) *time.Time {
        if oc.redis == nil {
                return nil
        }

        ts, err := oc.redis.Get(ctx, osintCacheTimestamp).Result()
        if err != nil {
                return nil
        }

        t, err := time.Parse(time.RFC3339, ts)
        if err != nil {
                return nil
        }

        return &t
}

// Invalidate removes all cached OSINT data
func (oc *OSINTCache) Invalidate(ctx context.Context) error {
        if oc.redis == nil {
                return nil
        }

        pipe := oc.redis.Pipeline()
        pipe.Del(ctx, osintCacheKey)
        pipe.Del(ctx, osintCacheThreatKey)
        pipe.Del(ctx, osintCacheTimestamp)

        _, err := pipe.Exec(ctx)
        if err != nil {
                return fmt.Errorf("failed to invalidate OSINT cache: %w", err)
        }

        oc.log.Info("OSINT cache invalidated")
        return nil
}

// CacheStats returns statistics about the OSINT cache
type CacheStats struct {
        SnapshotCached    bool      `json:"snapshotCached"`
        ThreatLevelCached bool      `json:"threatLevelCached"`
        LastFetchTime     *time.Time `json:"lastFetchTime,omitempty"`
        TTL               string    `json:"ttl"`
}

// GetStats returns cache statistics
func (oc *OSINTCache) GetStats(ctx context.Context) CacheStats {
        stats := CacheStats{
                TTL: oc.ttl.String(),
        }

        if oc.redis == nil {
                return stats
        }

        exists := oc.redis.Exists(ctx, osintCacheKey).Val()
        stats.SnapshotCached = exists > 0

        exists = oc.redis.Exists(ctx, osintCacheThreatKey).Val()
        stats.ThreatLevelCached = exists > 0

        stats.LastFetchTime = oc.GetLastFetchTime(ctx)

        return stats
}
