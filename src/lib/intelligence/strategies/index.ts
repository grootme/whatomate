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
import { shouldAlertSpec, highRiskSpec, actionablePatternSpec } from '../specs';
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
      await db.alert.create({
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
    await db.alert.create({
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
        await db.alert.create({
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
 * 4 agents vote:
 * - 4/4 → auto-execute (99%+ confidence)
 * - 3/4 → auto with notification
 * - 2/4 → escalate to human
 * - 1/4 or 0/4 → archive as false positive
 */
const consensusStrategy: DecisionStrategyHandler = {
  id: 'consensus',
  name: 'Consenso Multi-Agente (Cooperativa)',
  description: '4 agentes votan: unanimidad ejecuta, mayoría notifica, minoría escala',
  async evaluate(ctx: StrategyContext): Promise<StrategyResult> {
    const agents = [
      { agentId: 'ana-sem', agentName: 'Semantic Analyzer' },
      { agentId: 'ana-pat', agentName: 'Pattern Detector' },
      { agentId: 'ana-cro', agentName: 'Cross-Platform Correlator' },
      { agentId: 'ana-ris', agentName: 'Risk Scorer' },
    ];

    // Each agent evaluates based on its domain
    const votes = await Promise.all(agents.map(async (agent) => {
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

      return { agentId: agent.agentId, agentName: agent.agentName, vote, confidence, reasoning };
    }));

    // Count votes
    const favorCount = votes.filter(v => v.vote === 'favor').length;
    const totalVoting = votes.filter(v => v.vote !== 'abstencion').length;

    // Determine action based on consensus rules
    let action: StrategyResult['action'];
    let severity: AlertSeverity = 'MEDIA';
    const avgConfidence = Math.round(votes.reduce((s, v) => s + v.confidence, 0) / votes.length);

    if (favorCount === 4) {
      action = 'alert';
      severity = 'CRÍTICA';
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

    // Create consensus record in DB
    // First create an alert for this consensus
    const alert = await db.alert.create({
      data: {
        source: 'Multi-Agent Consensus',
        severity,
        title: `Consenso ${favorCount}/4: ${action === 'alert' ? 'Alerta activada' : action === 'escalate' ? 'Escalado a humano' : 'Falso positivo'}`,
        description: `Votación: ${votes.map(v => `${v.agentName}: ${v.vote} (${v.confidence}%)`).join('; ')}`,
        actionTaken: action === 'alert' ? 'Alerta activada automáticamente' : action === 'escalate' ? 'Escalado a operador humano' : 'Archivado como falso positivo',
        strategy: 'consensus',
      },
    });

    // Record individual votes
    for (const v of votes) {
      await db.consensusVote.create({
        data: {
          alertId: alert.id,
          agentId: v.agentId,
          agentName: v.agentName,
          vote: v.vote,
          confidence: v.confidence,
          reasoning: v.reasoning,
        },
      });
    }

    await eventStore.append('whatomate:decisions', {
      eventType: 'consensus.decision_made',
      aggregateId: alert.id,
      aggregateType: 'alert',
      payload: { favorCount, totalVoting, action, severity, votes },
    });

    return {
      action,
      severity,
      confidence: avgConfidence,
      reasoning: `Consenso ${favorCount}/${totalVoting}: ${votes.map(v => `${v.agentName}=${v.vote}`).join(', ')}. Decisión: ${action}`,
      data: { alertId: alert.id, votes },
    };
  },
};

// ===== STRATEGY 5: PREDICTIVE (Proactive) =====
/**
 * Trend analysis and forecasting.
 * Uses moving averages and trend detection to predict future activity.
 */
const predictiveStrategy: DecisionStrategyHandler = {
  id: 'predictive',
  name: 'Predictiva (Proactiva)',
  description: 'Análisis de tendencias y predicción de actividad futura',
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

    // Predict next period activity using exponential smoothing
    const alpha = 0.3; // Smoothing factor
    const predictedActivity = Math.round(alpha * recentCount + (1 - alpha) * olderCount);
    const confidence = Math.min(95, 60 + Math.min(35, Math.abs(trendRatio - 1) * 50));

    // Store prediction
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
      await db.alert.create({
        data: {
          source: 'Predictive Engine',
          severity: 'ALTA',
          title: `Pico de actividad predicho: ${predictedActivity} mensajes/hora`,
          description: `Actividad ${trendRatio.toFixed(1)}x sobre media histórica. Tendencia: ${trendRatio > 3 ? 'ANÓMALA' : 'ELEVADA'}. Predicción próxima hora: ${predictedActivity} mensajes.`,
          actionTaken: 'Monitoreo predictivo activado. Preparando umbrales adaptativos.',
          strategy: 'predictive',
        },
      });
    }

    return {
      action: isAnomalous ? 'alert' : isSurge ? 'escalate' : 'monitor',
      severity: isAnomalous ? 'ALTA' : isSurge ? 'MEDIA' : 'BAJA',
      confidence,
      reasoning: `Tendencia: ${trendRatio.toFixed(2)}x. Actual: ${recentCount}, Anterior: ${olderCount}. Predicción: ${predictedActivity}. ${isAnomalous ? 'ANÓMALO' : isSurge ? 'ELEVADO' : 'Normal'}`,
      data: { trendRatio, recentCount, olderCount, predictedActivity },
    };
  },
};

// ===== STRATEGY 6: ADAPTIVE (Continuous Evolution) =====
/**
 * Self-adjusting thresholds based on false-positive/negative feedback.
 * Adjusts sensitivity based on alert acknowledgment rates.
 */
const adaptiveStrategy: DecisionStrategyHandler = {
  id: 'adaptive',
  name: 'Adaptativa (Evolución Continua)',
  description: 'Auto-ajuste de umbrales basado en retroalimentación de falsos positivos/negativos',
  async evaluate(ctx: StrategyContext): Promise<StrategyResult> {
    // Get recent alert acknowledgment data for adaptive learning
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const recentAlerts = await db.alert.findMany({
      where: { timestamp: { gte: thirtyDaysAgo } },
    });

    const totalAlerts = recentAlerts.length;
    const acknowledged = recentAlerts.filter(a => a.acknowledged).length;
    const escalated = recentAlerts.filter(a => a.escalated).length;

    // Calculate current performance metrics
    const acknowledgmentRate = totalAlerts > 0 ? acknowledged / totalAlerts : 0;
    const escalationRate = totalAlerts > 0 ? escalated / totalAlerts : 0;

    // Estimate false positive rate: alerts acknowledged but not escalated are likely valid
    // Unacknowledged alerts that aren't escalated might be false positives
    const possibleFalsePositives = totalAlerts - acknowledged - escalated;
    const falsePositiveRate = totalAlerts > 0 ? Math.max(0, possibleFalsePositives / totalAlerts * 100) : 0;
    const sensitivity = Math.min(100, acknowledgmentRate * 100 + escalationRate * 50);
    const accuracy = Math.min(100, (1 - falsePositiveRate / 100) * 100);

    // Record adaptive metric
    await db.adaptiveMetric.create({
      data: {
        date: now,
        falsePositiveRate,
        sensitivity,
        accuracy,
        threshold: 'system',
        adjustment: JSON.stringify({
          acknowledgmentRate,
          escalationRate,
          totalAlerts,
          action: falsePositiveRate > 15 ? 'increase_thresholds' : falsePositiveRate < 5 ? 'decrease_thresholds' : 'maintain',
        }),
      },
    });

    // Adaptive threshold adjustment
    let adjustmentMade = false;
    const adjustmentReasoning: string[] = [];

    if (falsePositiveRate > 15) {
      // Too many false positives → increase thresholds (make them less sensitive)
      for (const threshold of ctx.thresholds) {
        const newValue = Math.round(threshold.value * 1.1); // Increase by 10%
        await db.thresholdConfig.update({
          where: { id: threshold.id },
          data: { value: newValue },
        });
        adjustmentMade = true;
        adjustmentReasoning.push(`${threshold.name}: ${threshold.value} → ${newValue} (+10%)`);
      }
    } else if (falsePositiveRate < 5 && sensitivity < 80) {
      // Too few false positives but missing real threats → decrease thresholds
      for (const threshold of ctx.thresholds) {
        const newValue = Math.round(threshold.value * 0.9); // Decrease by 10%
        await db.thresholdConfig.update({
          where: { id: threshold.id },
          data: { value: newValue },
        });
        adjustmentMade = true;
        adjustmentReasoning.push(`${threshold.name}: ${threshold.value} → ${newValue} (-10%)`);
      }
    }

    // Emit adaptive event
    await eventStore.append('whatomate:decisions', {
      eventType: 'adaptive.threshold_adjusted',
      aggregateId: `adaptive_${Date.now()}`,
      aggregateType: 'threshold',
      payload: {
        falsePositiveRate,
        sensitivity,
        accuracy,
        adjustmentMade,
        adjustments: adjustmentReasoning,
      },
    });

    return {
      action: adjustmentMade ? 'alert' : 'monitor',
      severity: 'INFO',
      confidence: accuracy,
      reasoning: `FP Rate: ${falsePositiveRate.toFixed(1)}%, Sensibilidad: ${sensitivity.toFixed(1)}%, Precisión: ${accuracy.toFixed(1)}%. ${adjustmentMade ? `Ajustes: ${adjustmentReasoning.join('; ')}` : 'Sin ajustes necesarios'}`,
      data: { falsePositiveRate, sensitivity, accuracy, adjustments: adjustmentReasoning },
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
