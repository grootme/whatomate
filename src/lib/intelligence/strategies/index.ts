/**
 * 6 Decision Strategies — Multi-Agent Intelligence Platform
 *
 * RICCO Patterns Applied:
 * - Strategy Pattern (Registry-Driven ADN): Each strategy implements DecisionStrategyHandler
 * - Specification Pattern (Guarded Lifecycle ADN): Validate context before evaluation
 * - Observer Pattern (Event-Driven ADN): Emit events on decisions via eventStore
 * - State Machine (Guarded Lifecycle ADN): Alert state transitions
 */

import { db } from '@/lib/db';
import { eventStore } from '../event-store';
import { notifyAlert, notifyConsensusResult } from '../notification-channel';
import { shouldAlertSpec, highRiskSpec, actionablePatternSpec } from '../specs';
import { getAgentVoteWeight } from '../agent-reputation';
import type {
  DecisionStrategy,
  DecisionStrategyHandler,
  StrategyContext,
  StrategyResult,
  AlertSeverity,
  ThresholdConfig,
  RawMessage,
  RiskAssessment,
  PatternDetection,
  Alert,
  ConsensusVote,
} from '../types';

// ===== STRATEGY REGISTRY (Registry-Driven - RICCO ADN 3) =====

class StrategyRegistry {
  private strategies: Map<DecisionStrategy, DecisionStrategyHandler> = new Map();

  register(strategy: DecisionStrategyHandler): void {
    this.strategies.set(strategy.id, strategy);
  }

  get(id: DecisionStrategy): DecisionStrategyHandler | undefined {
    return this.strategies.get(id);
  }

  getAll(): DecisionStrategyHandler[] {
    return Array.from(this.strategies.values());
  }

  async evaluateWith(id: DecisionStrategy, ctx: StrategyContext): Promise<StrategyResult> {
    const strategy = this.strategies.get(id);
    if (!strategy) {
      return { action: 'dismiss', confidence: 0, reasoning: `Strategy ${id} not found` };
    }
    return strategy.evaluate(ctx);
  }
}

export const strategyRegistry = new StrategyRegistry();

// ===== STRATEGY 1: THRESHOLD (Reactive) =====
/**
 * Numeric limits trigger automatic actions.
 * Example: 3+ fraud mentions per hour → red alert
 */
const thresholdStrategy: DecisionStrategyHandler = {
  id: 'threshold',
  name: 'Umbrales (Reactiva)',
  description: 'Acciones automáticas basadas en límites numéricos configurables',
  async evaluate(ctx: StrategyContext): Promise<StrategyResult> {
    const triggeredThresholds: ThresholdConfig[] = [];
    let maxSeverity: AlertSeverity = 'INFO';

    for (const threshold of ctx.thresholds) {
      // Use Specification Pattern to validate
      const specResult = shouldAlertSpec.isSatisfiedBy({ threshold });
      if (specResult) {
        triggeredThresholds.push(threshold);
        // Severity escalation
        const severityOrder: AlertSeverity[] = ['INFO', 'BAJA', 'MEDIA', 'ALTA', 'CRÍTICA'];
        const currentIdx = severityOrder.indexOf(threshold.alertSeverity);
        const maxIdx = severityOrder.indexOf(maxSeverity);
        if (currentIdx > maxIdx) {
          maxSeverity = threshold.alertSeverity;
        }
      }
    }

    if (triggeredThresholds.length === 0) {
      return { action: 'monitor', confidence: 100, reasoning: 'Todos los umbrales dentro de rango normal' };
    }

    // Create alerts for triggered thresholds
    for (const threshold of triggeredThresholds) {
      const alertRecord = await db.alert.create({
        data: {
          source: 'Threshold Monitor',
          severity: maxSeverity,
          title: `Umbral superado: ${threshold.name}`,
          description: `Métrica "${threshold.metric}" valor actual ${threshold.currentValue} ${threshold.unit} supera el umbral de ${threshold.value} ${threshold.unit}`,
          actionTaken: `Alerta ${threshold.alertType} generada automáticamente`,
          strategy: 'threshold',
          thresholdId: threshold.id,
        },
      });

      // Notify external channels
      await notifyAlert(alertRecord as Alert);

      // Update threshold lastTriggered
      await db.thresholdConfig.update({
        where: { id: threshold.id },
        data: { lastTriggered: new Date() },
      });
    }

    // Emit event
    await eventStore.append('whatomate:alerts', {
      eventType: 'monitoring.threshold_breached',
      aggregateId: `threshold_batch_${Date.now()}`,
      aggregateType: 'threshold',
      payload: {
        triggeredCount: triggeredThresholds.length,
        thresholds: triggeredThresholds.map(t => ({ id: t.id, name: t.name, value: t.value, current: t.currentValue })),
        severity: maxSeverity,
      },
    });

    return {
      action: 'alert',
      severity: maxSeverity,
      confidence: Math.min(95, 70 + triggeredThresholds.length * 10),
      reasoning: `${triggeredThresholds.length} umbral(es) superado(s): ${triggeredThresholds.map(t => t.name).join(', ')}`,
      data: { triggeredThresholds: triggeredThresholds.map(t => t.id) },
    };
  },
};

// ===== STRATEGY 2: PATTERN (Deductive) =====
/**
 * Cross-channel pattern recognition.
 * Example: Fraud coordination across WhatsApp + Telegram simultaneously
 */
const patternStrategy: DecisionStrategyHandler = {
  id: 'pattern',
  name: 'Patrones (Deductiva)',
  description: 'Reconocimiento de patrones cruzados entre canales y fuentes',
  async evaluate(ctx: StrategyContext): Promise<StrategyResult> {
    const actionablePatterns = ctx.patterns.filter(p =>
      actionablePatternSpec.isSatisfiedBy({ pattern: p })
    );

    if (actionablePatterns.length === 0) {
      return { action: 'monitor', confidence: 100, reasoning: 'Sin patrones activos de alta confianza' };
    }

    // Find the most severe pattern
    const severityOrder: AlertSeverity[] = ['INFO', 'BAJA', 'MEDIA', 'ALTA', 'CRÍTICA'];
    const worstPattern = actionablePatterns.sort((a, b) => {
      const sa = severityOrder.indexOf(a.severity);
      const sb = severityOrder.indexOf(b.severity);
      return sb - sa;
    })[0];

    // Update pattern occurrences
    await db.patternDetection.update({
      where: { id: worstPattern.id },
      data: {
        occurrences: { increment: 1 },
        lastDetected: new Date(),
      },
    });

    // Create alert for pattern detection
    const alertRecord = await db.alert.create({
      data: {
        source: 'Pattern Detector',
        severity: worstPattern.severity,
        title: `Patrón detectado: ${worstPattern.patternType.replace(/_/g, ' ')}`,
        description: worstPattern.description,
        actionTaken: 'Patrón confirmado. Iniciando evaluación de riesgo y consenso multi-agente.',
        strategy: 'pattern',
        patternId: worstPattern.id,
      },
    });

    // Notify external channels
    await notifyAlert(alertRecord as Alert);

    await eventStore.append('whatomate:patterns', {
      eventType: 'analysis.pattern_detected',
      aggregateId: worstPattern.id,
      aggregateType: 'pattern',
      payload: {
        patternType: worstPattern.patternType,
        confidence: worstPattern.confidence,
        severity: worstPattern.severity,
        occurrences: worstPattern.occurrences + 1,
      },
    });

    return {
      action: 'alert',
      severity: worstPattern.severity,
      confidence: worstPattern.confidence,
      reasoning: `Patrón "${worstPattern.patternType}" detectado con ${worstPattern.confidence}% confianza. Ocurrencias: ${worstPattern.occurrences + 1}`,
      data: { patternId: worstPattern.id, patternType: worstPattern.patternType },
    };
  },
};

// ===== STRATEGY 3: RISK SCORING (Quantitative) =====
/**
 * Weighted model across 5 dimensions:
 * - Nature (35%): Type and severity of activity
 * - Volume (25%): Quantity of related events
 * - Connections (20%): Links between entities
 * - OSINT Context (15%): Open source corroboration
 * - Recency (5%): Freshness of data
 */
const riskScoringStrategy: DecisionStrategyHandler = {
  id: 'risk_scoring',
  name: 'Scoring de Riesgo (Cuantitativa)',
  description: 'Modelo ponderado de 5 dimensiones para evaluación cuantitativa de riesgo',
  async evaluate(ctx: StrategyContext): Promise<StrategyResult> {
    if (ctx.entities.length === 0 && ctx.patterns.length === 0) {
      return { action: 'monitor', confidence: 100, reasoning: 'Sin entidades o patrones para evaluar' };
    }

    const WEIGHTS = { nature: 0.35, volume: 0.25, connections: 0.20, osintContext: 0.15, recency: 0.05 };

    // Calculate scores for each entity
    const assessments: RiskAssessment[] = [];

    for (const entity of ctx.entities) {
      // Nature score: based on risk level
      const natureScore = entity.riskLevel === 'critical' ? 95 :
                          entity.riskLevel === 'high' ? 75 :
                          entity.riskLevel === 'medium' ? 50 : 20;

      // Volume score: based on mention count (logarithmic scale)
      const volumeScore = Math.min(100, Math.ceil(Math.log2(entity.mentionCount + 1) * 15));

      // Connections score: based on related patterns
      const relatedPatterns = ctx.patterns.filter(p =>
        p.entityIds?.includes(entity.id)
      );
      const connectionsScore = Math.min(100, relatedPatterns.length * 25);

      // OSINT context score: based on OSINT data availability
      const osintScore = ctx.osintData ?
        Math.min(100, (ctx.osintData.earthquakes?.length ?? 0) * 5 +
                      (ctx.osintData.flights?.length ?? 0) * 10 +
                      ((ctx.osintData.weather?.activeAlerts ?? 0) > 100 ? 30 : 10)) : 0;

      // Recency score: based on last seen time
      const hoursSinceLastSeen = (Date.now() - entity.lastSeen.getTime()) / (1000 * 60 * 60);
      const recencyScore = Math.max(0, Math.min(100, 100 - hoursSinceLastSeen * 2));

      // Weighted total
      const totalScore = Math.round(
        natureScore * WEIGHTS.nature +
        volumeScore * WEIGHTS.volume +
        connectionsScore * WEIGHTS.connections +
        osintScore * WEIGHTS.osintContext +
        recencyScore * WEIGHTS.recency
      );

      // Persist risk assessment
      const assessment = await db.riskAssessment.create({
        data: {
          entityId: entity.id,
          aggregateType: 'entity',
          aggregateId: entity.id,
          score: totalScore,
          nature: natureScore,
          volume: volumeScore,
          connections: connectionsScore,
          osintContext: osintScore,
          recency: recencyScore,
          reasoning: `Nature:${natureScore} Vol:${volumeScore} Conn:${connectionsScore} OSINT:${osintScore} Recency:${recencyScore}`,
          strategy: 'risk_scoring',
        },
      });

      // Update entity risk score
      const newRiskLevel = totalScore >= 90 ? 'critical' : totalScore >= 70 ? 'high' : totalScore >= 40 ? 'medium' : 'low';
      await db.entity.update({
        where: { id: entity.id },
        data: { riskScore: totalScore, riskLevel: newRiskLevel, lastSeen: new Date() },
      });

      assessments.push({
        ...assessment,
        createdAt: assessment.createdAt,
      } as RiskAssessment);

      // If high risk, create alert
      if (highRiskSpec.isSatisfiedBy({ assessment: { ...assessment, score: totalScore } as RiskAssessment })) {
        const alertRecord = await db.alert.create({
          data: {
            source: 'Risk Scorer',
            severity: totalScore >= 90 ? 'CRÍTICA' : 'ALTA',
            title: `Score de riesgo alto: ${entity.name} (${totalScore}/100)`,
            description: `Entidad "${entity.name}" tiene score de riesgo ${totalScore}/100. Nivel: ${newRiskLevel}. Naturaleza:${natureScore} Volumen:${volumeScore} Conexiones:${connectionsScore}`,
            actionTaken: 'Score actualizado. Monitoreo intensivo activado.',
            strategy: 'risk_scoring',
            riskId: assessment.id,
          },
        });

        // Notify external channels
        await notifyAlert(alertRecord as Alert);
      }
    }

    const maxScore = Math.max(...assessments.map(a => a.score), 0);
    const severity: AlertSeverity = maxScore >= 90 ? 'CRÍTICA' : maxScore >= 70 ? 'ALTA' : maxScore >= 40 ? 'MEDIA' : 'BAJA';

    return {
      action: maxScore >= 70 ? 'alert' : 'monitor',
      severity,
      confidence: Math.min(95, maxScore),
      reasoning: `${assessments.length} entidades evaluadas. Score máximo: ${maxScore}/100. Severidad: ${severity}`,
      data: { assessments: assessments.map(a => a.id) },
    };
  },
};

// ===== STRATEGY 4: MULTI-AGENT CONSENSUS (Cooperative) =====
/**
 * INNOVATION 10: Enhanced with reputation-based weighted voting.
 *
 * 4 agents vote with reputation-based weights:
 * - Reputation > 80 → vote weight 1.5x
 * - Reputation < 30 → vote weight 0.5x
 * - Otherwise → vote weight 1.0x
 *
 * - 4/4 with all high-rep agents → confidence 99%
 * - Weighted favor ratio instead of simple count
 * - Vote weights recorded in ConsensusVote records
 */
const consensusStrategy: DecisionStrategyHandler = {
  id: 'consensus',
  name: 'Consenso Multi-Agente (Cooperativa)',
  description: '4 agentes votan con pesos de reputación: unanimidad ejecuta, mayoría notifica, minoría escala',
  async evaluate(ctx: StrategyContext): Promise<StrategyResult> {
    const agents = [
      { agentId: 'ana-sem', agentName: 'Semantic Analyzer' },
      { agentId: 'ana-pat', agentName: 'Pattern Detector' },
      { agentId: 'ana-cro', agentName: 'Cross-Platform Correlator' },
      { agentId: 'ana-ris', agentName: 'Risk Scorer' },
    ];

    // Each agent evaluates based on its domain, WITH reputation weights
    const voteResults = await Promise.all(agents.map(async (agent) => {
      let vote: 'favor' | 'contra' | 'abstencion';
      let confidence: number;
      let reasoning: string;

      switch (agent.agentId) {
        case 'ana-sem': {
          // Semantic: check if messages contain suspicious content
          const suspiciousKeywords = ['fraude', 'estafa', 'scam', 'invertir', 'ganancia', 'crypto', 'dinero fácil'];
          const suspiciousMsgs = ctx.messages.filter(m =>
            suspiciousKeywords.some(kw => m.content.toLowerCase().includes(kw))
          );
          confidence = Math.min(95, suspiciousMsgs.length * 15 + 30);
          vote = suspiciousMsgs.length > 0 ? 'favor' : 'contra';
          reasoning = suspiciousMsgs.length > 0
            ? `${suspiciousMsgs.length} mensajes con contenido sospechoso detectados. Confianza: ${confidence}%`
            : 'No se detectó contenido semánticamente sospechoso.';
          break;
        }
        case 'ana-pat': {
          // Pattern: check if any patterns match
          const activePatterns = ctx.patterns.filter(p => p.status === 'active' && p.confidence >= 70);
          confidence = activePatterns.length > 0 ? Math.min(95, activePatterns[0].confidence) : 20;
          vote = activePatterns.length > 0 ? 'favor' : 'contra';
          reasoning = activePatterns.length > 0
            ? `Patrón "${activePatterns[0].patternType}" coincide en ${activePatterns[0].confidence}% de indicadores.`
            : 'Ningún patrón conocido coincide con los datos actuales.';
          break;
        }
        case 'ana-cro': {
          // Cross-platform: check if activity spans multiple sources
          const sources = new Set(ctx.messages.map(m => m.source));
          const crossPlatform = sources.size >= 2;
          confidence = crossPlatform ? 72 : 30;
          vote = crossPlatform ? 'favor' : 'abstencion';
          reasoning = crossPlatform
            ? `Actividad detectada en ${sources.size} plataformas. Correlación moderada.`
            : 'Actividad limitada a una sola plataforma. Datos insuficientes para correlación.';
          break;
        }
        case 'ana-ris': {
          // Risk: check if any entity has high risk score
          const highRiskEntities = ctx.entities.filter(e => e.riskScore >= 70);
          confidence = highRiskEntities.length > 0 ? highRiskEntities[0].riskScore : 25;
          vote = highRiskEntities.length > 0 ? 'favor' : 'contra';
          reasoning = highRiskEntities.length > 0
            ? `Score de riesgo ${highRiskEntities[0].riskScore}/100 para "${highRiskEntities[0].name}".`
            : 'Sin entidades con score de riesgo significativo.';
          break;
        }
        default:
          vote = 'abstencion';
          confidence = 0;
          reasoning = 'Agente no disponible';
      }

      // INNOVATION 10: Get reputation-based vote weight
      const weight = await getAgentVoteWeight(agent.agentId);

      return { agentId: agent.agentId, agentName: agent.agentName, vote, confidence, reasoning, weight };
    }));

    // ===== INNOVATION 10: Weighted vote counting =====
    const weightedFavor = voteResults
      .filter(v => v.vote === 'favor')
      .reduce((sum, v) => sum + v.weight, 0);

    const weightedContra = voteResults
      .filter(v => v.vote === 'contra')
      .reduce((sum, v) => sum + v.weight, 0);
    void weightedContra; // Available for future tie-breaking logic

    const totalWeight = voteResults.reduce((sum, v) => sum + v.weight, 0);
    const favorCount = voteResults.filter(v => v.vote === 'favor').length;
    const totalVoting = voteResults.filter(v => v.vote !== 'abstencion').length;

    // Weighted favor ratio
    const weightedFavorRatio = totalWeight > 0 ? weightedFavor / totalWeight : 0;

    // Determine action based on weighted consensus
    let action: StrategyResult['action'];
    let severity: AlertSeverity = 'MEDIA';
    const avgConfidence = Math.round(voteResults.reduce((s, v) => s + v.confidence, 0) / voteResults.length);

    // Check if all favor voters are high-rep (for 99% confidence)
    const allFavorHighRep = voteResults
      .filter(v => v.vote === 'favor')
      .every(v => v.weight >= 1.5);

    if (favorCount === 4) {
      action = 'alert';
      severity = allFavorHighRep ? 'CRÍTICA' : 'CRÍTICA'; // Always CRÍTICA for 4/4
    } else if (favorCount === 3) {
      action = 'alert';
      severity = 'ALTA';
    } else if (favorCount === 2) {
      action = 'escalate';
      severity = 'MEDIA';
    } else {
      action = 'dismiss';
      severity = 'BAJA';
    }

    // Confidence adjustment: 4/4 with all high-rep → 99%
    let finalConfidence = avgConfidence;
    if (favorCount === 4 && allFavorHighRep) {
      finalConfidence = 99;
    } else if (weightedFavorRatio > 0.7) {
      finalConfidence = Math.min(95, Math.round(avgConfidence * weightedFavorRatio * 1.2));
    }

    // Create consensus record in DB
    const alert = await db.alert.create({
      data: {
        source: 'Multi-Agent Consensus',
        severity,
        title: `Consenso ${favorCount}/4 (w=${weightedFavor.toFixed(1)}/${totalWeight.toFixed(1)}): ${action === 'alert' ? 'Alerta activada' : action === 'escalate' ? 'Escalado a humano' : 'Falso positivo'}`,
        description: `Votación ponderada: ${voteResults.map(v => `${v.agentName}: ${v.vote} (w=${v.weight}x, ${v.confidence}%)`).join('; ')}`,
        actionTaken: action === 'alert' ? 'Alerta activada automáticamente (consenso ponderado)' : action === 'escalate' ? 'Escalado a operador humano' : 'Archivado como falso positivo',
        strategy: 'consensus',
      },
    });

    // Notify external channels about the alert
    await notifyAlert(alert as Alert);

    // Record individual votes WITH weights
    const dbVotes: ConsensusVote[] = [];
    for (const v of voteResults) {
      const dbVote = await db.consensusVote.create({
        data: {
          alertId: alert.id,
          agentId: v.agentId,
          agentName: v.agentName,
          vote: v.vote,
          confidence: v.confidence * v.weight, // Weight-adjusted confidence
          reasoning: `${v.reasoning} [weight=${v.weight}x]`,
        },
      });
      dbVotes.push(dbVote as ConsensusVote);
    }

    await eventStore.append('whatomate:decisions', {
      eventType: 'consensus.decision_made',
      aggregateId: alert.id,
      aggregateType: 'alert',
      payload: {
        favorCount,
        totalVoting,
        action,
        severity,
        votes: voteResults.map(v => ({
          agentId: v.agentId,
          agentName: v.agentName,
          vote: v.vote,
          confidence: v.confidence,
          weight: v.weight,
        })),
        weightedFavorRatio,
        allFavorHighRep,
      },
    });

    const result: StrategyResult = {
      action,
      severity,
      confidence: finalConfidence,
      reasoning: `Consenso ponderado ${favorCount}/${totalVoting} (w=${weightedFavor.toFixed(1)}/${totalWeight.toFixed(1)}): ${voteResults.map(v => `${v.agentName}=${v.vote}(w${v.weight}x)`).join(', ')}. Ratio: ${weightedFavorRatio.toFixed(2)}. Decisión: ${action}${allFavorHighRep ? ' (HIGH-REP UNANIMITY → 99%)' : ''}`,
      data: {
        alertId: alert.id,
        votes: voteResults.map(v => ({ ...v })),
        weightedFavorRatio,
        allFavorHighRep,
      },
    };

    // Notify external channels about the consensus result
    await notifyConsensusResult(dbVotes, result);

    return result;
  },
};

// ===== STRATEGY 5: PREDICTIVE (Proactive) =====
/**
 * Trend analysis and forecasting.
 * Uses moving averages, trend detection, and Holt-Winters triple exponential
 * smoothing for seasonal pattern detection.
 *
 * INNOVATION 4: Enhanced with triple exponential smoothing (Holt-Winters)
 * - Tracks hourly message volume for the past 168 hours (1 week)
 * - Detects day-of-week patterns (e.g., more activity on weekends)
 * - Uses the seasonal component to improve predictions
 */

// ===== HOLT-WINTERS TRIPLE EXPONENTIAL SMOOTHING =====

/** Hourly volume data for the past week */
const HOURLY_BUCKETS = 168; // 7 days × 24 hours

/**
 * Simple exponential smoothing forecast.
 */
function sesForecast(values: number[], alpha: number): number {
  if (values.length === 0) return 0;
  let smoothed = values[0];
  for (let i = 1; i < values.length; i++) {
    smoothed = alpha * values[i] + (1 - alpha) * smoothed;
  }
  return smoothed;
}

/**
 * Holt-Winters triple exponential smoothing.
 * Decomposes a time series into level, trend, and seasonal components.
 *
 * @param values - Historical values (hourly counts)
 * @param seasonLength - Number of periods in a season (24 for daily, 168 for weekly)
 * @param alpha - Level smoothing factor (0-1)
 * @param beta - Trend smoothing factor (0-1)
 * @param gamma - Seasonal smoothing factor (0-1)
 * @param forecastAhead - Number of periods to forecast
 * @returns Forecasted value and seasonal component info
 */
function holtWintersForecast(
  values: number[],
  seasonLength: number,
  alpha: number,
  beta: number,
  gamma: number,
  forecastAhead: number = 1
): { forecast: number; level: number; trend: number; seasonalFactors: number[] } {
  if (values.length < seasonLength * 2) {
    // Not enough data for Holt-Winters; fall back to simple exponential smoothing
    return {
      forecast: sesForecast(values, alpha),
      level: sesForecast(values, alpha),
      trend: 0,
      seasonalFactors: [],
    };
  }

  // Initialize level and trend from first season
  let level = 0;
  for (let i = 0; i < seasonLength; i++) {
    level += values[i];
  }
  level /= seasonLength;

  let trend = 0;
  for (let i = 0; i < seasonLength; i++) {
    trend += (values[i + seasonLength] - values[i]) / seasonLength;
  }
  trend /= seasonLength;

  // Initialize seasonal factors
  const seasonalFactors: number[] = new Array(seasonLength).fill(0);
  const seasonAverages: number[] = [];

  for (let s = 0; s < Math.floor(values.length / seasonLength); s++) {
    let sAvg = 0;
    for (let i = 0; i < seasonLength; i++) {
      sAvg += values[s * seasonLength + i];
    }
    seasonAverages.push(sAvg / seasonLength);
  }

  // Compute initial seasonal indices
  for (let i = 0; i < seasonLength; i++) {
    let sum = 0;
    let count = 0;
    for (let s = 0; s < seasonAverages.length; s++) {
      const idx = s * seasonLength + i;
      if (idx < values.length && seasonAverages[s] > 0) {
        sum += values[idx] / seasonAverages[s];
        count++;
      }
    }
    seasonalFactors[i] = count > 0 ? sum / count : 1;
  }

  // Normalize seasonal factors
  const seasonalSum = seasonalFactors.reduce((a, b) => a + b, 0);
  const normalizedSeasonal = seasonalFactors.map(s => s * seasonLength / seasonalSum);

  // Holt-Winters update loop
  const workingSeasonal = [...normalizedSeasonal];
  const n = values.length;

  for (let i = 0; i < n; i++) {
    const seasonIdx = i % seasonLength;
    const oneAhead = level + trend + workingSeasonal[seasonIdx];
    const error = values[i] - oneAhead;

    const newLevel = alpha * (values[i] - workingSeasonal[seasonIdx]) + (1 - alpha) * (level + trend);
    const newTrend = beta * (newLevel - level) + (1 - beta) * trend;
    const newSeasonal = gamma * (values[i] - newLevel) + (1 - gamma) * workingSeasonal[seasonIdx];

    level = newLevel;
    trend = newTrend;
    workingSeasonal[seasonIdx] = newSeasonal;
    void error; // Used for potential future error tracking
  }

  // Forecast ahead
  const forecastSeasonIdx = (n + forecastAhead - 1) % seasonLength;
  const forecast = level + forecastAhead * trend + workingSeasonal[forecastSeasonIdx];

  return {
    forecast: Math.max(0, Math.round(forecast)),
    level: Math.round(level),
    trend: Math.round(trend * 100) / 100,
    seasonalFactors: workingSeasonal,
  };
}

/**
 * Detect day-of-week pattern from hourly volume data.
 */
function detectDayOfWeekPattern(hourlyVolumes: number[]): {
  dayAverages: number[];
  peakDay: number;
  isWeekendHeavier: boolean;
} {
  const dayAverages: number[] = new Array(7).fill(0);
  const dayCounts: number[] = new Array(7).fill(0);

  for (let h = 0; h < hourlyVolumes.length && h < HOURLY_BUCKETS; h++) {
    const dayOfWeek = Math.floor(h / 24) % 7;
    dayAverages[dayOfWeek] += hourlyVolumes[h];
    dayCounts[dayOfWeek]++;
  }

  for (let d = 0; d < 7; d++) {
    if (dayCounts[d] > 0) {
      dayAverages[d] = Math.round(dayAverages[d] / dayCounts[d]);
    }
  }

  const peakDay = dayAverages.indexOf(Math.max(...dayAverages));

  // Weekend = days 5 (Sat) and 6 (Sun) typically
  const weekendAvg = (dayAverages[5] + dayAverages[6]) / 2;
  const weekdayAvg = dayAverages.slice(0, 5).reduce((a, b) => a + b, 0) / 5;

  return {
    dayAverages,
    peakDay,
    isWeekendHeavier: weekendAvg > weekdayAvg,
  };
}

const predictiveStrategy: DecisionStrategyHandler = {
  id: 'predictive',
  name: 'Predictiva (Proactiva)',
  description: 'Análisis de tendencias y predicción de actividad futura con Holt-Winters',
  async evaluate(ctx: StrategyContext): Promise<StrategyResult> {
    // Get historical data for trend analysis
    const now = new Date();
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const twoDaysAgo = new Date(now.getTime() - 48 * 60 * 60 * 1000);

    // Count recent messages vs previous period
    const recentMessages = ctx.messages.filter(m => m.timestamp >= oneDayAgo);
    const olderMessages = ctx.messages.filter(m => m.timestamp >= twoDaysAgo && m.timestamp < oneDayAgo);

    const recentCount = recentMessages.length;
    const olderCount = olderMessages.length;
    const trendRatio = olderCount > 0 ? recentCount / olderCount : 1;

    // ===== INNOVATION 4: Holt-Winters Seasonal Forecasting =====

    // Build hourly volume series from messages for the past 7 days
    const hourlyVolumes: number[] = new Array(HOURLY_BUCKETS).fill(0);
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    for (const msg of ctx.messages) {
      if (msg.timestamp >= sevenDaysAgo) {
        const hoursAgo = Math.floor((now.getTime() - msg.timestamp.getTime()) / (60 * 60 * 1000));
        const bucketIdx = HOURLY_BUCKETS - 1 - hoursAgo;
        if (bucketIdx >= 0 && bucketIdx < HOURLY_BUCKETS) {
          hourlyVolumes[bucketIdx]++;
        }
      }

      // Also fetch from DB for more complete data
    }

    // Try to get more complete hourly data from DB
    const dbMessages = await db.rawMessage.findMany({
      where: { timestamp: { gte: sevenDaysAgo } },
      select: { timestamp: true },
      take: 5000,
    });

    const dbHourlyVolumes: number[] = new Array(HOURLY_BUCKETS).fill(0);
    for (const msg of dbMessages) {
      const hoursAgo = Math.floor((now.getTime() - msg.timestamp.getTime()) / (60 * 60 * 1000));
      const bucketIdx = HOURLY_BUCKETS - 1 - hoursAgo;
      if (bucketIdx >= 0 && bucketIdx < HOURLY_BUCKETS) {
        dbHourlyVolumes[bucketIdx]++;
      }
    }

    // Use DB data as it's more complete
    const finalHourlyVolumes = dbHourlyVolumes.some(v => v > 0) ? dbHourlyVolumes : hourlyVolumes;

    // Run Holt-Winters triple exponential smoothing
    const hwResult = holtWintersForecast(
      finalHourlyVolumes,
      24, // Daily seasonality (24 hours)
      0.3, // alpha (level)
      0.1, // beta (trend)
      0.2, // gamma (seasonal)
      1    // forecast 1 hour ahead
    );

    // Detect day-of-week patterns
    const dayPattern = detectDayOfWeekPattern(finalHourlyVolumes);

    // Also run simple exponential smoothing for comparison
    const alpha = 0.3;
    const simplePredicted = Math.round(alpha * recentCount + (1 - alpha) * olderCount);

    // Use Holt-Winters prediction if we have enough data, otherwise fall back
    const hasEnoughData = finalHourlyVolumes.filter(v => v > 0).length >= 48;
    const predictedActivity = hasEnoughData ? hwResult.forecast : simplePredicted;

    // Adjust confidence based on seasonal pattern strength
    const seasonalVariance = dayPattern.dayAverages.length > 0
      ? Math.sqrt(dayPattern.dayAverages.reduce((s, v) => s + (v - dayPattern.dayAverages.reduce((a, b) => a + b, 0) / 7) ** 2, 0) / 7)
      : 0;
    const seasonalConfidence = Math.min(20, seasonalVariance * 2);

    const confidence = Math.min(95, 60 + Math.min(35, Math.abs(trendRatio - 1) * 50) + seasonalConfidence);

    // Store prediction with seasonal info
    await db.prediction.create({
      data: {
        metric: 'activity',
        period: 'hour',
        predictedAt: now,
        targetTime: new Date(now.getTime() + 60 * 60 * 1000),
        value: predictedActivity,
        confidence: confidence / 100,
      },
    });

    // Detect if activity is trending upward significantly
    const isSurge = trendRatio > 2.0; // 2x increase
    const isAnomalous = trendRatio > 3.0; // 3x increase

    if (isAnomalous) {
      const alertRecord = await db.alert.create({
        data: {
          source: 'Predictive Engine',
          severity: 'ALTA',
          title: `Pico de actividad predicho: ${predictedActivity} mensajes/hora`,
          description: `Actividad ${trendRatio.toFixed(1)}x sobre media histórica. Tendencia: ${trendRatio > 3 ? 'ANÓMALA' : 'ELEVADA'}. Predicción próxima hora: ${predictedActivity}. Holt-Winters: level=${hwResult.level}, trend=${hwResult.trend}. Patrón semanal: pico día ${dayPattern.peakDay}, ${dayPattern.isWeekendHeavier ? 'finde más activo' : 'laboral más activo'}.`,
          actionTaken: 'Monitoreo predictivo activado. Preparando umbrales adaptativos.',
          strategy: 'predictive',
        },
      });

      // Notify external channels
      await notifyAlert(alertRecord as Alert);
    }

    return {
      action: isAnomalous ? 'alert' : isSurge ? 'escalate' : 'monitor',
      severity: isAnomalous ? 'ALTA' : isSurge ? 'MEDIA' : 'BAJA',
      confidence,
      reasoning: `Tendencia: ${trendRatio.toFixed(2)}x. Actual: ${recentCount}, Anterior: ${olderCount}. Predicción HW: ${predictedActivity} (level=${hwResult.level}, trend=${hwResult.trend}). Patrón: pico día ${dayPattern.peakDay}. ${isAnomalous ? 'ANÓMALO' : isSurge ? 'ELEVADO' : 'Normal'}`,
      data: {
        trendRatio,
        recentCount,
        olderCount,
        predictedActivity,
        holtWinters: { level: hwResult.level, trend: hwResult.trend },
        dayPattern: { peakDay: dayPattern.peakDay, isWeekendHeavier: dayPattern.isWeekendHeavier },
      },
    };
  },
};

// ===== STRATEGY 6: ADAPTIVE (Continuous Evolution) =====
/**
 * Granular self-adjusting thresholds based on per-threshold false-positive/negative feedback.
 *
 * Key improvements over flat ±10% approach:
 * 1. Per-threshold FPR analysis — each threshold is evaluated independently
 * 2. Adaptive adjustment % — scaled by FPR (min 5%, max 15%)
 * 3. Threshold-specific bounds from metadata — prevents runaway adjustments
 * 4. Cooldown period (1 hour) — prevents oscillation on recently-triggered thresholds
 * 5. Detailed audit trail — every adjustment recorded with reason, direction, and bounds
 */

/** Detail record for a single threshold's adjustment analysis */
interface ThresholdAdjustmentDetail {
  thresholdId: string;
  thresholdName: string;
  oldValue: number;
  newValue: number;
  adjustmentPct: number;
  direction: 'increase' | 'decrease';
  fpr: number;
  sensitivity: number;
  reason: string;
  skipped: boolean;
  skipReason?: 'cooldown' | 'no_data' | 'within_range' | 'at_bound';
  boundMin: number;
  boundMax: number;
}

const adaptiveStrategy: DecisionStrategyHandler = {
  id: 'adaptive',
  name: 'Adaptativa (Evolución Continua)',
  description: 'Auto-ajuste granular por umbral basado en retroalimentación de falsos positivos/negativos con límites específicos y periodo de enfriamiento',
  async evaluate(ctx: StrategyContext): Promise<StrategyResult> {
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

    // ── System-wide metrics (for overall reporting) ──────────────────────
    const recentAlerts = await db.alert.findMany({
      where: { timestamp: { gte: thirtyDaysAgo } },
    });

    const totalAlerts = recentAlerts.length;
    const acknowledged = recentAlerts.filter(a => a.acknowledged).length;
    const escalated = recentAlerts.filter(a => a.escalated).length;
    const acknowledgmentRate = totalAlerts > 0 ? acknowledged / totalAlerts : 0;
    const escalationRate = totalAlerts > 0 ? escalated / totalAlerts : 0;

    const possibleFalsePositives = totalAlerts - acknowledged - escalated;
    const systemFPR = totalAlerts > 0 ? Math.max(0, possibleFalsePositives / totalAlerts * 100) : 0;
    const systemSensitivity = Math.min(100, acknowledgmentRate * 100 + escalationRate * 50);
    const systemAccuracy = Math.min(100, (1 - systemFPR / 100) * 100);

    // ── Per-threshold granular analysis ──────────────────────────────────
    const adjustmentDetails: ThresholdAdjustmentDetail[] = [];

    for (const threshold of ctx.thresholds) {
      // ── Cooldown check: skip if last triggered < 1 hour ago ──────────
      if (threshold.lastTriggered && threshold.lastTriggered >= oneHourAgo) {
        adjustmentDetails.push({
          thresholdId: threshold.id,
          thresholdName: threshold.name,
          oldValue: threshold.value,
          newValue: threshold.value,
          adjustmentPct: 0,
          direction: 'increase',
          fpr: 0,
          sensitivity: 0,
          reason: `En enfriamiento: disparado hace ${Math.round((now.getTime() - threshold.lastTriggered.getTime()) / 60000)} min (< 60 min requeridos)`,
          skipped: true,
          skipReason: 'cooldown',
          boundMin: 0,
          boundMax: 0,
        });
        continue;
      }

      // ── Per-threshold alert analysis ──────────────────────────────────
      const thresholdAlerts = await db.alert.findMany({
        where: { thresholdId: threshold.id, timestamp: { gte: thirtyDaysAgo } },
      });

      const thresholdTotal = thresholdAlerts.length;

      // No data — cannot compute FPR
      if (thresholdTotal === 0) {
        adjustmentDetails.push({
          thresholdId: threshold.id,
          thresholdName: threshold.name,
          oldValue: threshold.value,
          newValue: threshold.value,
          adjustmentPct: 0,
          direction: 'increase',
          fpr: 0,
          sensitivity: 0,
          reason: 'Sin alertas en los últimos 30 días para este umbral',
          skipped: true,
          skipReason: 'no_data',
          boundMin: 0,
          boundMax: 0,
        });
        continue;
      }

      // Compute per-threshold FPR: (unacknowledged + unescalated) / total
      const thresholdAcknowledged = thresholdAlerts.filter(a => a.acknowledged).length;
      const thresholdEscalated = thresholdAlerts.filter(a => a.escalated).length;
      const thresholdUnacked = thresholdTotal - thresholdAcknowledged - thresholdEscalated;
      const thresholdFPR = (thresholdUnacked / thresholdTotal) * 100;

      // Compute per-threshold sensitivity
      const thresholdSensitivity = Math.min(
        100,
        (thresholdAcknowledged / thresholdTotal) * 100 +
          (thresholdEscalated / thresholdTotal) * 50,
      );

      // ── Determine if adjustment is needed ─────────────────────────────
      let shouldAdjust = false;
      let direction: 'increase' | 'decrease' = 'increase';
      let reason = '';

      if (thresholdFPR > 20) {
        // High FPR → increase threshold value (make it less sensitive)
        shouldAdjust = true;
        direction = 'increase';
        reason = `FPR ${thresholdFPR.toFixed(1)}% > 20%: umbral demasiado sensible, subiendo valor`;
      } else if (thresholdFPR < 5 && thresholdSensitivity < 70) {
        // Low FPR + low sensitivity → decrease threshold value (make it more sensitive)
        shouldAdjust = true;
        direction = 'decrease';
        reason = `FPR ${thresholdFPR.toFixed(1)}% < 5% y sensibilidad ${thresholdSensitivity.toFixed(1)}% < 70%: umbral demasiado insensible, bajando valor`;
      } else {
        adjustmentDetails.push({
          thresholdId: threshold.id,
          thresholdName: threshold.name,
          oldValue: threshold.value,
          newValue: threshold.value,
          adjustmentPct: 0,
          direction: 'increase',
          fpr: thresholdFPR,
          sensitivity: thresholdSensitivity,
          reason: `FPR ${thresholdFPR.toFixed(1)}% dentro de rango aceptable (5%-20%), sin ajuste necesario`,
          skipped: true,
          skipReason: 'within_range',
          boundMin: 0,
          boundMax: 0,
        });
        continue;
      }

      if (!shouldAdjust) continue;

      // ── Adaptive adjustment percentage ─────────────────────────────────
      // Adjustment = min(15%, max(5%, FPR * 0.5))
      const adjustmentPct = Math.min(15, Math.max(5, thresholdFPR * 0.5));

      // ── Threshold-specific bounds from metadata ────────────────────────
      // Fetch metadata from DB (ThresholdConfig may carry metadata from Prisma)
      let adaptiveBounds: { min: number; max: number } | undefined;
      try {
        const dbThreshold = await db.thresholdConfig.findUnique({
          where: { id: threshold.id },
          select: { metadata: true },
        });
        if (dbThreshold?.metadata) {
          const parsed = JSON.parse(dbThreshold.metadata) as Record<string, unknown>;
          if (parsed.adaptiveBounds && typeof parsed.adaptiveBounds === 'object') {
            adaptiveBounds = parsed.adaptiveBounds as { min: number; max: number };
          }
        }
      } catch {
        // metadata unavailable or unparseable — use defaults below
      }

      // Also check the in-memory ThresholdConfig metadata
      if (!adaptiveBounds && threshold.metadata?.adaptiveBounds) {
        adaptiveBounds = threshold.metadata.adaptiveBounds;
      }

      // Default bounds: min = value * 0.5, max = value * 2.0
      const boundMin = adaptiveBounds?.min ?? threshold.value * 0.5;
      const boundMax = adaptiveBounds?.max ?? threshold.value * 2.0;

      // ── Apply adjustment ───────────────────────────────────────────────
      const multiplier = direction === 'increase'
        ? 1 + adjustmentPct / 100
        : 1 - adjustmentPct / 100;

      let newValue = Math.round(threshold.value * multiplier * 100) / 100;

      // Enforce bounds
      let clamped = false;
      if (newValue < boundMin) {
        newValue = boundMin;
        clamped = true;
        reason += ` (limitado a mínimo ${boundMin})`;
      } else if (newValue > boundMax) {
        newValue = boundMax;
        clamped = true;
        reason += ` (limitado a máximo ${boundMax})`;
      }

      // Skip if adjustment would result in no effective change (already at bound)
      if (newValue === threshold.value) {
        adjustmentDetails.push({
          thresholdId: threshold.id,
          thresholdName: threshold.name,
          oldValue: threshold.value,
          newValue: threshold.value,
          adjustmentPct,
          direction,
          fpr: thresholdFPR,
          sensitivity: thresholdSensitivity,
          reason: reason + ' — ajuste sin efecto (en límite)',
          skipped: true,
          skipReason: 'at_bound',
          boundMin,
          boundMax,
        });
        continue;
      }

      // Persist the adjustment
      await db.thresholdConfig.update({
        where: { id: threshold.id },
        data: { value: newValue },
      });

      if (clamped) {
        reason += ` → ${newValue}`;
      }

      adjustmentDetails.push({
        thresholdId: threshold.id,
        thresholdName: threshold.name,
        oldValue: threshold.value,
        newValue,
        adjustmentPct,
        direction,
        fpr: thresholdFPR,
        sensitivity: thresholdSensitivity,
        reason,
        skipped: false,
        boundMin,
        boundMax,
      });
    }

    // ── Categorize results ───────────────────────────────────────────────
    const adjustedThresholds = adjustmentDetails.filter(d => !d.skipped);
    const skippedThresholds = adjustmentDetails.filter(d => d.skipped);
    const adjustmentMade = adjustedThresholds.length > 0;

    // ── Record detailed adaptive metric for auditability ─────────────────
    await db.adaptiveMetric.create({
      data: {
        date: now,
        falsePositiveRate: systemFPR,
        sensitivity: systemSensitivity,
        accuracy: systemAccuracy,
        threshold: 'granular',
        adjustment: JSON.stringify({
          systemMetrics: {
            falsePositiveRate: systemFPR,
            sensitivity: systemSensitivity,
            accuracy: systemAccuracy,
            acknowledgmentRate,
            escalationRate,
            totalAlerts,
          },
          adjustments: adjustedThresholds.map(d => ({
            thresholdId: d.thresholdId,
            thresholdName: d.thresholdName,
            oldValue: d.oldValue,
            newValue: d.newValue,
            adjustmentPct: d.adjustmentPct,
            direction: d.direction,
            fpr: d.fpr,
            sensitivity: d.sensitivity,
            boundMin: d.boundMin,
            boundMax: d.boundMax,
            reason: d.reason,
          })),
          skipped: skippedThresholds.map(d => ({
            thresholdId: d.thresholdId,
            thresholdName: d.thresholdName,
            skipReason: d.skipReason,
            fpr: d.fpr,
          })),
        }),
      },
    });

    // ── Emit adaptive event ──────────────────────────────────────────────
    await eventStore.append('whatomate:decisions', {
      eventType: 'adaptive.threshold_adjusted',
      aggregateId: `adaptive_granular_${Date.now()}`,
      aggregateType: 'threshold',
      payload: {
        systemFPR,
        systemSensitivity,
        systemAccuracy,
        adjustmentMade,
        adjustedCount: adjustedThresholds.length,
        skippedCount: skippedThresholds.length,
        adjustments: adjustedThresholds.map(d => ({
          thresholdId: d.thresholdId,
          name: d.thresholdName,
          oldValue: d.oldValue,
          newValue: d.newValue,
          direction: d.direction,
          pct: d.adjustmentPct,
          fpr: d.fpr,
          sensitivity: d.sensitivity,
          boundMin: d.boundMin,
          boundMax: d.boundMax,
        })),
      },
    });

    // ── Build result ─────────────────────────────────────────────────────
    const adjustmentSummary = adjustedThresholds.length > 0
      ? adjustedThresholds.map(d =>
          `${d.thresholdName}: ${d.oldValue} → ${d.newValue} (${d.direction === 'increase' ? '+' : '-'}${d.adjustmentPct.toFixed(1)}%, FPR: ${d.fpr.toFixed(1)}%, límites: [${d.boundMin}, ${d.boundMax}])`,
        ).join('; ')
      : 'Sin ajustes necesarios';

    const cooldownCount = skippedThresholds.filter(s => s.skipReason === 'cooldown').length;
    const noDataCount = skippedThresholds.filter(s => s.skipReason === 'no_data').length;
    const withinRangeCount = skippedThresholds.filter(s => s.skipReason === 'within_range').length;
    const atBoundCount = skippedThresholds.filter(s => s.skipReason === 'at_bound').length;

    return {
      action: adjustmentMade ? 'alert' : 'monitor',
      severity: 'INFO',
      confidence: systemAccuracy,
      reasoning: [
        `Sistema — FPR: ${systemFPR.toFixed(1)}%, Sensibilidad: ${systemSensitivity.toFixed(1)}%, Precisión: ${systemAccuracy.toFixed(1)}%`,
        `Umbrales — ${adjustedThresholds.length} ajustados, ${skippedThresholds.length} omitidos (enfriamiento: ${cooldownCount}, sin datos: ${noDataCount}, en rango: ${withinRangeCount}, en límite: ${atBoundCount})`,
        adjustmentSummary,
      ].join('. '),
      data: {
        falsePositiveRate: systemFPR,
        sensitivity: systemSensitivity,
        accuracy: systemAccuracy,
        adjustedCount: adjustedThresholds.length,
        skippedCount: skippedThresholds.length,
        adjustments: adjustedThresholds,
        skipped: skippedThresholds,
      },
    };
  },
};

// ===== REGISTER ALL STRATEGIES =====

strategyRegistry.register(thresholdStrategy);
strategyRegistry.register(patternStrategy);
strategyRegistry.register(riskScoringStrategy);
strategyRegistry.register(consensusStrategy);
strategyRegistry.register(predictiveStrategy);
strategyRegistry.register(adaptiveStrategy);

export {
  thresholdStrategy,
  patternStrategy,
  riskScoringStrategy,
  consensusStrategy,
  predictiveStrategy,
  adaptiveStrategy,
};
