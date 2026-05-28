/**
 * INNOVATION 8: Intelligence Dashboard Stats Cache
 *
 * Pre-computes expensive dashboard queries every 5 minutes.
 * API routes read from cache first, recompute if stale (>5 min).
 *
 * Cached metrics:
 * - Total messages (last 24h)
 * - Alerts by severity
 * - Active patterns
 * - Entity counts
 * - Threat level
 *
 * RICCO Patterns:
 * - Strategy Pattern: Cache invalidation strategy
 * - Event Sourcing: Cache refresh events recorded
 */

import { db } from '@/lib/db';
import { persistEvent } from './event-persist';
import { computeThreatLevel, type ThreatLevelResult } from './threat-level';

// ===== TYPES =====

export interface DashboardStats {
  totalMessages: number;
  messagesLast24h: number;
  alertsBySeverity: {
    CRITICA: number;
    ALTA: number;
    MEDIA: number;
    BAJA: number;
    INFO: number;
  };
  totalAlerts: number;
  unacknowledgedAlerts: number;
  activePatterns: number;
  confirmedPatterns: number;
  entityCount: number;
  highRiskEntities: number;
  threatLevel: ThreatLevelResult | null;
  agentHealth: {
    active: number;
    total: number;
    avgHealth: number;
  };
  computedAt: string;
  cacheAge: number; // ms since computation
}

// ===== IN-MEMORY CACHE =====

let cachedStats: DashboardStats | null = null;
let cacheTimestamp: number = 0;

/** Cache staleness threshold in milliseconds (5 minutes) */
const CACHE_STALE_MS = 5 * 60 * 1000;

/**
 * Check if the cache is still fresh.
 */
function isCacheFresh(): boolean {
  if (!cachedStats) return false;
  return Date.now() - cacheTimestamp < CACHE_STALE_MS;
}

/**
 * Get dashboard stats from cache, or recompute if stale.
 * This is the main entry point for API routes.
 */
export async function getDashboardStats(): Promise<DashboardStats> {
  if (isCacheFresh() && cachedStats) {
    return {
      ...cachedStats,
      cacheAge: Date.now() - cacheTimestamp,
    };
  }

  // Recompute
  const stats = await recomputeDashboardStats();
  return stats;
}

/**
 * Force recompute of dashboard stats, regardless of cache freshness.
 * Should be called by the scheduler every 5 minutes.
 */
export async function recomputeDashboardStats(): Promise<DashboardStats> {
  const now = new Date();
  const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  // Run all queries in parallel for performance
  const [
    totalMessages,
    messagesLast24h,
    alerts,
    unacknowledgedAlerts,
    activePatterns,
    confirmedPatterns,
    entityCount,
    highRiskEntities,
    agentStates,
  ] = await Promise.all([
    db.rawMessage.count(),
    db.rawMessage.count({ where: { timestamp: { gte: oneDayAgo } } }),
    db.alert.findMany({
      where: { timestamp: { gte: oneDayAgo } },
      select: { severity: true },
    }),
    db.alert.count({ where: { acknowledged: false } }),
    db.patternDetection.count({ where: { status: 'active' } }),
    db.patternDetection.count({ where: { status: 'confirmed' } }),
    db.entity.count({ where: { lastSeen: { gte: oneDayAgo } } }),
    db.entity.count({ where: { riskLevel: { in: ['high', 'critical'] } } }),
    db.agentState.findMany(),
  ]);

  // Compute alerts by severity
  const alertsBySeverity = {
    CRITICA: alerts.filter(a => a.severity === 'CRÍTICA').length,
    ALTA: alerts.filter(a => a.severity === 'ALTA').length,
    MEDIA: alerts.filter(a => a.severity === 'MEDIA').length,
    BAJA: alerts.filter(a => a.severity === 'BAJA').length,
    INFO: alerts.filter(a => a.severity === 'INFO').length,
  };

  // Compute agent health
  const activeAgents = agentStates.filter(a => a.status === 'active');
  const avgHealth = agentStates.length > 0
    ? Math.round(agentStates.reduce((sum, a) => sum + a.health, 0) / agentStates.length)
    : 0;

  // Compute threat level
  let threatLevel: ThreatLevelResult | null = null;
  try {
    threatLevel = await computeThreatLevel();
  } catch (err) {
    console.error('[DashboardCache] Failed to compute threat level:', err);
  }

  const stats: DashboardStats = {
    totalMessages,
    messagesLast24h,
    alertsBySeverity,
    totalAlerts: alerts.length,
    unacknowledgedAlerts,
    activePatterns,
    confirmedPatterns,
    entityCount,
    highRiskEntities,
    threatLevel,
    agentHealth: {
      active: activeAgents.length,
      total: agentStates.length,
      avgHealth,
    },
    computedAt: now.toISOString(),
    cacheAge: 0,
  };

  // Update cache
  cachedStats = stats;
  cacheTimestamp = Date.now();

  // Record cache refresh event
  await persistEvent('whatomate:intel_events', {
    eventType: 'agent.status_changed',
    aggregateId: `dashboard_cache_refresh_${Date.now()}`,
    aggregateType: 'agent',
    payload: {
      action: 'dashboard_cache_refresh',
      totalMessages,
      messagesLast24h,
      totalAlerts: alerts.length,
      entityCount,
      activePatterns,
      threatLevel: threatLevel?.level ?? 'UNKNOWN',
    },
    metadata: {
      source: 'dashboard-cache',
      cacheStaleMs: CACHE_STALE_MS,
    },
  });

  console.log(
    `[DashboardCache] Refreshed: ${totalMessages} msgs, ${alerts.length} alerts, ${entityCount} entities, threat=${threatLevel?.level ?? 'N/A'}`
  );

  return stats;
}
