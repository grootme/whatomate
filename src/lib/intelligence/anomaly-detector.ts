/**
 * Anomaly Detector — mon-ano Agent (DNA Layer 3: Monitoring)
 *
 * Statistical anomaly detection engine that identifies deviations from
 * historical baselines across message volume, entity behavior, and
 * cross-source activity patterns.
 *
 * Detection Methods:
 * 1. Z-Score Anomaly Detection — flags metrics where |z-score| > 2.0
 * 2. Volume Spike Detection — flags current hour > 3x same-hour 7-day average
 * 3. Entity Behavior Anomaly — flags entities exceeding 3x their 7-day mention average
 * 4. Cross-Source Correlation Anomaly — flags sources that suddenly spike together
 *
 * RICCO Patterns:
 * - Event Sourcing: All detected anomalies persisted via persistEvent
 * - Specification Pattern: Composable anomaly validation rules
 * - Observer Pattern: Agent state updates and alert generation on detection
 * - Strategy Pattern: Each detection method is a self-contained strategy
 */

import { db } from '@/lib/db';
import { persistEvent } from './event-persist';
import { safeEventAppend } from './safe-event';
import type { AlertSeverity, EventStream } from './types';

// ===== CONSTANTS =====

/** Z-score threshold: flag anomalies where |z-score| exceeds this value */
const Z_SCORE_THRESHOLD = 2.0;

/** Volume spike multiplier: current hour must exceed this × the historical average */
const VOLUME_SPIKE_MULTIPLIER = 3.0;

/** Entity mention spike multiplier: daily mentions must exceed this × the 7-day average */
const ENTITY_MENTION_SPIKE_MULTIPLIER = 3.0;

/** Rolling window for historical baseline (days) */
const ROLLING_WINDOW_DAYS = 7;

/** Cross-source correlation: minimum number of sources to consider */
const MIN_CROSS_SOURCES = 2;

/** Agent ID for the Anomaly Detector */
const AGENT_ID = 'mon-ano';

// ===== TYPES =====

export type AnomalyType =
  | 'z_score'
  | 'volume_spike'
  | 'entity_behavior'
  | 'cross_source_correlation';

export interface AnomalyDetail {
  type: AnomalyType;
  metric: string;
  currentValue: number;
  baselineValue: number;
  deviation: number;
  zScore: number;
  severity: AlertSeverity;
  description: string;
  relatedIds?: string[];
}

export interface AnomalyDetectionResult {
  detectionId: string;
  timestamp: string;
  anomaliesDetected: number;
  alertsCreated: number;
  details: AnomalyDetail[];
  agentHealth: number;
}

// ===== HELPERS =====

/**
 * Compute the mean of a numeric array.
 */
function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

/**
 * Compute the standard deviation of a numeric array (population).
 */
function stdDev(values: number[]): number {
  if (values.length < 2) return 0;
  const m = mean(values);
  const variance = values.reduce((sum, v) => sum + (v - m) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

/**
 * Maximum representable z-score — used instead of Infinity for JSON serialization.
 */
const MAX_Z_SCORE = 99.99;

/**
 * Compute z-score for a value given a reference population.
 * Caps at MAX_Z_SCORE instead of Infinity for safe JSON serialization.
 */
function zScore(value: number, population: number[]): number {
  const sd = stdDev(population);
  if (sd === 0) {
    // When all historical values are the same, any deviation is infinitely anomalous
    const m = mean(population);
    if (value === m) return 0;
    return value > m ? MAX_Z_SCORE : -MAX_Z_SCORE;
  }
  const raw = (value - mean(population)) / sd;
  // Cap to prevent Infinity in JSON serialization
  return Math.max(-MAX_Z_SCORE, Math.min(MAX_Z_SCORE, raw));
}

/**
 * Map a deviation magnitude to an alert severity.
 * Higher z-scores / multipliers → higher severity.
 */
function severityFromDeviation(
  type: AnomalyType,
  deviation: number,
  zScoreValue: number,
): AlertSeverity {
  const absZ = Math.abs(zScoreValue);

  // Z-score based severity mapping
  if (type === 'z_score') {
    if (absZ >= 4.0) return 'CRÍTICA';
    if (absZ >= 3.0) return 'ALTA';
    if (absZ >= 2.5) return 'MEDIA';
    return 'BAJA';
  }

  // Multiplier-based severity mapping
  if (deviation >= 10.0) return 'CRÍTICA';
  if (deviation >= 5.0) return 'ALTA';
  if (deviation >= 3.0) return 'MEDIA';
  return 'BAJA';
}

/**
 * Ensure the mon-ano agent state exists in the database, creating it if needed.
 */
async function ensureAgentState(): Promise<void> {
  const existing = await db.agentState.findUnique({ where: { agentId: AGENT_ID } });
  if (!existing) {
    await db.agentState.create({
      data: {
        agentId: AGENT_ID,
        name: 'Anomaly Detector',
        layer: 3,
        layerName: 'Monitoreo',
        status: 'active',
        health: 70,
        messagesProcessed: 0,
        lastHeartbeat: new Date(),
        startedAt: new Date(),
      },
    });
  }
}

/**
 * Update the mon-ano agent state after a detection run.
 */
async function updateAgentState(anomaliesFound: number): Promise<void> {
  const now = new Date();
  const healthScore = Math.min(100, 60 + Math.min(40, anomaliesFound * 5));
  const agentState = await db.agentState.findUnique({ where: { agentId: AGENT_ID } });

  if (agentState) {
    await db.agentState.update({
      where: { agentId: AGENT_ID },
      data: {
        status: 'active',
        health: healthScore,
        lastHeartbeat: now,
        messagesProcessed: agentState.messagesProcessed + anomaliesFound,
      },
    });
  } else {
    await db.agentState.create({
      data: {
        agentId: AGENT_ID,
        name: 'Anomaly Detector',
        layer: 3,
        layerName: 'Monitoreo',
        status: 'active',
        health: healthScore,
        messagesProcessed: anomaliesFound,
        lastHeartbeat: now,
        startedAt: now,
      },
    });
  }
}

// ===== DETECTION METHOD 1: Z-Score Anomaly Detection =====

/**
 * For each metric (message volume per source, entity mention rate, alert frequency),
 * compute the z-score against a rolling window of historical data.
 * Flag anomalies where |z-score| > 2.0.
 */
async function detectZScoreAnomalies(): Promise<AnomalyDetail[]> {
  const now = new Date();
  const anomalies: AnomalyDetail[] = [];

  // --- Metric 1: Message volume per source ---
  const sources = ['whatsapp', 'telegram', 'osint'] as const;

  for (const source of sources) {
    // Current hour message count
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
    const currentCount = await db.rawMessage.count({
      where: {
        source,
        timestamp: { gte: oneHourAgo },
      },
    });

    // Historical: same-hour counts for last 7 days
    const historicalCounts: number[] = [];
    for (let dayOffset = 1; dayOffset <= ROLLING_WINDOW_DAYS; dayOffset++) {
      const dayStart = new Date(now.getTime() - dayOffset * 24 * 60 * 60 * 1000);
      // Get the same hour window from `dayOffset` days ago
      const hourStart = new Date(dayStart.getFullYear(), dayStart.getMonth(), dayStart.getDate(), now.getHours(), 0, 0);
      const hourEnd = new Date(hourStart.getTime() + 60 * 60 * 1000);

      const count = await db.rawMessage.count({
        where: {
          source,
          timestamp: { gte: hourStart, lte: hourEnd },
        },
      });
      historicalCounts.push(count);
    }

    const zs = zScore(currentCount, historicalCounts);
    if (Math.abs(zs) > Z_SCORE_THRESHOLD) {
      const baseline = mean(historicalCounts);
      const deviation = baseline > 0 ? currentCount / baseline : (currentCount > 0 ? MAX_Z_SCORE : 0);
      anomalies.push({
        type: 'z_score',
        metric: `message_volume_${source}`,
        currentValue: currentCount,
        baselineValue: Math.round(baseline * 100) / 100,
        deviation: Math.round(deviation * 100) / 100,
        zScore: Math.round(zs * 100) / 100,
        severity: severityFromDeviation('z_score', deviation, zs),
        description: `Z-score anomaly for ${source} message volume: current=${currentCount}, baseline=${baseline.toFixed(1)}, z-score=${zs.toFixed(2)}`,
      });
    }
  }

  // --- Metric 2: Entity mention rate (mentions/hour across all entities) ---
  const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
  const currentMentionRate = await db.entity.count({
    where: { lastSeen: { gte: oneHourAgo } },
  });

  const historicalMentionRates: number[] = [];
  for (let dayOffset = 1; dayOffset <= ROLLING_WINDOW_DAYS; dayOffset++) {
    const dayStart = new Date(now.getTime() - dayOffset * 24 * 60 * 60 * 1000);
    const hourStart = new Date(dayStart.getFullYear(), dayStart.getMonth(), dayStart.getDate(), now.getHours(), 0, 0);
    const hourEnd = new Date(hourStart.getTime() + 60 * 60 * 1000);

    const count = await db.entity.count({
      where: { lastSeen: { gte: hourStart, lte: hourEnd } },
    });
    historicalMentionRates.push(count);
  }

  if (historicalMentionRates.length >= 2) {
    const zs = zScore(currentMentionRate, historicalMentionRates);
    if (Math.abs(zs) > Z_SCORE_THRESHOLD) {
      const baseline = mean(historicalMentionRates);
      const deviation = baseline > 0 ? currentMentionRate / baseline : (currentMentionRate > 0 ? MAX_Z_SCORE : 0);
      anomalies.push({
        type: 'z_score',
        metric: 'entity_mention_rate',
        currentValue: currentMentionRate,
        baselineValue: Math.round(baseline * 100) / 100,
        deviation: Math.round(deviation * 100) / 100,
        zScore: Math.round(zs * 100) / 100,
        severity: severityFromDeviation('z_score', deviation, zs),
        description: `Z-score anomaly for entity mention rate: current=${currentMentionRate} entities/hour, baseline=${baseline.toFixed(1)}, z-score=${zs.toFixed(2)}`,
      });
    }
  }

  // --- Metric 3: Alert frequency (alerts/hour) ---
  const currentAlertRate = await db.alert.count({
    where: { timestamp: { gte: oneHourAgo } },
  });

  const historicalAlertRates: number[] = [];
  for (let dayOffset = 1; dayOffset <= ROLLING_WINDOW_DAYS; dayOffset++) {
    const dayStart = new Date(now.getTime() - dayOffset * 24 * 60 * 60 * 1000);
    const hourStart = new Date(dayStart.getFullYear(), dayStart.getMonth(), dayStart.getDate(), now.getHours(), 0, 0);
    const hourEnd = new Date(hourStart.getTime() + 60 * 60 * 1000);

    const count = await db.alert.count({
      where: { timestamp: { gte: hourStart, lte: hourEnd } },
    });
    historicalAlertRates.push(count);
  }

  if (historicalAlertRates.length >= 2) {
    const zs = zScore(currentAlertRate, historicalAlertRates);
    if (Math.abs(zs) > Z_SCORE_THRESHOLD) {
      const baseline = mean(historicalAlertRates);
      const deviation = baseline > 0 ? currentAlertRate / baseline : (currentAlertRate > 0 ? MAX_Z_SCORE : 0);
      anomalies.push({
        type: 'z_score',
        metric: 'alert_frequency',
        currentValue: currentAlertRate,
        baselineValue: Math.round(baseline * 100) / 100,
        deviation: Math.round(deviation * 100) / 100,
        zScore: Math.round(zs * 100) / 100,
        severity: severityFromDeviation('z_score', deviation, zs),
        description: `Z-score anomaly for alert frequency: current=${currentAlertRate} alerts/hour, baseline=${baseline.toFixed(1)}, z-score=${zs.toFixed(2)}`,
      });
    }
  }

  return anomalies;
}

// ===== DETECTION METHOD 2: Volume Spike Detection =====

/**
 * Compare current hour message count to the same hour in previous 7 days.
 * If current > 3x average, flag as anomaly.
 */
async function detectVolumeSpikes(): Promise<AnomalyDetail[]> {
  const now = new Date();
  const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
  const anomalies: AnomalyDetail[] = [];

  const sources = ['whatsapp', 'telegram', 'osint'] as const;

  // Overall + per-source volume spike detection
  for (const source of sources) {
    // Current hour count
    const currentCount = await db.rawMessage.count({
      where: {
        source,
        timestamp: { gte: oneHourAgo },
      },
    });

    // Same-hour counts for the previous 7 days
    const sameHourCounts: number[] = [];
    for (let dayOffset = 1; dayOffset <= ROLLING_WINDOW_DAYS; dayOffset++) {
      const dayStart = new Date(now.getTime() - dayOffset * 24 * 60 * 60 * 1000);
      const hourStart = new Date(dayStart.getFullYear(), dayStart.getMonth(), dayStart.getDate(), now.getHours(), 0, 0);
      const hourEnd = new Date(hourStart.getTime() + 60 * 60 * 1000);

      const count = await db.rawMessage.count({
        where: {
          source,
          timestamp: { gte: hourStart, lte: hourEnd },
        },
      });
      sameHourCounts.push(count);
    }

    const avgHistorical = mean(sameHourCounts);

    if (currentCount > 0 && currentCount > avgHistorical * VOLUME_SPIKE_MULTIPLIER) {
      const multiplier = currentCount / avgHistorical;
      const zs = avgHistorical > 0 ? (currentCount - avgHistorical) / (stdDev(sameHourCounts) || 1) : 0;

      anomalies.push({
        type: 'volume_spike',
        metric: `volume_spike_${source}`,
        currentValue: currentCount,
        baselineValue: Math.round(avgHistorical * 100) / 100,
        deviation: Math.round(multiplier * 100) / 100,
        zScore: Math.round(zs * 100) / 100,
        severity: severityFromDeviation('volume_spike', multiplier, zs),
        description: `Volume spike on ${source}: ${currentCount} messages this hour vs ${avgHistorical.toFixed(1)} avg (${multiplier.toFixed(1)}x increase)`,
      });
    }
  }

  // Total volume spike (all sources combined)
  const currentTotal = await db.rawMessage.count({
    where: { timestamp: { gte: oneHourAgo } },
  });

  const totalHistoricalCounts: number[] = [];
  for (let dayOffset = 1; dayOffset <= ROLLING_WINDOW_DAYS; dayOffset++) {
    const dayStart = new Date(now.getTime() - dayOffset * 24 * 60 * 60 * 1000);
    const hourStart = new Date(dayStart.getFullYear(), dayStart.getMonth(), dayStart.getDate(), now.getHours(), 0, 0);
    const hourEnd = new Date(hourStart.getTime() + 60 * 60 * 1000);

    const count = await db.rawMessage.count({
      where: { timestamp: { gte: hourStart, lte: hourEnd } },
    });
    totalHistoricalCounts.push(count);
  }

  const avgTotal = mean(totalHistoricalCounts);
  if (avgTotal > 0 && currentTotal > avgTotal * VOLUME_SPIKE_MULTIPLIER) {
    const multiplier = currentTotal / avgTotal;
    const zs = (currentTotal - avgTotal) / (stdDev(totalHistoricalCounts) || 1);

    anomalies.push({
      type: 'volume_spike',
      metric: 'volume_spike_total',
      currentValue: currentTotal,
      baselineValue: Math.round(avgTotal * 100) / 100,
      deviation: Math.round(multiplier * 100) / 100,
      zScore: Math.round(zs * 100) / 100,
      severity: severityFromDeviation('volume_spike', multiplier, zs),
      description: `Total volume spike: ${currentTotal} messages this hour vs ${avgTotal.toFixed(1)} avg (${multiplier.toFixed(1)}x increase)`,
    });
  }

  return anomalies;
}

// ===== DETECTION METHOD 3: Entity Behavior Anomaly =====

/**
 * Track entity mention frequency. If an entity's daily mention count exceeds
 * 3x its 7-day average, create an anomaly event.
 */
async function detectEntityBehaviorAnomalies(): Promise<AnomalyDetail[]> {
  const now = new Date();
  const anomalies: AnomalyDetail[] = [];

  // Current day start
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  // Fetch entities that have been mentioned today
  const activeEntities = await db.entity.findMany({
    where: {
      lastSeen: { gte: todayStart },
      mentionCount: { gt: 0 },
    },
    orderBy: { mentionCount: 'desc' },
    take: 100, // Limit to top 100 most mentioned
  });

  for (const entity of activeEntities) {
    // Get today's mention count for this entity
    // We need to count how many RawMessages mention this entity today.
    // Since the entity's mentionCount is cumulative, we compute daily delta.
    // Approach: count messages from today that reference this entity via metadata or EntityRelation
    const todayMentionsFromRelations = await db.entityRelation.count({
      where: {
        OR: [
          { fromEntityId: entity.id },
          { toEntityId: entity.id },
        ],
        lastSeen: { gte: todayStart },
      },
    });

    // Also use the entity's lastSeen and mentionCount delta as a heuristic.
    // If the entity was last seen today, its recent activity is captured.
    // For a more precise count, look at IntelligenceEvents referencing this entity.
    const todayMentionsFromEvents = await db.intelligenceEvent.count({
      where: {
        aggregateId: entity.id,
        timestamp: { gte: todayStart },
      },
    });

    // Use the higher of the two counts as today's mention count
    const todayMentionCount = Math.max(todayMentionsFromRelations, todayMentionsFromEvents);

    // Skip entities with no meaningful activity today
    if (todayMentionCount === 0) continue;

    // Compute 7-day average daily mention count
    const sevenDaysAgo = new Date(now.getTime() - ROLLING_WINDOW_DAYS * 24 * 60 * 60 * 1000);
    const historicalMentions = await db.intelligenceEvent.count({
      where: {
        aggregateId: entity.id,
        timestamp: { gte: sevenDaysAgo, lte: todayStart },
      },
    });

    // Average daily mentions over the 7-day window
    const avgDailyMentions = historicalMentions / ROLLING_WINDOW_DAYS;

    // Check if today's count exceeds 3x the average
    if (avgDailyMentions > 0 && todayMentionCount > avgDailyMentions * ENTITY_MENTION_SPIKE_MULTIPLIER) {
      const multiplier = todayMentionCount / avgDailyMentions;
      const baseline = avgDailyMentions;

      // Build a synthetic population for z-score
      const syntheticPopulation = Array(ROLLING_WINDOW_DAYS).fill(baseline);
      const zs = zScore(todayMentionCount, syntheticPopulation);

      anomalies.push({
        type: 'entity_behavior',
        metric: `entity_behavior_${entity.name.replace(/\s+/g, '_').toLowerCase()}`,
        currentValue: todayMentionCount,
        baselineValue: Math.round(baseline * 100) / 100,
        deviation: Math.round(multiplier * 100) / 100,
        zScore: Math.round(zs * 100) / 100,
        severity: severityFromDeviation('entity_behavior', multiplier, zs),
        description: `Entity "${entity.name}" (${entity.type}) mentioned ${todayMentionCount} times today vs ${baseline.toFixed(1)} daily avg (${multiplier.toFixed(1)}x). Risk: ${entity.riskScore}/100`,
        relatedIds: [entity.id],
      });
    }
  }

  return anomalies;
}

// ===== DETECTION METHOD 4: Cross-Source Correlation Anomaly =====

/**
 * If two sources that normally have low correlation suddenly spike together,
 * flag as anomaly.
 *
 * Approach:
 * 1. Compute per-source hourly message counts for the last 7 days
 * 2. Calculate Pearson correlation between each source pair
 * 3. If the current hour shows a spike in two sources whose historical
 *    correlation is below 0.3, flag as anomaly
 */
async function detectCrossSourceCorrelationAnomalies(): Promise<AnomalyDetail[]> {
  const now = new Date();
  const anomalies: AnomalyDetail[] = [];

  const sources = ['whatsapp', 'telegram', 'osint'] as const;

  // Current hour counts per source
  const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
  const currentCounts: Record<string, number> = {};
  for (const source of sources) {
    currentCounts[source] = await db.rawMessage.count({
      where: { source, timestamp: { gte: oneHourAgo } },
    });
  }

  // Build hourly time series for the last 7 days for each source
  const hourlySeries: Record<string, number[]> = {};
  for (const source of sources) {
    hourlySeries[source] = [];
    const sevenDaysAgo = new Date(now.getTime() - ROLLING_WINDOW_DAYS * 24 * 60 * 60 * 1000);

    // Get all messages from the last 7 days for this source, grouped by hour
    // We'll build the series from the DB
    const messages = await db.rawMessage.findMany({
      where: {
        source,
        timestamp: { gte: sevenDaysAgo },
      },
      select: { timestamp: true },
    });

    // Group into hourly buckets
    const hourBuckets = new Map<string, number>();
    for (const msg of messages) {
      const hourKey = new Date(
        msg.timestamp.getFullYear(),
        msg.timestamp.getMonth(),
        msg.timestamp.getDate(),
        msg.timestamp.getHours(),
        0, 0, 0,
      ).toISOString();
      hourBuckets.set(hourKey, (hourBuckets.get(hourKey) || 0) + 1);
    }

    // Fill the series with all hours in the 7-day window
    for (let h = 0; h < ROLLING_WINDOW_DAYS * 24; h++) {
      const hourTime = new Date(sevenDaysAgo.getTime() + h * 60 * 60 * 1000);
      const hourKey = new Date(
        hourTime.getFullYear(),
        hourTime.getMonth(),
        hourTime.getDate(),
        hourTime.getHours(),
        0, 0, 0,
      ).toISOString();
      hourlySeries[source].push(hourBuckets.get(hourKey) || 0);
    }
  }

  /**
   * Compute Pearson correlation coefficient between two numeric arrays.
   */
  function pearsonCorrelation(x: number[], y: number[]): number {
    const n = Math.min(x.length, y.length);
    if (n < 3) return 0;

    const xSlice = x.slice(0, n);
    const ySlice = y.slice(0, n);

    const meanX = mean(xSlice);
    const meanY = mean(ySlice);

    let numSum = 0;
    let denXSum = 0;
    let denYSum = 0;

    for (let i = 0; i < n; i++) {
      const dx = xSlice[i] - meanX;
      const dy = ySlice[i] - meanY;
      numSum += dx * dy;
      denXSum += dx * dx;
      denYSum += dy * dy;
    }

    const denominator = Math.sqrt(denXSum * denYSum);
    if (denominator === 0) return 0;

    return numSum / denominator;
  }

  // Check each pair of sources for correlation anomaly
  const CORRELATION_LOW_THRESHOLD = 0.3;
  const SPIKE_MULTIPLIER = 2.0; // At least 2x the average to be a "spike"

  for (let i = 0; i < sources.length; i++) {
    for (let j = i + 1; j < sources.length; j++) {
      const sourceA = sources[i];
      const sourceB = sources[j];

      const seriesA = hourlySeries[sourceA];
      const seriesB = hourlySeries[sourceB];

      // Compute historical correlation
      const correlation = pearsonCorrelation(seriesA, seriesB);

      // Only flag if historically LOW correlation (sources are normally independent)
      if (Math.abs(correlation) >= CORRELATION_LOW_THRESHOLD) continue;

      // Check if BOTH sources are spiking right now
      const avgA = mean(seriesA);
      const avgB = mean(seriesB);

      const isSpikingA = avgA > 0 ? currentCounts[sourceA] > avgA * SPIKE_MULTIPLIER : currentCounts[sourceA] > 10;
      const isSpikingB = avgB > 0 ? currentCounts[sourceB] > avgB * SPIKE_MULTIPLIER : currentCounts[sourceB] > 10;

      if (isSpikingA && isSpikingB) {
        const multiplierA = avgA > 0 ? currentCounts[sourceA] / avgA : currentCounts[sourceA] > 0 ? MAX_Z_SCORE : 0;
        const multiplierB = avgB > 0 ? currentCounts[sourceB] / avgB : currentCounts[sourceB] > 0 ? MAX_Z_SCORE : 0;
        const combinedMultiplier = (multiplierA + multiplierB) / 2;

        // Z-score approximation using both series
        const zsA = stdDev(seriesA) > 0 ? (currentCounts[sourceA] - avgA) / stdDev(seriesA) : 0;
        const zsB = stdDev(seriesB) > 0 ? (currentCounts[sourceB] - avgB) / stdDev(seriesB) : 0;
        const combinedZScore = (zsA + zsB) / 2;

        anomalies.push({
          type: 'cross_source_correlation',
          metric: `cross_source_${sourceA}_${sourceB}`,
          currentValue: currentCounts[sourceA] + currentCounts[sourceB],
          baselineValue: Math.round((avgA + avgB) * 100) / 100,
          deviation: Math.round(combinedMultiplier * 100) / 100,
          zScore: Math.round(combinedZScore * 100) / 100,
          severity: severityFromDeviation('cross_source_correlation', combinedMultiplier, combinedZScore),
          description: `Low-correlation sources ${sourceA} (r=${correlation.toFixed(2)}) and ${sourceB} both spiking: ${sourceA}=${currentCounts[sourceA]} (${multiplierA.toFixed(1)}x), ${sourceB}=${currentCounts[sourceB]} (${multiplierB.toFixed(1)}x)`,
        });
      }
    }
  }

  return anomalies;
}

// ===== ALERT & EVENT CREATION =====

/**
 * Create an Alert and IntelligenceEvent for each detected anomaly.
 */
async function persistAnomalies(anomalies: AnomalyDetail[]): Promise<number> {
  let alertsCreated = 0;
  const stream: EventStream = 'whatomate:alerts';
  const eventIds: string[] = [];

  for (const anomaly of anomalies) {
    // Create Alert in the database
    const alert = await db.alert.create({
      data: {
        source: AGENT_ID,
        severity: anomaly.severity,
        title: `Anomaly: ${anomaly.metric.replace(/_/g, ' ')}`,
        description: anomaly.description,
        actionTaken: `Statistical anomaly detected via ${anomaly.type.replace(/_/g, ' ')} method. Z-score: ${anomaly.zScore}, deviation: ${anomaly.deviation}x baseline.`,
        strategy: 'adaptive',
        relatedEvents: anomaly.relatedIds ? JSON.stringify(anomaly.relatedIds) : undefined,
      },
    });
    alertsCreated++;
    eventIds.push(alert.id);

    // Create IntelligenceEvent via persistEvent
    await persistEvent(stream, {
      eventType: 'monitoring.anomaly_detected',
      aggregateId: alert.id,
      aggregateType: 'alert',
      payload: {
        anomalyType: anomaly.type,
        metric: anomaly.metric,
        currentValue: anomaly.currentValue,
        baselineValue: anomaly.baselineValue,
        deviation: anomaly.deviation,
        zScore: anomaly.zScore,
        severity: anomaly.severity,
        description: anomaly.description,
        relatedIds: anomaly.relatedIds,
      },
      metadata: {
        source: AGENT_ID,
        detectionMethod: anomaly.type,
        alertId: alert.id,
      },
    });
  }

  // Also emit a summary event to the intel events stream
  if (anomalies.length > 0) {
    const intelStream: EventStream = 'whatomate:intel_events';
    safeEventAppend(intelStream, {
      eventType: 'monitoring.anomaly_detected',
      aggregateId: `anomaly_batch_${Date.now()}`,
      aggregateType: 'alert',
      payload: {
        totalAnomalies: anomalies.length,
        alertsCreated,
        anomalyTypes: anomalies.map(a => a.type),
        severities: anomalies.map(a => a.severity),
        eventIds,
      },
      metadata: {
        source: AGENT_ID,
        batchDetection: true,
      },
    });
  }

  return alertsCreated;
}

// ===== MAIN EXPORT =====

/**
 * Run all anomaly detection methods and persist results.
 *
 * This is the main entry point that can be called from API routes or the scheduler.
 *
 * @returns AnomalyDetectionResult with counts and details
 */
export async function runAnomalyDetection(): Promise<AnomalyDetectionResult> {
  const now = new Date();
  const detectionId = `anomaly_${Date.now()}`;

  // Ensure agent state exists
  await ensureAgentState();

  // Run all detection methods in parallel
  const [zScoreAnomalies, volumeAnomalies, entityAnomalies, correlationAnomalies] = await Promise.all([
    detectZScoreAnomalies(),
    detectVolumeSpikes(),
    detectEntityBehaviorAnomalies(),
    detectCrossSourceCorrelationAnomalies(),
  ]);

  // Deduplicate anomalies: same metric from different detection methods
  // Priority: more specific detection type wins over generic z-score for the same metric
  const allAnomalies = [...zScoreAnomalies, ...volumeAnomalies, ...entityAnomalies, ...correlationAnomalies];

  // Deduplicate by metric — prefer the more specific type
  const seenMetrics = new Map<string, AnomalyDetail>();
  const typePriority: Record<AnomalyType, number> = {
    cross_source_correlation: 4,
    entity_behavior: 3,
    volume_spike: 2,
    z_score: 1,
  };

  for (const anomaly of allAnomalies) {
    const existing = seenMetrics.get(anomaly.metric);
    if (!existing || typePriority[anomaly.type] > typePriority[existing.type]) {
      seenMetrics.set(anomaly.metric, anomaly);
    }
  }

  const dedupedAnomalies = Array.from(seenMetrics.values());

  // Persist anomalies as alerts + events
  const alertsCreated = await persistAnomalies(dedupedAnomalies);

  // Update agent state
  await updateAgentState(dedupedAnomalies.length);

  // Compute agent health score
  const agentHealth = dedupedAnomalies.length > 0
    ? Math.min(100, 60 + Math.min(40, dedupedAnomalies.length * 5))
    : 85; // Healthy when no anomalies

  return {
    detectionId,
    timestamp: now.toISOString(),
    anomaliesDetected: dedupedAnomalies.length,
    alertsCreated,
    details: dedupedAnomalies,
    agentHealth,
  };
}
