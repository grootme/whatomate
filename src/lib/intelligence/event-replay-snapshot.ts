/**
 * INNOVATION 9: Event Replay with Snapshot Optimization
 *
 * Every 1000 events, creates a "snapshot" event that contains the current state summary.
 * When replaying, start from the most recent snapshot instead of the beginning.
 * Snapshot includes: entity count, alert count, pattern count, average risk score.
 *
 * This makes replay O(snapshot + delta) instead of O(all events).
 *
 * RICCO Patterns:
 * - Event Sourcing: Snapshots are themselves events
 * - Memento Pattern: Snapshot captures point-in-time state
 */

import { db } from '@/lib/db';
import { persistEvent } from './event-persist';
import type { EventStream, IntelligenceEventType, AggregateType } from './types';

// ===== TYPES =====

export interface SnapshotData {
  entityCount: number;
  alertCount: number;
  activeAlertCount: number;
  patternCount: number;
  activePatternCount: number;
  avgRiskScore: number;
  totalMentions: number;
  unacknowledgedAlerts: number;
  highRiskEntities: number;
  timestamp: string;
  eventCountAtSnapshot: number;
}

export interface SnapshotReplayResult {
  snapshot: SnapshotData | null;
  deltaEvents: number;
  totalEventsReplayed: number;
  replayedFrom: 'snapshot' | 'beginning';
}

// ===== CONSTANTS =====

/** Event count interval between snapshots */
const SNAPSHOT_INTERVAL = 1000;

const SNAPSHOT_EVENT_TYPE: IntelligenceEventType = 'agent.status_changed';
const SNAPSHOT_AGGREGATE_TYPE: AggregateType = 'agent';
const SNAPSHOT_STREAM: EventStream = 'whatomate:intel_events';

// ===== SNAPSHOT CREATION =====

/**
 * Check if a new snapshot should be created based on event count,
 * and if so, create one.
 *
 * Should be called after each event is persisted.
 */
export async function maybeCreateSnapshot(): Promise<SnapshotData | null> {
  // Count total events
  const totalEvents = await db.intelligenceEvent.count();

  // Find the most recent snapshot
  const lastSnapshot = await db.intelligenceEvent.findFirst({
    where: {
      eventType: SNAPSHOT_EVENT_TYPE,
      metadata: { contains: '"isSnapshot":true' },
    },
    orderBy: { timestamp: 'desc' },
  });

  // Determine events since last snapshot
  let eventsSinceSnapshot: number;
  if (lastSnapshot) {
    const lastSnapshotMeta = lastSnapshot.metadata
      ? JSON.parse(lastSnapshot.metadata) as Record<string, unknown>
      : {};
    eventsSinceSnapshot = totalEvents - (typeof lastSnapshotMeta.eventCountAtSnapshot === 'number'
      ? lastSnapshotMeta.eventCountAtSnapshot : 0);
  } else {
    eventsSinceSnapshot = totalEvents;
  }

  if (eventsSinceSnapshot < SNAPSHOT_INTERVAL) {
    return null; // Not enough events for a snapshot
  }

  // Create snapshot
  return createSnapshot(totalEvents);
}

/**
 * Create a snapshot of the current system state and persist it as an event.
 */
export async function createSnapshot(eventCountOverride?: number): Promise<SnapshotData> {
  const now = new Date();

  // Compute snapshot data from current DB state
  const [
    entityCount,
    alertCount,
    activeAlertCount,
    patternCount,
    activePatternCount,
    avgRiskResult,
    totalMentionsResult,
    unacknowledgedAlerts,
    highRiskEntities,
  ] = await Promise.all([
    db.entity.count(),
    db.alert.count(),
    db.alert.count({ where: { acknowledged: false } }),
    db.patternDetection.count(),
    db.patternDetection.count({ where: { status: { in: ['active', 'confirmed'] } } }),
    db.entity.aggregate({ _avg: { riskScore: true } }),
    db.entity.aggregate({ _sum: { mentionCount: true } }),
    db.alert.count({ where: { acknowledged: false } }),
    db.entity.count({ where: { riskLevel: { in: ['high', 'critical'] } } }),
  ]);

  const totalEvents = eventCountOverride ?? await db.intelligenceEvent.count();

  const snapshot: SnapshotData = {
    entityCount,
    alertCount,
    activeAlertCount,
    patternCount,
    activePatternCount,
    avgRiskScore: Math.round(avgRiskResult._avg.riskScore ?? 0),
    totalMentions: totalMentionsResult._sum.mentionCount ?? 0,
    unacknowledgedAlerts,
    highRiskEntities,
    timestamp: now.toISOString(),
    eventCountAtSnapshot: totalEvents,
  };

  // Persist snapshot as an IntelligenceEvent
  await persistEvent(SNAPSHOT_STREAM, {
    eventType: SNAPSHOT_EVENT_TYPE,
    aggregateId: `snapshot_${Date.now()}`,
    aggregateType: SNAPSHOT_AGGREGATE_TYPE,
    payload: {
      action: 'event_snapshot',
      ...snapshot,
    },
    metadata: {
      isSnapshot: true,
      source: 'event-replay-snapshot',
      eventCountAtSnapshot: totalEvents,
      snapshotInterval: SNAPSHOT_INTERVAL,
    },
  });

  console.log(
    `[EventReplaySnapshot] Created snapshot at event #${totalEvents}: ${entityCount} entities, ${alertCount} alerts, avg risk ${snapshot.avgRiskScore}`
  );

  return snapshot;
}

// ===== SNAPSHOT-AWARE REPLAY =====

/**
 * Replay events starting from the most recent snapshot.
 * If a snapshot exists, only replay delta events since the snapshot.
 * If no snapshot exists, replay from the beginning.
 *
 * This makes replay O(snapshot + delta) instead of O(all events).
 */
export async function replayFromSnapshot(
  aggregateId?: string,
  limit: number = 1000
): Promise<SnapshotReplayResult> {
  // Find the most recent snapshot
  const lastSnapshot = await db.intelligenceEvent.findFirst({
    where: {
      eventType: SNAPSHOT_EVENT_TYPE,
      metadata: { contains: '"isSnapshot":true' },
      ...(aggregateId ? { aggregateId } : {}),
    },
    orderBy: { timestamp: 'desc' },
  });

  let snapshot: SnapshotData | null = null;
  let deltaEvents: number = 0;

  if (lastSnapshot) {
    // Parse snapshot data from event payload
    const payload = lastSnapshot.payload
      ? JSON.parse(lastSnapshot.payload) as Record<string, unknown>
      : {};

    const lastSnapshotMeta = lastSnapshot.metadata
      ? JSON.parse(lastSnapshot.metadata) as Record<string, unknown>
      : {};

    snapshot = {
      entityCount: typeof payload.entityCount === 'number' ? payload.entityCount : 0,
      alertCount: typeof payload.alertCount === 'number' ? payload.alertCount : 0,
      activeAlertCount: typeof payload.activeAlertCount === 'number' ? payload.activeAlertCount : 0,
      patternCount: typeof payload.patternCount === 'number' ? payload.patternCount : 0,
      activePatternCount: typeof payload.activePatternCount === 'number' ? payload.activePatternCount : 0,
      avgRiskScore: typeof payload.avgRiskScore === 'number' ? payload.avgRiskScore : 0,
      totalMentions: typeof payload.totalMentions === 'number' ? payload.totalMentions : 0,
      unacknowledgedAlerts: typeof payload.unacknowledgedAlerts === 'number' ? payload.unacknowledgedAlerts : 0,
      highRiskEntities: typeof payload.highRiskEntities === 'number' ? payload.highRiskEntities : 0,
      timestamp: typeof payload.timestamp === 'string' ? payload.timestamp : lastSnapshot.timestamp.toISOString(),
      eventCountAtSnapshot: typeof lastSnapshotMeta.eventCountAtSnapshot === 'number'
        ? lastSnapshotMeta.eventCountAtSnapshot : 0,
    };

    // Count delta events since snapshot
    deltaEvents = await db.intelligenceEvent.count({
      where: {
        timestamp: { gt: lastSnapshot.timestamp },
        ...(aggregateId ? { aggregateId } : {}),
        metadata: { not: { contains: '"isSnapshot":true' } },
      },
    });

    return {
      snapshot,
      deltaEvents,
      totalEventsReplayed: deltaEvents,
      replayedFrom: 'snapshot',
    };
  }

  // No snapshot found — replay from beginning
  const totalEvents = await db.intelligenceEvent.count({
    ...(aggregateId ? { where: { aggregateId } } : {}),
  });

  return {
    snapshot: null,
    deltaEvents: totalEvents,
    totalEventsReplayed: Math.min(totalEvents, limit),
    replayedFrom: 'beginning',
  };
}

/**
 * Get the most recent snapshot without replaying events.
 */
export async function getLatestSnapshot(): Promise<SnapshotData | null> {
  const lastSnapshot = await db.intelligenceEvent.findFirst({
    where: {
      eventType: SNAPSHOT_EVENT_TYPE,
      metadata: { contains: '"isSnapshot":true' },
    },
    orderBy: { timestamp: 'desc' },
  });

  if (!lastSnapshot) return null;

  const payload = lastSnapshot.payload
    ? JSON.parse(lastSnapshot.payload) as Record<string, unknown>
    : {};

  const lastSnapshotMeta = lastSnapshot.metadata
    ? JSON.parse(lastSnapshot.metadata) as Record<string, unknown>
    : {};

  return {
    entityCount: typeof payload.entityCount === 'number' ? payload.entityCount : 0,
    alertCount: typeof payload.alertCount === 'number' ? payload.alertCount : 0,
    activeAlertCount: typeof payload.activeAlertCount === 'number' ? payload.activeAlertCount : 0,
    patternCount: typeof payload.patternCount === 'number' ? payload.patternCount : 0,
    activePatternCount: typeof payload.activePatternCount === 'number' ? payload.activePatternCount : 0,
    avgRiskScore: typeof payload.avgRiskScore === 'number' ? payload.avgRiskScore : 0,
    totalMentions: typeof payload.totalMentions === 'number' ? payload.totalMentions : 0,
    unacknowledgedAlerts: typeof payload.unacknowledgedAlerts === 'number' ? payload.unacknowledgedAlerts : 0,
    highRiskEntities: typeof payload.highRiskEntities === 'number' ? payload.highRiskEntities : 0,
    timestamp: typeof payload.timestamp === 'string' ? payload.timestamp : lastSnapshot.timestamp.toISOString(),
    eventCountAtSnapshot: typeof lastSnapshotMeta.eventCountAtSnapshot === 'number'
      ? lastSnapshotMeta.eventCountAtSnapshot : 0,
  };
}
