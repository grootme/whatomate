/**
 * INNOVATION 6: Threat Level Aggregation
 *
 * Aggregates all signals into a single threat level (LOW/MEDIUM/HIGH/CRITICAL).
 *
 * Weighting:
 * - 30% alert severity distribution
 * - 25% anomaly detection rate
 * - 20% risk scores
 * - 15% pattern confidence
 * - 10% OSINT threat level
 *
 * Computed on-demand (or every 15 minutes via scheduler).
 * Persisted to IntelligenceEvent as `system.threat_level_computed`.
 * Exposed via API at /api/threat-level.
 *
 * RICCO Patterns:
 * - Event Sourcing: All threat level computations persisted
 * - Strategy Pattern: Weighted aggregation of multiple signals
 */

import { db } from '@/lib/db';
import { persistEvent } from './event-persist';
import type { EventStream } from './types';

// ===== TYPES =====

export type ThreatLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export interface ThreatLevelResult {
  level: ThreatLevel;
  score: number; // 0-100
  components: {
    alertSeverity: number;     // 30% weight
    anomalyRate: number;       // 25% weight
    riskScores: number;        // 20% weight
    patternConfidence: number; // 15% weight
    osintThreat: number;       // 10% weight
  };
  computedAt: string;
  alertCounts: {
    critica: number;
    alta: number;
    media: number;
    baja: number;
    info: number;
  };
  anomalyCount: number;
  entityCount: number;
  patternCount: number;
}

// ===== WEIGHTS =====

const WEIGHTS = {
  alertSeverity: 0.30,
  anomalyRate: 0.25,
  riskScores: 0.20,
  patternConfidence: 0.15,
  osintThreat: 0.10,
};

// ===== THREAT LEVEL THRESHOLDS =====

const THRESHOLDS: Array<{ max: number; level: ThreatLevel }> = [
  { max: 25, level: 'LOW' },
  { max: 50, level: 'MEDIUM' },
  { max: 75, level: 'HIGH' },
  { max: 100, level: 'CRITICAL' },
];

function scoreToThreatLevel(score: number): ThreatLevel {
  for (const t of THRESHOLDS) {
    if (score <= t.max) return t.level;
  }
  return 'CRITICAL';
}

// ===== SIGNAL COMPUTATION =====

/**
 * Compute alert severity component (30% weight).
 * Based on distribution of alert severities in the last 24 hours.
 * More CRÍTICA/ALTA alerts → higher score.
 */
async function computeAlertSeverityScore(): Promise<{ score: number; counts: ThreatLevelResult['alertCounts'] }> {
  const now = new Date();
  const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  const alerts = await db.alert.findMany({
    where: { timestamp: { gte: oneDayAgo } },
    select: { severity: true },
  });

  const counts = {
    critica: alerts.filter(a => a.severity === 'CRÍTICA').length,
    alta: alerts.filter(a => a.severity === 'ALTA').length,
    media: alerts.filter(a => a.severity === 'MEDIA').length,
    baja: alerts.filter(a => a.severity === 'BAJA').length,
    info: alerts.filter(a => a.severity === 'INFO').length,
  };

  const total = alerts.length;
  if (total === 0) return { score: 0, counts };

  // Weighted severity score
  const weightedSum =
    counts.critica * 100 +
    counts.alta * 75 +
    counts.media * 50 +
    counts.baja * 25 +
    counts.info * 5;

  const score = Math.min(100, (weightedSum / total));

  return { score: Math.round(score), counts };
}

/**
 * Compute anomaly detection rate component (25% weight).
 * Based on anomaly events in the last 24 hours.
 * More anomalies → higher score.
 */
async function computeAnomalyRateScore(): Promise<{ score: number; count: number }> {
  const now = new Date();
  const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  const anomalyCount = await db.intelligenceEvent.count({
    where: {
      eventType: 'monitoring.anomaly_detected',
      timestamp: { gte: oneDayAgo },
    },
  });

  // Score: 0 anomalies = 0, 5+ = 50, 10+ = 75, 20+ = 100
  const score = anomalyCount === 0 ? 0
    : anomalyCount < 3 ? 25
    : anomalyCount < 5 ? 40
    : anomalyCount < 10 ? 55
    : anomalyCount < 20 ? 75
    : 100;

  return { score, count: anomalyCount };
}

/**
 * Compute risk score component (20% weight).
 * Based on average risk score of active entities.
 */
async function computeRiskScoreComponent(): Promise<number> {
  const now = new Date();
  const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  const entities = await db.entity.findMany({
    where: { lastSeen: { gte: oneDayAgo } },
    select: { riskScore: true },
  });

  if (entities.length === 0) return 0;

  const avgRisk = entities.reduce((sum, e) => sum + e.riskScore, 0) / entities.length;
  return Math.round(avgRisk);
}

/**
 * Compute pattern confidence component (15% weight).
 * Based on average confidence of active patterns.
 */
async function computePatternConfidenceScore(): Promise<number> {
  const activePatterns = await db.patternDetection.findMany({
    where: { status: { in: ['active', 'confirmed', 'investigating'] } },
    select: { confidence: true },
  });

  if (activePatterns.length === 0) return 0;

  const avgConfidence = activePatterns.reduce((sum, p) => sum + p.confidence, 0) / activePatterns.length;
  return Math.round(avgConfidence);
}

/**
 * Compute OSINT threat level component (10% weight).
 * Based on OSINT data availability and severity.
 */
async function computeOsintThreatScore(): Promise<number> {
  const now = new Date();
  const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  // Count OSINT messages in the last 24 hours
  const osintCount = await db.rawMessage.count({
    where: {
      source: 'osint',
      timestamp: { gte: oneDayAgo },
    },
  });

  // Check for high-magnitude earthquakes
  const earthquakeMessages = await db.rawMessage.findMany({
    where: {
      source: 'osint',
      timestamp: { gte: oneDayAgo },
      metadata: { contains: '"type":"earthquake"' },
    },
    select: { content: true },
  });

  // Check for military flights
  const militaryFlights = await db.rawMessage.count({
    where: {
      source: 'osint',
      timestamp: { gte: oneDayAgo },
      metadata: { contains: '"isMilitary":true' },
    },
  });

  // Base score from OSINT volume
  let score = Math.min(40, osintCount * 2);

  // Boost for high-magnitude earthquakes
  if (earthquakeMessages.length > 0) {
    score += 20;
  }

  // Boost for military flights
  score += Math.min(20, militaryFlights * 5);

  // Check weather alerts
  const weatherAlerts = await db.rawMessage.count({
    where: {
      source: 'osint',
      timestamp: { gte: oneDayAgo },
      metadata: { contains: '"type":"weather"' },
    },
  });

  score += Math.min(20, weatherAlerts * 5);

  return Math.min(100, score);
}

// ===== MAIN COMPUTATION =====

/**
 * Compute the overall threat level by aggregating all signals.
 */
export async function computeThreatLevel(): Promise<ThreatLevelResult> {
  const now = new Date();

  const [
    alertResult,
    anomalyResult,
    riskScore,
    patternConfidence,
    osintThreat,
    entityCount,
    patternCount,
  ] = await Promise.all([
    computeAlertSeverityScore(),
    computeAnomalyRateScore(),
    computeRiskScoreComponent(),
    computePatternConfidenceScore(),
    computeOsintThreatScore(),
    db.entity.count({ where: { lastSeen: { gte: new Date(now.getTime() - 24 * 60 * 60 * 1000) } } }),
    db.patternDetection.count({ where: { status: { in: ['active', 'confirmed'] } } }),
  ]);

  // Weighted aggregation
  const totalScore = Math.round(
    alertResult.score * WEIGHTS.alertSeverity +
    anomalyResult.score * WEIGHTS.anomalyRate +
    riskScore * WEIGHTS.riskScores +
    patternConfidence * WEIGHTS.patternConfidence +
    osintThreat * WEIGHTS.osintThreat
  );

  const threatLevel = scoreToThreatLevel(totalScore);

  const result: ThreatLevelResult = {
    level: threatLevel,
    score: totalScore,
    components: {
      alertSeverity: alertResult.score,
      anomalyRate: anomalyResult.score,
      riskScores,
      patternConfidence,
      osintThreat,
    },
    computedAt: now.toISOString(),
    alertCounts: alertResult.counts,
    anomalyCount: anomalyResult.count,
    entityCount,
    patternCount,
  };

  // Persist threat level computation event
  const stream: EventStream = 'whatomate:intel_events';
  await persistEvent(stream, {
    eventType: 'agent.status_changed',
    aggregateId: `threat_level_${Date.now()}`,
    aggregateType: 'agent',
    payload: {
      action: 'threat_level_computed',
      level: threatLevel,
      score: totalScore,
      components: result.components,
      alertCounts: result.alertCounts,
      anomalyCount: result.anomalyCount,
    },
    metadata: {
      source: 'threat-level-aggregator',
      weights: WEIGHTS,
    },
  });

  return result;
}
