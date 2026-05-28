/**
 * Innovation 9: Intelligence Context Builder Enhancement
 *
 * Implements a sliding window context for the intelligence system.
 * Instead of always loading the last 24h of data, this provides
 * configurable time windows for more flexible context building.
 *
 * This enables:
 * - Short windows (1h, 6h) for real-time tactical analysis
 * - Standard window (24h) for daily operational context
 * - Long windows (7d, 30d) for strategic trend analysis
 *
 * RICCO Patterns:
 * - Strategy Pattern: Different window strategies for different contexts
 * - Specification Pattern: Composable time-range specifications
 */

import { db } from '@/lib/db';
import type {
  StrategyContext,
  DecisionStrategy,
  RawMessage,
  Entity,
  PatternDetection,
  ThresholdConfig,
  Alert,
  EntityType,
  RiskLevel,
  PatternType,
  AlertSeverity,
} from './types';

// ===== CONTEXT WINDOW TYPES =====

export type ContextWindowLabel = 'last_1h' | 'last_6h' | 'last_24h' | 'last_7d' | 'last_30d';

export interface ContextWindow {
  start: Date;
  end: Date;
  label: ContextWindowLabel;
}

export interface WindowedContextResult extends StrategyContext {
  window: ContextWindow;
  /** Number of messages within the window */
  messageCount: number;
  /** Number of entities active within the window */
  entityCount: number;
  /** Number of active patterns within the window */
  patternCount: number;
  /** Number of alerts within the window */
  alertCount: number;
  /** Number of threshold configs enabled */
  thresholdCount: number;
}

// ===== PREDEFINED WINDOWS =====

const WINDOW_DURATIONS: Record<ContextWindowLabel, number> = {
  last_1h: 60 * 60 * 1000,
  last_6h: 6 * 60 * 60 * 1000,
  last_24h: 24 * 60 * 60 * 1000,
  last_7d: 7 * 24 * 60 * 60 * 1000,
  last_30d: 30 * 24 * 60 * 60 * 1000,
};

const WINDOW_LABELS: ContextWindowLabel[] = ['last_1h', 'last_6h', 'last_24h', 'last_7d', 'last_30d'];

const WINDOW_DISPLAY_NAMES: Record<ContextWindowLabel, string> = {
  last_1h: 'Last Hour',
  last_6h: 'Last 6 Hours',
  last_24h: 'Last 24 Hours',
  last_7d: 'Last 7 Days',
  last_30d: 'Last 30 Days',
};

/**
 * Returns all predefined context windows relative to now.
 */
export function getContextWindows(): ContextWindow[] {
  const now = new Date();
  return WINDOW_LABELS.map(label => ({
    start: new Date(now.getTime() - WINDOW_DURATIONS[label]),
    end: now,
    label,
  }));
}

/**
 * Get a single context window by label.
 */
export function getContextWindow(label: ContextWindowLabel): ContextWindow {
  const now = new Date();
  return {
    start: new Date(now.getTime() - WINDOW_DURATIONS[label]),
    end: now,
    label,
  };
}

/**
 * Get the display name for a context window label.
 */
export function getWindowDisplayName(label: ContextWindowLabel): string {
  return WINDOW_DISPLAY_NAMES[label];
}

/**
 * Get the duration in milliseconds for a context window label.
 */
export function getWindowDuration(label: ContextWindowLabel): number {
  return WINDOW_DURATIONS[label];
}

// ===== LIMITS PER WINDOW =====

// Different windows have different data limits to balance
// comprehensiveness vs. performance
const WINDOW_LIMITS: Record<ContextWindowLabel, {
  messages: number;
  entities: number;
  patterns: number;
  alerts: number;
}> = {
  last_1h: { messages: 50, entities: 20, patterns: 10, alerts: 10 },
  last_6h: { messages: 100, entities: 30, patterns: 15, alerts: 15 },
  last_24h: { messages: 200, entities: 50, patterns: 20, alerts: 20 },
  last_7d: { messages: 500, entities: 100, patterns: 30, alerts: 50 },
  last_30d: { messages: 1000, entities: 200, patterns: 50, alerts: 100 },
};

// ===== BUILD WINDOWED CONTEXT =====

/**
 * Build a StrategyContext with a custom time window.
 *
 * Like buildStrategyContext() from context-builder.ts, but with
 * configurable time ranges instead of hardcoded 24h.
 *
 * @param window - The time window to query data for
 * @param extraMessages - Optional additional messages to include
 * @returns A WindowedContextResult with context data and window metadata
 */
export async function buildWindowedContext(
  window: ContextWindow,
  extraMessages?: Array<{
    id: string;
    source: string;
    sourceId: string;
    channelName?: string | null;
    channelId?: string | null;
    senderName?: string | null;
    senderId?: string | null;
    content: string;
    contentHash?: string | null;
    timestamp: Date;
    processed: boolean;
    analyzedAt?: Date | null;
    metadata?: string | null;
  }>
): Promise<WindowedContextResult> {
  const limits = WINDOW_LIMITS[window.label];
  const { start, end } = window;

  // --- Fetch messages within window ---
  const dbMessages = await db.rawMessage.findMany({
    where: {
      timestamp: {
        gte: start,
        lte: end,
      },
    },
    take: limits.messages,
    orderBy: { timestamp: 'desc' },
  });

  // Merge with any extra messages, deduplicating by ID
  const allDbMessages = extraMessages
    ? [
        ...extraMessages,
        ...dbMessages.filter(m => !extraMessages.some(e => e.id === m.id)),
      ]
    : dbMessages;

  const messages: RawMessage[] = allDbMessages.map(m => ({
    id: m.id,
    source: m.source as 'whatsapp' | 'telegram' | 'osint',
    sourceId: m.sourceId,
    channelName: m.channelName ?? undefined,
    channelId: m.channelId ?? undefined,
    senderName: m.senderName ?? undefined,
    senderId: m.senderId ?? undefined,
    content: m.content,
    contentHash: m.contentHash ?? undefined,
    timestamp: m.timestamp,
    processed: m.processed,
    analyzedAt: m.analyzedAt ?? undefined,
    metadata: m.metadata ? JSON.parse(m.metadata) : undefined,
  }));

  // --- Fetch entities active within window ---
  const dbEntities = await db.entity.findMany({
    where: {
      lastSeen: {
        gte: start,
        lte: end,
      },
    },
    take: limits.entities,
    orderBy: { lastSeen: 'desc' },
  });

  const entities: Entity[] = dbEntities.map(e => ({
    id: e.id,
    name: e.name,
    type: e.type as EntityType,
    aliases: e.aliases ? JSON.parse(e.aliases) : undefined,
    riskScore: e.riskScore,
    riskLevel: e.riskLevel as RiskLevel,
    platformIds: e.platformIds ? JSON.parse(e.platformIds) : undefined,
    firstSeen: e.firstSeen,
    lastSeen: e.lastSeen,
    mentionCount: e.mentionCount,
    metadata: e.metadata ? JSON.parse(e.metadata) : undefined,
  }));

  // --- Fetch active patterns ---
  // Patterns are not strictly time-windowed by creation, but we
  // include those detected or updated within the window
  const dbPatterns = await db.patternDetection.findMany({
    where: {
      status: { in: ['active', 'confirmed', 'investigating'] },
      lastDetected: {
        gte: start,
        lte: end,
      },
    },
    take: limits.patterns,
    orderBy: { lastDetected: 'desc' },
  });

  const patterns: PatternDetection[] = dbPatterns.map(p => ({
    id: p.id,
    patternType: p.patternType as PatternType,
    severity: p.severity as AlertSeverity,
    confidence: p.confidence,
    description: p.description,
    evidenceIds: p.evidenceIds ? JSON.parse(p.evidenceIds) : undefined,
    entityIds: p.entityIds ? JSON.parse(p.entityIds) : undefined,
    detectionRate: p.detectionRate ?? undefined,
    occurrences: p.occurrences,
    status: p.status as 'active' | 'confirmed' | 'dismissed' | 'investigating',
    firstDetected: p.firstDetected,
    lastDetected: p.lastDetected,
  }));

  // --- Fetch thresholds (always include all enabled, not time-windowed) ---
  const dbThresholds = await db.thresholdConfig.findMany({
    where: { enabled: true },
  });

  const thresholds: ThresholdConfig[] = dbThresholds.map(t => ({
    id: t.id,
    name: t.name,
    description: t.description,
    metric: t.metric,
    condition: t.condition as 'gte' | 'lte' | 'eq' | 'gt' | 'lt',
    value: t.value,
    unit: t.unit,
    alertSeverity: t.alertSeverity as AlertSeverity,
    alertType: t.alertType,
    enabled: t.enabled,
    currentValue: t.currentValue,
    lastTriggered: t.lastTriggered ?? undefined,
  }));

  // --- Fetch alerts within window ---
  const dbAlerts = await db.alert.findMany({
    where: {
      timestamp: {
        gte: start,
        lte: end,
      },
    },
    take: limits.alerts,
    orderBy: { timestamp: 'desc' },
  });

  const alerts: Alert[] = dbAlerts.map(a => ({
    id: a.id,
    source: a.source,
    severity: a.severity as AlertSeverity,
    title: a.title,
    description: a.description,
    actionTaken: a.actionTaken ?? undefined,
    strategy: a.strategy as DecisionStrategy,
    thresholdId: a.thresholdId ?? undefined,
    patternId: a.patternId ?? undefined,
    riskId: a.riskId ?? undefined,
    acknowledged: a.acknowledged,
    acknowledgedBy: a.acknowledgedBy ?? undefined,
    acknowledgedAt: a.acknowledgedAt ?? undefined,
    escalated: a.escalated,
    relatedEvents: a.relatedEvents ? JSON.parse(a.relatedEvents) : undefined,
    timestamp: a.timestamp,
  }));

  return {
    window,
    messages,
    entities,
    patterns,
    thresholds,
    alerts,
    messageCount: messages.length,
    entityCount: entities.length,
    patternCount: patterns.length,
    alertCount: alerts.length,
    thresholdCount: thresholds.length,
  };
}

// ===== COMPARISON ACROSS WINDOWS =====

export interface WindowComparison {
  label: ContextWindowLabel;
  displayName: string;
  durationMs: number;
  messageCount: number;
  entityCount: number;
  patternCount: number;
  alertCount: number;
  highRiskEntityCount: number;
  criticalAlertCount: number;
}

/**
 * Build a comparison summary across all context windows.
 * Useful for dashboards showing activity trends over different time ranges.
 *
 * This is more efficient than building full contexts for each window
 * because it only queries counts, not full data.
 */
export async function compareWindows(): Promise<WindowComparison[]> {
  const now = new Date();
  const results: WindowComparison[] = [];

  for (const label of WINDOW_LABELS) {
    const start = new Date(now.getTime() - WINDOW_DURATIONS[label]);

    const [
      messageCount,
      entityCount,
      patternCount,
      alertCount,
      highRiskEntityCount,
      criticalAlertCount,
    ] = await Promise.all([
      // Message count within window
      db.rawMessage.count({
        where: { timestamp: { gte: start, lte: now } },
      }),

      // Entity count (lastSeen within window)
      db.entity.count({
        where: { lastSeen: { gte: start, lte: now } },
      }),

      // Active pattern count (lastDetected within window)
      db.patternDetection.count({
        where: {
          status: { in: ['active', 'confirmed', 'investigating'] },
          lastDetected: { gte: start, lte: now },
        },
      }),

      // Alert count within window
      db.alert.count({
        where: { timestamp: { gte: start, lte: now } },
      }),

      // High-risk entities (risk >= high) within window
      db.entity.count({
        where: {
          lastSeen: { gte: start, lte: now },
          riskLevel: { in: ['high', 'critical'] },
        },
      }),

      // Critical alerts within window
      db.alert.count({
        where: {
          timestamp: { gte: start, lte: now },
          severity: { in: ['CRÍTICA', 'ALTA'] },
        },
      }),
    ]);

    results.push({
      label,
      displayName: WINDOW_DISPLAY_NAMES[label],
      durationMs: WINDOW_DURATIONS[label],
      messageCount,
      entityCount,
      patternCount,
      alertCount,
      highRiskEntityCount,
      criticalAlertCount,
    });
  }

  return results;
}

/**
 * Convenience: Build a context using the label string.
 */
export async function buildContextByLabel(
  label: ContextWindowLabel,
  extraMessages?: Parameters<typeof buildWindowedContext>[1]
): Promise<WindowedContextResult> {
  const window = getContextWindow(label);
  return buildWindowedContext(window, extraMessages);
}
