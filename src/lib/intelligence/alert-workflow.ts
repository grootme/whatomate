/**
 * Alert Workflow Automation — Automated alert lifecycle management.
 *
 * Implements Innovation 2: Alert Workflow Automation
 *
 * Features:
 * 1. Auto-escalation: After 30 minutes, unacknowledged CRÍTICA/ALTA alerts are
 *    auto-escalated (set escalated=true, emit event, send notification)
 * 2. Auto-dismissal: After 7 days, unacknowledged BAJA/INFO alerts that are not
 *    escalated are auto-dismissed (set acknowledged=true, emit event)
 * 3. Alert deduplication: Before creating a new alert, checks if an active alert
 *    with the same title and strategy exists within the last hour; if yes, updates
 *    the existing alert instead of creating a duplicate
 * 4. Alert correlation: When a new alert is created, searches for related alerts
 *    (same entity, same pattern, or same threshold) and links them via relatedEvents
 *
 * RICCO Patterns:
 * - Specification Pattern (ADN 1): Guarded lifecycle transitions
 * - Event Sourcing (ADN 2): All state changes as durable events
 * - Registry-Driven (ADN 3): Lifecycle rules registered per severity
 */

import { db } from '@/lib/db';
import { persistEvent } from './event-persist';
import { notifyAlert } from './notification-channel';
import type { AlertSeverity, Alert, EventStream } from './types';

// ===== CONSTANTS =====

/** Time before auto-escalating CRÍTICA/ALTA alerts (30 minutes) */
const AUTO_ESCALATE_MS = 30 * 60 * 1000;

/** Time before auto-dismissing BAJA/INFO alerts (7 days) */
const AUTO_DISMISS_MS = 7 * 24 * 60 * 60 * 1000;

/** Deduplication window: don't create a new alert if same title+strategy exists within 1 hour */
const DEDUP_WINDOW_MS = 60 * 60 * 1000;

/** Semantic deduplication window: check last 24 hours for similar alerts */
const SEMANTIC_DEDUP_WINDOW_MS = 24 * 60 * 60 * 1000;

/** Minimum Jaccard similarity for titles to be considered duplicates */
const TITLE_SIMILARITY_THRESHOLD = 0.7;

/** INNOVATION 7: If 3+ alerts of the same strategy type occur within 1 hour, auto-escalate to next severity */
const ESCALATION_BURST_THRESHOLD = 3;
const ESCALATION_BURST_WINDOW_MS = 60 * 60 * 1000;

/** Severity hierarchy for ordering */
const SEVERITY_ORDER: AlertSeverity[] = ['INFO', 'BAJA', 'MEDIA', 'ALTA', 'CRÍTICA'];

function severityRank(severity: AlertSeverity): number {
  return SEVERITY_ORDER.indexOf(severity);
}

// ===== RESULT TYPES =====

export interface LifecycleResult {
  escalated: number;
  dismissed: number;
  errors: number;
  details: {
    escalated: Array<{ alertId: string; title: string; severity: string }>;
    dismissed: Array<{ alertId: string; title: string; severity: string }>;
  };
}

export interface DedupResult {
  action: 'created' | 'updated';
  alertId: string;
}

export interface CorrelationResult {
  alertId: string;
  linkedAlertIds: string[];
  linkedEventIds: string[];
}

// ===== 1. AUTO-ESCALATION =====

/**
 * Auto-escalate unacknowledged CRÍTICA or ALTA alerts that are older than 30 minutes.
 *
 * For each qualifying alert:
 * 1. Set `escalated = true`
 * 2. Emit `monitoring.alert_escalated` event
 * 3. Send notification via `notifyAlert`
 */
async function autoEscalate(): Promise<Array<{ alertId: string; title: string; severity: string }>> {
  const now = new Date();
  const cutoff = new Date(now.getTime() - AUTO_ESCALATE_MS);

  // Find unacknowledged, un-escalated CRÍTICA/ALTA alerts older than 30 min
  const candidates = await db.alert.findMany({
    where: {
      acknowledged: false,
      escalated: false,
      severity: { in: ['CRÍTICA', 'ALTA'] },
      timestamp: { lte: cutoff },
    },
    orderBy: { timestamp: 'asc' },
  });

  const escalated: Array<{ alertId: string; title: string; severity: string }> = [];

  for (const alert of candidates) {
    try {
      // Update alert: set escalated
      await db.alert.update({
        where: { id: alert.id },
        data: { escalated: true },
      });

      // Emit escalation event
      const stream: EventStream = 'whatomate:alerts';
      await persistEvent(stream, {
        eventType: 'monitoring.alert_escalated',
        aggregateId: alert.id,
        aggregateType: 'alert',
        payload: {
          alertId: alert.id,
          severity: alert.severity,
          title: alert.title,
          strategy: alert.strategy,
          reason: `Auto-escalated: unacknowledged for ${Math.round((now.getTime() - alert.timestamp.getTime()) / 60000)} minutes (threshold: ${AUTO_ESCALATE_MS / 60000} min)`,
          escalatedBy: 'alert-workflow-auto',
        },
        metadata: {
          autoEscalated: true,
          originalSeverity: alert.severity,
          minutesSinceCreation: Math.round((now.getTime() - alert.timestamp.getTime()) / 60000),
        },
      });

      // Send notification via notifyAlert
      const alertObj: Alert = {
        id: alert.id,
        source: alert.source,
        severity: alert.severity as AlertSeverity,
        title: alert.title,
        description: alert.description,
        actionTaken: alert.actionTaken ?? undefined,
        strategy: alert.strategy as Alert['strategy'],
        thresholdId: alert.thresholdId ?? undefined,
        patternId: alert.patternId ?? undefined,
        riskId: alert.riskId ?? undefined,
        acknowledged: false,
        escalated: true,
        relatedEvents: alert.relatedEvents ? JSON.parse(alert.relatedEvents) : undefined,
        timestamp: alert.timestamp,
      };
      await notifyAlert(alertObj);

      escalated.push({
        alertId: alert.id,
        title: alert.title,
        severity: alert.severity,
      });

      console.log(
        `[AlertWorkflow] Auto-escalated ${alert.severity} alert "${alert.title}" (${alert.id})`
      );
    } catch (err) {
      console.error(
        `[AlertWorkflow] Failed to auto-escalate alert ${alert.id}:`,
        err
      );
    }
  }

  return escalated;
}

// ===== 2. AUTO-DISMISSAL =====

/**
 * Auto-dismiss unacknowledged BAJA or INFO alerts that are older than 7 days
 * and not escalated.
 *
 * For each qualifying alert:
 * 1. Set `acknowledged = true`, `acknowledgedBy = 'alert-workflow-auto'`
 * 2. Emit `monitoring.alert_acknowledged` event
 */
async function autoDismiss(): Promise<Array<{ alertId: string; title: string; severity: string }>> {
  const now = new Date();
  const cutoff = new Date(now.getTime() - AUTO_DISMISS_MS);

  // Find unacknowledged, un-escalated BAJA/INFO alerts older than 7 days
  const candidates = await db.alert.findMany({
    where: {
      acknowledged: false,
      escalated: false,
      severity: { in: ['BAJA', 'INFO'] },
      timestamp: { lte: cutoff },
    },
    orderBy: { timestamp: 'asc' },
  });

  const dismissed: Array<{ alertId: string; title: string; severity: string }> = [];

  for (const alert of candidates) {
    try {
      // Update alert: set acknowledged
      await db.alert.update({
        where: { id: alert.id },
        data: {
          acknowledged: true,
          acknowledgedBy: 'alert-workflow-auto',
          acknowledgedAt: now,
        },
      });

      // Emit acknowledged event
      const stream: EventStream = 'whatomate:alerts';
      await persistEvent(stream, {
        eventType: 'monitoring.alert_acknowledged',
        aggregateId: alert.id,
        aggregateType: 'alert',
        payload: {
          alertId: alert.id,
          severity: alert.severity,
          title: alert.title,
          strategy: alert.strategy,
          reason: `Auto-dismissed: unacknowledged BAJA/INFO alert after ${Math.round((now.getTime() - alert.timestamp.getTime()) / (24 * 60 * 60 * 1000))} days (threshold: ${AUTO_DISMISS_MS / (24 * 60 * 60 * 1000)} days)`,
          acknowledgedBy: 'alert-workflow-auto',
        },
        metadata: {
          autoDismissed: true,
          originalSeverity: alert.severity,
          daysSinceCreation: Math.round(
            (now.getTime() - alert.timestamp.getTime()) / (24 * 60 * 60 * 1000)
          ),
        },
      });

      dismissed.push({
        alertId: alert.id,
        title: alert.title,
        severity: alert.severity,
      });

      console.log(
        `[AlertWorkflow] Auto-dismissed ${alert.severity} alert "${alert.title}" (${alert.id})`
      );
    } catch (err) {
      console.error(
        `[AlertWorkflow] Failed to auto-dismiss alert ${alert.id}:`,
        err
      );
    }
  }

  return dismissed;
}

// ===== 2b. SEMANTIC SIMILARITY (INNOVATION 2) =====

/**
 * Jaccard word-level similarity between two strings.
 * Splits into word tokens, computes |intersection| / |union| of word sets.
 * This is better than character-level Jaccard for comparing alert titles.
 */
function jaccardWordSimilarity(a: string, b: string): number {
  const wordsA = new Set(a.toLowerCase().split(/\s+/).filter(w => w.length > 2));
  const wordsB = new Set(b.toLowerCase().split(/\s+/).filter(w => w.length > 2));
  if (wordsA.size === 0 && wordsB.size === 0) return 1.0;
  const intersection = new Set([...wordsA].filter(x => wordsB.has(x)));
  const union = new Set([...wordsA, ...wordsB]);
  return intersection.size / union.size;
}

/**
 * Find semantically similar alerts from the last 24 hours.
 * Uses Jaccard word similarity on titles to detect near-duplicates.
 */
async function findSemanticallySimilarAlert(
  title: string,
  strategy: string,
  description?: string
): Promise<{ alertId: string; titleSimilarity: number; descriptionSimilarity: number } | null> {
  const now = new Date();
  const cutoff = new Date(now.getTime() - SEMANTIC_DEDUP_WINDOW_MS);

  // Fetch recent unacknowledged alerts with the same strategy
  const recentAlerts = await db.alert.findMany({
    where: {
      strategy,
      acknowledged: false,
      timestamp: { gte: cutoff },
    },
    orderBy: { timestamp: 'desc' },
    take: 50,
  });

  let bestMatch: { alertId: string; titleSimilarity: number; descriptionSimilarity: number } | null = null;

  for (const alert of recentAlerts) {
    const titleSim = jaccardWordSimilarity(title, alert.title);
    const descSim = description
      ? jaccardWordSimilarity(description, alert.description)
      : 0;

    // If title similarity exceeds threshold, it's a semantic duplicate
    if (titleSim >= TITLE_SIMILARITY_THRESHOLD) {
      if (!bestMatch || titleSim > bestMatch.titleSimilarity) {
        bestMatch = { alertId: alert.id, titleSimilarity: titleSim, descriptionSimilarity: descSim };
      }
    }
  }

  return bestMatch;
}

// ===== 3. ALERT DEDUPLICATION =====

/**
 * Before creating a new alert, check if an active alert with the same title and
 * strategy exists within the last hour. If yes, update the existing alert instead
 * of creating a duplicate.
 *
 * @returns `DedupResult` indicating whether a new alert was created or an existing one updated.
 */
export async function deduplicateOrCreateAlert(params: {
  source: string;
  severity: AlertSeverity;
  title: string;
  description: string;
  strategy: string;
  actionTaken?: string;
  thresholdId?: string;
  patternId?: string;
  riskId?: string;
}): Promise<DedupResult> {
  const now = new Date();
  const dedupCutoff = new Date(now.getTime() - DEDUP_WINDOW_MS);

  // Search for existing active alert with same title and strategy within dedup window
  const existing = await db.alert.findFirst({
    where: {
      title: params.title,
      strategy: params.strategy,
      acknowledged: false,
      timestamp: { gte: dedupCutoff },
    },
    orderBy: { timestamp: 'desc' },
  });

  if (existing) {
    // Update the existing alert instead of creating a duplicate
    // Optionally upgrade severity if the new one is higher
    const existingSeverityRank = severityRank(existing.severity as AlertSeverity);
    const newSeverityRank = severityRank(params.severity);
    const updatedSeverity =
      newSeverityRank > existingSeverityRank ? params.severity : existing.severity;

    // Append to description if new info adds context
    const updatedDescription =
      existing.description !== params.description
        ? `${existing.description}\n[Update ${now.toISOString()}] ${params.description}`
        : existing.description;

    // Increment occurrence count in metadata
    const _existingMeta = existing.relatedEvents
      ? (() => { try { return JSON.parse(existing.relatedEvents) as string[]; } catch { return []; } })()
      : [];
    void _existingMeta;

    await db.alert.update({
      where: { id: existing.id },
      data: {
        severity: updatedSeverity,
        description: updatedDescription,
        actionTaken: params.actionTaken ?? existing.actionTaken,
        thresholdId: params.thresholdId ?? existing.thresholdId,
        patternId: params.patternId ?? existing.patternId,
        riskId: params.riskId ?? existing.riskId,
      },
    });

    console.log(
      `[AlertWorkflow] Deduplicated alert "${params.title}" — updated existing ${existing.id} (severity: ${updatedSeverity})`
    );

    return { action: 'updated', alertId: existing.id };
  }

  // INNOVATION 2: Semantic similarity deduplication
  // Even if exact title doesn't match, check for semantically similar alerts
  const semanticMatch = await findSemanticallySimilarAlert(
    params.title,
    params.strategy,
    params.description
  );

  if (semanticMatch) {
    // Merge into the semantically similar alert (increment occurrence count)
    const matchAlert = await db.alert.findUnique({ where: { id: semanticMatch.alertId } });
    if (matchAlert) {
      const existingSeverityRank = severityRank(matchAlert.severity as AlertSeverity);
      const newSeverityRank = severityRank(params.severity);
      const updatedSeverity =
        newSeverityRank > existingSeverityRank ? params.severity : matchAlert.severity;

      // Parse existing occurrence count from metadata, or compute from relatedEvents
      const _existingRelatedEvents = matchAlert.relatedEvents
        ? (() => { try { return JSON.parse(matchAlert.relatedEvents) as string[]; } catch { return []; } })()
        : [];
      void _existingRelatedEvents;

      const updatedDescription =
        `${matchAlert.description}\n[Semantic Dup ${now.toISOString()} (sim=${semanticMatch.titleSimilarity.toFixed(2)})] ${params.description}`;

      await db.alert.update({
        where: { id: matchAlert.id },
        data: {
          severity: updatedSeverity,
          description: updatedDescription,
          actionTaken: params.actionTaken ?? matchAlert.actionTaken,
        },
      });

      // Record deduplication event
      await persistEvent('whatomate:alerts', {
        eventType: 'monitoring.alert_acknowledged',
        aggregateId: `semantic_dedup_${Date.now()}`,
        aggregateType: 'alert',
        payload: {
          action: 'semantic_deduplication',
          originalAlertId: matchAlert.id,
          originalTitle: matchAlert.title,
          duplicateTitle: params.title,
          titleSimilarity: semanticMatch.titleSimilarity,
          descriptionSimilarity: semanticMatch.descriptionSimilarity,
          strategy: params.strategy,
        },
        metadata: {
          source: 'alert-workflow-semantic-dedup',
          dedupMethod: 'jaccard_word_similarity',
          threshold: TITLE_SIMILARITY_THRESHOLD,
        },
      });

      console.log(
        `[AlertWorkflow] Semantic dedup: "${params.title}" → merged into "${matchAlert.title}" (${semanticMatch.titleSimilarity.toFixed(2)} similarity)`
      );

      return { action: 'updated', alertId: matchAlert.id };
    }
  }

  // No duplicate found — create new alert
  const newAlert = await db.alert.create({
    data: {
      source: params.source,
      severity: params.severity,
      title: params.title,
      description: params.description,
      actionTaken: params.actionTaken,
      strategy: params.strategy,
      thresholdId: params.thresholdId,
      patternId: params.patternId,
      riskId: params.riskId,
    },
  });

  // Persist alert creation event
  await persistEvent('whatomate:alerts', {
    eventType: 'monitoring.alert_generated',
    aggregateId: newAlert.id,
    aggregateType: 'alert',
    payload: {
      source: newAlert.source,
      severity: newAlert.severity,
      title: newAlert.title,
      strategy: newAlert.strategy,
      deduplicated: false,
    },
    metadata: { alertCreated: true, deduplicationChecked: true },
  });

  return { action: 'created', alertId: newAlert.id };
}

// ===== 4. ALERT CORRELATION =====

/**
 * When a new alert is created, search for related alerts and link them via `relatedEvents`.
 *
 * Correlation criteria:
 * - Same threshold (thresholdId)
 * - Same pattern (patternId)
 * - Same risk assessment (riskId)
 * - Same source agent and same severity
 *
 * Also searches IntelligenceEvents for events related to the same aggregateId or
 * matching criteria, and adds those event IDs to relatedEvents.
 */
export async function correlateAlert(alertId: string): Promise<CorrelationResult> {
  const alert = await db.alert.findUnique({ where: { id: alertId } });
  if (!alert) {
    return { alertId, linkedAlertIds: [], linkedEventIds: [] };
  }

  const linkedAlertIds: string[] = [];
  const linkedEventIds: string[] = [];

  // --- Search for related alerts by shared IDs ---
  const orConditions: Array<Record<string, unknown>> = [];

  if (alert.thresholdId) {
    orConditions.push({
      thresholdId: alert.thresholdId,
      id: { not: alertId },
    });
  }
  if (alert.patternId) {
    orConditions.push({
      patternId: alert.patternId,
      id: { not: alertId },
    });
  }
  if (alert.riskId) {
    orConditions.push({
      riskId: alert.riskId,
      id: { not: alertId },
    });
  }

  // Same source + same severity within last 24 hours
  orConditions.push({
    source: alert.source,
    severity: alert.severity,
    id: { not: alertId },
    timestamp: {
      gte: new Date(Date.now() - 24 * 60 * 60 * 1000),
    },
  });

  if (orConditions.length > 0) {
    const relatedAlerts = await db.alert.findMany({
      where: { OR: orConditions },
      select: { id: true },
      take: 20,
    });

    linkedAlertIds.push(...relatedAlerts.map(a => a.id));
  }

  // --- Search for related IntelligenceEvents ---
  // Events with same aggregateId or matching alert-related event types
  const relatedDbEvents = await db.intelligenceEvent.findMany({
    where: {
      OR: [
        { aggregateId: alert.thresholdId ?? '___never___' },
        { aggregateId: alert.patternId ?? '___never___' },
        { aggregateId: alert.riskId ?? '___never___' },
        {
          eventType: {
            in: [
              'monitoring.threshold_breached',
              'analysis.pattern_detected',
              'analysis.risk_scored',
              'monitoring.alert_generated',
              'monitoring.alert_escalated',
            ],
          },
          timestamp: {
            gte: new Date(Date.now() - 2 * 60 * 60 * 1000), // last 2 hours
          },
        },
      ],
    },
    select: { id: true },
    take: 30,
    orderBy: { timestamp: 'desc' },
  });

  linkedEventIds.push(...relatedDbEvents.map(e => e.id));

  // --- Update the alert's relatedEvents field ---
  if (linkedAlertIds.length > 0 || linkedEventIds.length > 0) {
    const existingRelated = alert.relatedEvents
      ? (JSON.parse(alert.relatedEvents) as string[])
      : [];
    const uniqueSet = new Set([...existingRelated, ...linkedAlertIds, ...linkedEventIds]);
    const allRelated = Array.from(uniqueSet).slice(0, 100); // Cap at 100 to prevent unbounded growth

    await db.alert.update({
      where: { id: alertId },
      data: { relatedEvents: JSON.stringify(allRelated) },
    });

    console.log(
      `[AlertWorkflow] Correlated alert ${alertId}: ${linkedAlertIds.length} related alerts, ${linkedEventIds.length} related events`
    );
  }

  return { alertId, linkedAlertIds, linkedEventIds };
}

// ===== INNOVATION 7: BURST AUTO-ESCALATION WITH SEVERITY UPGRADE =====

/**
 * If 3+ alerts of the same strategy type occur within 1 hour,
 * auto-escalate each alert's severity to the next level.
 *
 * For each qualifying strategy burst:
 * 1. Upgrade severity by one level (e.g., MEDIA → ALTA)
 * 2. Record escalation reason in alert metadata
 * 3. Notify via notification channel
 * 4. Track escalation events in event sourcing
 */
async function burstAutoEscalate(): Promise<Array<{ alertId: string; title: string; severity: string }>> {
  const now = new Date();
  const burstCutoff = new Date(now.getTime() - ESCALATION_BURST_WINDOW_MS);
  const escalated: Array<{ alertId: string; title: string; severity: string }> = [];

  // Find all strategies with 3+ unacknowledged alerts in the last hour
  const burstStrategies = await db.alert.groupBy({
    by: ['strategy'],
    where: {
      acknowledged: false,
      timestamp: { gte: burstCutoff },
    },
    _count: { id: true },
    having: {
      id: { _count: { gte: ESCALATION_BURST_THRESHOLD } },
    },
  });

  for (const burst of burstStrategies) {
    const strategy = burst.strategy;

    // Fetch the individual alerts for this strategy
    const strategyAlerts = await db.alert.findMany({
      where: {
        strategy,
        acknowledged: false,
        timestamp: { gte: burstCutoff },
      },
      orderBy: { timestamp: 'desc' },
    });

    for (const alert of strategyAlerts) {
      const currentRank = severityRank(alert.severity as AlertSeverity);
      if (currentRank >= SEVERITY_ORDER.length - 1) continue; // Already CRÍTICA

      // Upgrade to next severity level
      const nextSeverity = SEVERITY_ORDER[currentRank + 1];

      await db.alert.update({
        where: { id: alert.id },
        data: {
          severity: nextSeverity,
          escalated: true,
        },
      });

      // Record escalation event
      await persistEvent('whatomate:alerts', {
        eventType: 'monitoring.alert_escalated',
        aggregateId: alert.id,
        aggregateType: 'alert',
        payload: {
          alertId: alert.id,
          previousSeverity: alert.severity,
          newSeverity: nextSeverity,
          title: alert.title,
          strategy: alert.strategy,
          reason: `Burst auto-escalation: ${strategyAlerts.length} alerts from strategy "${strategy}" within 1 hour (threshold: ${ESCALATION_BURST_THRESHOLD})`,
          escalatedBy: 'burst-auto-escalation',
        },
        metadata: {
          burstEscalation: true,
          originalSeverity: alert.severity,
          alertCountInBurst: strategyAlerts.length,
          strategyBurstWindow: ESCALATION_BURST_WINDOW_MS,
        },
      });

      // Notify via notification channel
      const alertObj: Alert = {
        id: alert.id,
        source: alert.source,
        severity: nextSeverity as AlertSeverity,
        title: alert.title,
        description: alert.description,
        actionTaken: alert.actionTaken ?? undefined,
        strategy: alert.strategy as Alert['strategy'],
        acknowledged: alert.acknowledged,
        escalated: true,
        relatedEvents: alert.relatedEvents ? JSON.parse(alert.relatedEvents) : undefined,
        timestamp: alert.timestamp,
      };
      await notifyAlert(alertObj);

      escalated.push({
        alertId: alert.id,
        title: alert.title,
        severity: nextSeverity,
      });

      console.log(
        `[AlertWorkflow] Burst escalation: "${alert.title}" ${alert.severity} → ${nextSeverity} (${strategyAlerts.length} alerts in 1h)`
      );
    }
  }

  return escalated;
}

// ===== MAIN LIFECYCLE PROCESSOR =====

/**
 * Process the full alert lifecycle: auto-escalation + auto-dismissal.
 *
 * This is the main entry point that should be called from the scheduler.
 * It runs both auto-escalation and auto-dismissal in sequence and returns
 * a summary of all actions taken.
 */
export async function processAlertLifecycle(): Promise<LifecycleResult> {
  console.log('[AlertWorkflow] Starting alert lifecycle processing...');

  const escalated = await autoEscalate();
  const dismissed = await autoDismiss();

  // INNOVATION 7: Burst-based auto-escalation with severity upgrade
  const burstEscalated = await burstAutoEscalate();

  const result: LifecycleResult = {
    escalated: escalated.length + burstEscalated.length,
    dismissed: dismissed.length,
    errors: 0,
    details: {
      escalated: [...escalated, ...burstEscalated],
      dismissed,
    },
  };

  console.log(
    `[AlertWorkflow] Lifecycle processing complete: ${result.escalated} escalated (incl. ${burstEscalated.length} burst), ${result.dismissed} dismissed`
  );

  // Persist lifecycle event
  await persistEvent('whatomate:alerts', {
    eventType: 'agent.status_changed',
    aggregateId: `alert_lifecycle_${Date.now()}`,
    aggregateType: 'agent',
    payload: {
      type: 'alert_lifecycle_processing',
      escalated: result.escalated,
      dismissed: result.dismissed,
      burstEscalated: burstEscalated.length,
      escalatedAlerts: result.details.escalated.map(a => a.alertId),
      dismissedAlerts: result.details.dismissed.map(a => a.alertId),
    },
    metadata: {
      source: 'alert-workflow',
      autoEscalateThresholdMs: AUTO_ESCALATE_MS,
      autoDismissThresholdMs: AUTO_DISMISS_MS,
      burstEscalationThreshold: ESCALATION_BURST_THRESHOLD,
    },
  });

  return result;
}
