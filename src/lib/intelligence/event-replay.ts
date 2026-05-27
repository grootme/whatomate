/**
 * Event Replay Engine — reconstructs aggregate state from event history.
 * RICCO Pattern: Event-Driven Consistency ADN
 *
 * Enables:
 * - State reconstruction from events (no data loss)
 * - Audit trail for any entity
 * - Debugging by replaying specific time ranges
 * - Point-in-time state queries
 */

import { db } from '@/lib/db';
import type {
  IntelligenceEvent,
  IntelligenceEventType,
  Entity,
  Alert,
  AlertSeverity,
  RiskLevel,
  PatternDetection,
  AggregateType,
} from './types';

// ===== RECONSTRUCTED STATE TYPES =====

export interface ReplayedEntityState {
  id: string;
  name: string;
  type: string;
  aliases: string[];
  riskScore: number;
  riskLevel: RiskLevel;
  sentiment: number;
  mentionCount: number;
  lastSeen: Date | null;
  firstSeen: Date | null;
  patternAssociations: string[];
  alertAssociations: string[];
  acknowledgedAlerts: string[];
  metadata: Record<string, unknown>;
}

export interface ReplayedAlertState {
  id: string;
  source: string;
  severity: AlertSeverity;
  title: string;
  description: string;
  actionTaken: string | null;
  strategy: string;
  acknowledged: boolean;
  acknowledgedBy: string | null;
  acknowledgedAt: Date | null;
  escalated: boolean;
  lifecycle: Array<{ timestamp: Date; event: string; detail: string }>;
  relatedEvents: string[];
}

export interface TimelineEntry {
  timestamp: Date;
  eventType: IntelligenceEventType;
  summary: string;
  payload: Record<string, unknown>;
}

export interface ReplayResult<T> {
  state: T;
  events: IntelligenceEvent[];
  replayedAt: Date;
  eventCount: number;
}

// ===== INTERNAL: LOAD & PARSE EVENTS FROM DB =====

async function loadEventsForAggregate(aggregateId: string, asOf?: Date): Promise<IntelligenceEvent[]> {
  const dbEvents = await db.intelligenceEvent.findMany({
    where: {
      aggregateId,
      ...(asOf ? { timestamp: { lte: asOf } } : {}),
    },
    orderBy: { timestamp: 'asc' },
    take: 1000,
  });

  return dbEvents.map((dbe) => ({
    id: dbe.id,
    eventType: dbe.eventType as IntelligenceEventType,
    aggregateId: dbe.aggregateId,
    aggregateType: dbe.aggregateType as AggregateType,
    stream: dbe.stream as IntelligenceEvent['stream'],
    payload: dbe.payload ? JSON.parse(dbe.payload) : {},
    metadata: dbe.metadata ? JSON.parse(dbe.metadata) : undefined,
    timestamp: dbe.timestamp,
    processed: dbe.processed,
  }));
}

// ===== EVENT SUMMARIES =====

const EVENT_SUMMARIES: Record<IntelligenceEventType, string> = {
  'ingestion.raw_message': 'Nuevo mensaje recibido',
  'ingestion.batch_received': 'Lote de mensajes recibido',
  'analysis.semantic_completed': 'Análisis semántico completado',
  'analysis.pattern_detected': 'Patrón detectado',
  'analysis.risk_scored': 'Score de riesgo calculado',
  'analysis.correlation_found': 'Correlación encontrada',
  'monitoring.threshold_breached': 'Umbral superado',
  'monitoring.anomaly_detected': 'Anomalía detectada',
  'monitoring.alert_generated': 'Alerta generada',
  'monitoring.alert_escalated': 'Alerta escalada',
  'monitoring.alert_acknowledged': 'Alerta reconocida',
  'consensus.vote_cast': 'Voto emitido',
  'consensus.decision_made': 'Decisión de consenso',
  'prediction.forecast': 'Predicción generada',
  'adaptive.threshold_adjusted': 'Umbral adaptado',
  'adaptive.metric_recorded': 'Métrica adaptiva registrada',
  'report.generation_started': 'Generación de informe iniciada',
  'report.generation_completed': 'Informe generado',
  'agent.heartbeat': 'Latido de agente',
  'agent.status_changed': 'Estado de agente cambiado',
};

// ===== replayEntity =====

/**
 * Reconstructs entity state by replaying all IntelligenceEvents for the given entityId.
 * If `asOf` is provided, only events up to that date are considered (point-in-time query).
 */
export async function replayEntity(
  entityId: string,
  asOf?: Date
): Promise<ReplayResult<ReplayedEntityState>> {
  const events = await loadEventsForAggregate(entityId, asOf);

  // Seed the reconstructed state from the DB entity record (if it exists)
  const dbEntity = await db.entity.findUnique({ where: { id: entityId } });

  const state: ReplayedEntityState = {
    id: entityId,
    name: dbEntity?.name ?? '',
    type: dbEntity?.type ?? 'person',
    aliases: dbEntity?.aliases ? JSON.parse(dbEntity.aliases) : [],
    riskScore: 0,
    riskLevel: 'low',
    sentiment: 50,
    mentionCount: 0,
    lastSeen: null,
    firstSeen: null,
    patternAssociations: [],
    alertAssociations: [],
    acknowledgedAlerts: [],
    metadata: {},
  };

  // Apply events in chronological order
  for (const event of events) {
    applyEntityEvent(state, event);
  }

  // If DB entity exists and no events updated certain fields, use DB values as fallback
  if (dbEntity) {
    if (state.mentionCount === 0) state.mentionCount = dbEntity.mentionCount;
    if (state.riskScore === 0) state.riskScore = dbEntity.riskScore;
    if (state.riskLevel === 'low') state.riskLevel = dbEntity.riskLevel as RiskLevel;
    if (!state.firstSeen) state.firstSeen = dbEntity.firstSeen;
    if (!state.lastSeen) state.lastSeen = dbEntity.lastSeen;
  }

  return {
    state,
    events,
    replayedAt: new Date(),
    eventCount: events.length,
  };
}

function applyEntityEvent(state: ReplayedEntityState, event: IntelligenceEvent): void {
  const { eventType, payload, timestamp } = event;

  switch (eventType) {
    case 'ingestion.raw_message': {
      // Increment mention count and update lastSeen
      state.mentionCount += 1;
      state.lastSeen = timestamp;
      if (!state.firstSeen) state.firstSeen = timestamp;

      // Capture entity name from payload if available
      if (payload.entityName && !state.name) {
        state.name = payload.entityName as string;
      }
      if (payload.entityType && state.type === 'person') {
        state.type = payload.entityType as string;
      }
      break;
    }

    case 'analysis.semantic_completed': {
      // Update sentiment from semantic analysis
      if (payload.sentiment !== undefined) {
        state.sentiment = payload.sentiment as number;
      }
      if (payload.riskScore !== undefined) {
        state.riskScore = payload.riskScore as number;
      }
      if (payload.riskLevel !== undefined) {
        state.riskLevel = payload.riskLevel as RiskLevel;
      }
      break;
    }

    case 'analysis.pattern_detected': {
      // Add pattern association
      const patternId = payload.patternId as string | undefined;
      if (patternId && !state.patternAssociations.includes(patternId)) {
        state.patternAssociations.push(patternId);
      }
      // Pattern detection may raise risk
      if (payload.severity) {
        const severity = payload.severity as string;
        if (severity === 'CRÍTICA' || severity === 'ALTA') {
          state.riskScore = Math.min(100, state.riskScore + 10);
          if (state.riskScore >= 90) state.riskLevel = 'critical';
          else if (state.riskScore >= 70) state.riskLevel = 'high';
        }
      }
      break;
    }

    case 'analysis.risk_scored': {
      // Update riskScore and riskLevel from risk scoring
      if (payload.score !== undefined) {
        state.riskScore = payload.score as number;
      }
      if (payload.riskLevel !== undefined) {
        state.riskLevel = payload.riskLevel as RiskLevel;
      }
      // Also update from dimensions if present
      if (payload.nature !== undefined) {
        state.metadata.nature = payload.nature;
      }
      if (payload.volume !== undefined) {
        state.metadata.volume = payload.volume;
      }
      if (payload.connections !== undefined) {
        state.metadata.connections = payload.connections;
      }
      break;
    }

    case 'monitoring.alert_generated': {
      // Add alert association
      const alertId = payload.alertId as string | undefined;
      if (alertId && !state.alertAssociations.includes(alertId)) {
        state.alertAssociations.push(alertId);
      }
      break;
    }

    case 'monitoring.alert_acknowledged': {
      // Mark alert as acknowledged
      const ackAlertId = payload.alertId as string | undefined;
      if (ackAlertId && !state.acknowledgedAlerts.includes(ackAlertId)) {
        state.acknowledgedAlerts.push(ackAlertId);
      }
      break;
    }

    case 'monitoring.alert_escalated': {
      // Escalation increases risk level
      state.riskScore = Math.min(100, state.riskScore + 5);
      break;
    }

    case 'analysis.correlation_found': {
      // Correlation adds to metadata
      if (!state.metadata.correlations) {
        state.metadata.correlations = [];
      }
      (state.metadata.correlations as Record<string, unknown>[]).push(payload);
      break;
    }

    default:
      // Other event types don't directly affect entity state
      break;
  }
}

// ===== replayAlert =====

/**
 * Reconstructs alert lifecycle by replaying all events for the given alertId.
 * Tracks the full lifecycle: created → acknowledged / escalated.
 */
export async function replayAlert(
  alertId: string
): Promise<ReplayResult<ReplayedAlertState>> {
  const events = await loadEventsForAggregate(alertId);

  // Seed from DB alert record (if it exists)
  const dbAlert = await db.alert.findUnique({ where: { id: alertId } });

  const state: ReplayedAlertState = {
    id: alertId,
    source: '',
    severity: 'INFO',
    title: '',
    description: '',
    actionTaken: null,
    strategy: '',
    acknowledged: false,
    acknowledgedBy: null,
    acknowledgedAt: null,
    escalated: false,
    lifecycle: [],
    relatedEvents: [],
  };

  // Apply events in chronological order
  for (const event of events) {
    applyAlertEvent(state, event);
  }

  // Fallback to DB record for any fields not populated by events
  if (dbAlert) {
    if (!state.source) state.source = dbAlert.source;
    if (state.severity === 'INFO') state.severity = dbAlert.severity as AlertSeverity;
    if (!state.title) state.title = dbAlert.title;
    if (!state.description) state.description = dbAlert.description;
    if (!state.actionTaken) state.actionTaken = dbAlert.actionTaken;
    if (!state.strategy) state.strategy = dbAlert.strategy;
    // If DB says acknowledged but events didn't capture it, use DB
    if (dbAlert.acknowledged && !state.acknowledged) {
      state.acknowledged = true;
      state.acknowledgedBy = dbAlert.acknowledgedBy;
      state.acknowledgedAt = dbAlert.acknowledgedAt;
    }
    if (dbAlert.escalated && !state.escalated) {
      state.escalated = true;
    }
    if (dbAlert.relatedEvents) {
      try {
        const dbRelated = JSON.parse(dbAlert.relatedEvents) as string[];
        for (const eid of dbRelated) {
          if (!state.relatedEvents.includes(eid)) {
            state.relatedEvents.push(eid);
          }
        }
      } catch {
        // ignore parse errors
      }
    }
  }

  return {
    state,
    events,
    replayedAt: new Date(),
    eventCount: events.length,
  };
}

function applyAlertEvent(state: ReplayedAlertState, event: IntelligenceEvent): void {
  const { eventType, payload, timestamp } = event;

  switch (eventType) {
    case 'monitoring.alert_generated': {
      state.source = (payload.source as string) || state.source;
      state.severity = (payload.severity as AlertSeverity) || state.severity;
      state.title = (payload.title as string) || state.title;
      state.strategy = (payload.strategy as string) || state.strategy;
      state.lifecycle.push({
        timestamp,
        event: 'alert_generated',
        detail: `Alerta creada por ${payload.source || 'sistema'}. Severidad: ${payload.severity || 'N/A'}`,
      });
      break;
    }

    case 'monitoring.alert_acknowledged': {
      state.acknowledged = true;
      state.acknowledgedBy = (payload.acknowledgedBy as string) || null;
      state.acknowledgedAt = timestamp;
      state.lifecycle.push({
        timestamp,
        event: 'alert_acknowledged',
        detail: `Alerta reconocida por ${payload.acknowledgedBy || 'operador'}`,
      });
      break;
    }

    case 'monitoring.alert_escalated': {
      state.escalated = true;
      state.lifecycle.push({
        timestamp,
        event: 'alert_escalated',
        detail: `Alerta escalada${payload.escalatedBy ? ` por ${payload.escalatedBy}` : ''}`,
      });
      break;
    }

    case 'consensus.decision_made': {
      state.lifecycle.push({
        timestamp,
        event: 'consensus_decision',
        detail: `Consenso: ${payload.consensusAction || 'N/A'} (confianza: ${payload.consensusConfidence ?? 'N/A'}%)`,
      });
      if (payload.consensusAction === 'escalate') {
        state.escalated = true;
      }
      break;
    }

    case 'monitoring.threshold_breached': {
      state.lifecycle.push({
        timestamp,
        event: 'threshold_breached',
        detail: `Umbral superado: ${payload.thresholdName || payload.metric || 'N/A'}`,
      });
      break;
    }

    default: {
      // Record other relevant events in lifecycle
      const summary = EVENT_SUMMARIES[eventType] || eventType;
      state.lifecycle.push({
        timestamp,
        event: eventType,
        detail: summary,
      });
      break;
    }
  }
}

// ===== getEventTimeline =====

/**
 * Returns a formatted timeline of events for an aggregate.
 * Each entry contains: timestamp, eventType, summary, payload.
 */
export async function getEventTimeline(
  aggregateId: string,
  limit: number = 50
): Promise<TimelineEntry[]> {
  const dbEvents = await db.intelligenceEvent.findMany({
    where: { aggregateId },
    orderBy: { timestamp: 'desc' },
    take: limit,
  });

  return dbEvents.map((dbe) => ({
    timestamp: dbe.timestamp,
    eventType: dbe.eventType as IntelligenceEventType,
    summary: EVENT_SUMMARIES[dbe.eventType as IntelligenceEventType] || dbe.eventType,
    payload: dbe.payload ? JSON.parse(dbe.payload) : {},
  }));
}

// ===== getAggregateSnapshot =====

/**
 * Quick snapshot of current state from DB (not replayed).
 * Returns the current DB record for the given aggregate type and ID.
 */
export async function getAggregateSnapshot(
  aggregateType: AggregateType,
  aggregateId: string
): Promise<Entity | Alert | PatternDetection | null> {
  switch (aggregateType) {
    case 'entity': {
      const entity = await db.entity.findUnique({ where: { id: aggregateId } });
      if (!entity) return null;
      return {
        id: entity.id,
        name: entity.name,
        type: entity.type as Entity['type'],
        aliases: entity.aliases ? JSON.parse(entity.aliases) : undefined,
        riskScore: entity.riskScore,
        riskLevel: entity.riskLevel as RiskLevel,
        platformIds: entity.platformIds ? JSON.parse(entity.platformIds) : undefined,
        firstSeen: entity.firstSeen,
        lastSeen: entity.lastSeen,
        mentionCount: entity.mentionCount,
        metadata: entity.metadata ? JSON.parse(entity.metadata) : undefined,
      } as Entity;
    }

    case 'alert': {
      const alert = await db.alert.findUnique({ where: { id: aggregateId } });
      if (!alert) return null;
      return {
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
        acknowledged: alert.acknowledged,
        acknowledgedBy: alert.acknowledgedBy ?? undefined,
        acknowledgedAt: alert.acknowledgedAt ?? undefined,
        escalated: alert.escalated,
        relatedEvents: alert.relatedEvents ? JSON.parse(alert.relatedEvents) : undefined,
        timestamp: alert.timestamp,
      } as Alert;
    }

    case 'pattern': {
      const pattern = await db.patternDetection.findUnique({ where: { id: aggregateId } });
      if (!pattern) return null;
      return {
        id: pattern.id,
        patternType: pattern.patternType as PatternDetection['patternType'],
        severity: pattern.severity as AlertSeverity,
        confidence: pattern.confidence,
        description: pattern.description,
        evidenceIds: pattern.evidenceIds ? JSON.parse(pattern.evidenceIds) : undefined,
        entityIds: pattern.entityIds ? JSON.parse(pattern.entityIds) : undefined,
        detectionRate: pattern.detectionRate ?? undefined,
        occurrences: pattern.occurrences,
        status: pattern.status as PatternDetection['status'],
        firstDetected: pattern.firstDetected,
        lastDetected: pattern.lastDetected,
      } as PatternDetection;
    }

    default:
      return null;
  }
}
