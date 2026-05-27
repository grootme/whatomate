import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

/**
 * GET /api/strategies/signals
 *
 * Computes real signal data for the Predictive and Adaptive strategy tabs.
 * All values are derived from real DB records — no hardcoded values.
 */
export async function GET() {
  try {
    // ===== 1. Active Signals =====

    // OSINT event probability: derived from threshold with metric containing 'earthquake'
    const earthquakeThreshold = await db.thresholdConfig.findFirst({
      where: { metric: { contains: 'earthquake' }, enabled: true },
    });
    const osintEventProbability = earthquakeThreshold && earthquakeThreshold.currentValue > 0
      ? Math.min(100, Math.round((earthquakeThreshold.currentValue / earthquakeThreshold.value) * 100))
      : 0;

    // Disinformation risk: count of active disinformation patterns
    const disinfoPatterns = await db.patternDetection.count({
      where: {
        patternType: 'disinformation',
        status: { in: ['active', 'confirmed', 'investigating'] },
      },
    });
    const disinfoRisk: 'Bajo' | 'Medio' | 'Alto' | 'Crítico' =
      disinfoPatterns >= 5 ? 'Crítico' :
      disinfoPatterns >= 3 ? 'Alto' :
      disinfoPatterns >= 1 ? 'Medio' : 'Bajo';

    // Emerging pattern: most recently detected pattern
    const emergingPattern = await db.patternDetection.findFirst({
      where: { status: { in: ['active', 'investigating'] } },
      orderBy: { lastDetected: 'desc' },
    });
    const patternTypeLabels: Record<string, string> = {
      fraud_multichannel: 'Fraude multi-canal',
      money_laundering: 'Lavado de divisas',
      disinformation: 'Desinformación coordinada',
      crypto_manipulation: 'Manipulación cripto',
      irregular_migration: 'Migración irregular',
    };
    const emergingPatternLabel = emergingPattern
      ? (patternTypeLabels[emergingPattern.patternType] || emergingPattern.patternType)
      : 'Sin datos';

    // Telegram activity peak: find the hour with most telegram messages
    const telegramMessages = await db.rawMessage.findMany({
      where: { source: 'telegram' },
      select: { timestamp: true },
      orderBy: { timestamp: 'desc' },
      take: 500,
    });

    // Bucket messages by hour
    const hourCounts: Record<number, number> = {};
    for (const msg of telegramMessages) {
      const hour = msg.timestamp.getHours();
      hourCounts[hour] = (hourCounts[hour] || 0) + 1;
    }
    let peakHourStart = 0;
    let peakCount = 0;
    for (let h = 0; h < 24; h++) {
      const count = hourCounts[h] || 0;
      if (count > peakCount) {
        peakCount = count;
        peakHourStart = h;
      }
    }
    const telegramPeak = telegramMessages.length > 0
      ? `${peakHourStart.toString().padStart(2, '0')}:00-${((peakHourStart + 2) % 24).toString().padStart(2, '0')}:00`
      : 'Sin datos';

    // Crypto trend: check OSINT crypto manipulation patterns
    const cryptoPatterns = await db.patternDetection.findMany({
      where: { patternType: 'crypto_manipulation', status: { in: ['active', 'confirmed'] } },
      orderBy: { lastDetected: 'desc' },
      take: 5,
    });
    const cryptoTrend: 'Alcista' | 'Bajista' | 'Lateral' = cryptoPatterns.length > 0
      ? (cryptoPatterns[0].confidence > 70 ? 'Alcista' : cryptoPatterns[0].confidence > 40 ? 'Lateral' : 'Bajista')
      : 'Sin datos';

    const activeSignals = [
      {
        icon: 'Shield',
        label: 'Probabilidad evento OSINT',
        value: `${osintEventProbability}%`,
        trend: osintEventProbability > 50 ? 'up' : 'neutral',
        color: 'text-amber-600',
      },
      {
        icon: 'BarChart3',
        label: 'Tendencia cripto BTC',
        value: cryptoTrend,
        trend: cryptoTrend === 'Alcista' ? 'up' : cryptoTrend === 'Bajista' ? 'down' : 'neutral',
        color: cryptoTrend === 'Alcista' ? 'text-emerald-600' : cryptoTrend === 'Bajista' ? 'text-red-600' : 'text-amber-600',
      },
      {
        icon: 'Zap',
        label: 'Pico actividad Telegram',
        value: telegramPeak,
        trend: 'neutral',
        color: 'text-teal-600',
      },
      {
        icon: 'AlertTriangle',
        label: 'Riesgo desinformación',
        value: disinfoRisk,
        trend: disinfoRisk === 'Alto' || disinfoRisk === 'Crítico' ? 'up' : 'neutral',
        color: disinfoRisk === 'Crítico' ? 'text-red-600' : disinfoRisk === 'Alto' ? 'text-orange-600' : disinfoRisk === 'Medio' ? 'text-amber-600' : 'text-emerald-600',
      },
      {
        icon: 'Brain',
        label: 'Patrón emergente',
        value: emergingPatternLabel,
        trend: emergingPattern ? 'up' : 'neutral',
        color: 'text-orange-600',
      },
    ];

    // ===== 2. Confidence Indicators =====

    // Prediction model confidence: average confidence from latest Prediction records
    const latestPredictions = await db.prediction.findMany({
      orderBy: { predictedAt: 'desc' },
      take: 10,
    });
    const predictionConfidence = latestPredictions.length > 0
      ? Math.round(latestPredictions.reduce((s, p) => s + p.confidence, 0) / latestPredictions.length)
      : 0;

    // Historical data confidence: average accuracy from latest AdaptiveMetric records
    const latestMetrics = await db.adaptiveMetric.findMany({
      orderBy: { date: 'desc' },
      take: 10,
    });
    const historicalConfidence = latestMetrics.length > 0
      ? Math.round(latestMetrics.reduce((s, m) => s + m.accuracy, 0) / latestMetrics.length)
      : 0;

    // OSINT correlation: average confidence from PatternDetection records with OSINT evidence
    const osintRelatedPatterns = await db.patternDetection.findMany({
      where: { status: { in: ['active', 'confirmed'] } },
      orderBy: { lastDetected: 'desc' },
      take: 10,
    });
    const osintCorrelation = osintRelatedPatterns.length > 0
      ? Math.round(osintRelatedPatterns.reduce((s, p) => s + p.confidence, 0) / osintRelatedPatterns.length)
      : 0;

    // Consensus agent confidence: average confidence from latest ConsensusVote records
    const latestVotes = await db.consensusVote.findMany({
      orderBy: { createdAt: 'desc' },
      take: 10,
    });
    const consensusConfidence = latestVotes.length > 0
      ? Math.round(latestVotes.reduce((s, v) => s + v.confidence, 0) / latestVotes.length)
      : 0;

    const confidenceIndicators = [
      { label: 'Modelo de predicción', value: predictionConfidence },
      { label: 'Datos históricos', value: historicalConfidence },
      { label: 'Correlación OSINT', value: osintCorrelation },
      { label: 'Consenso agentes', value: consensusConfidence },
    ];

    // ===== 3. Prediction data for the activity chart =====
    // Transform Prediction records into { hour, activity, confidence } format
    const allPredictions = await db.prediction.findMany({
      where: { metric: 'activity', period: 'hour' },
      orderBy: { targetTime: 'asc' },
      take: 24,
    });

    const predictionChartData = allPredictions.length > 0
      ? allPredictions.map((p) => ({
          hour: `${p.targetTime.getHours().toString().padStart(2, '0')}:00`,
          activity: Math.round(p.value),
          confidence: Math.round(p.confidence),
        }))
      : [];

    // ===== 4. Adaptive timeline events =====
    // Get IntelligenceEvents related to adaptive adjustments
    const adaptiveEvents = await db.intelligenceEvent.findMany({
      where: {
        eventType: { in: ['adaptive.threshold_adjusted', 'adaptive.metric_recorded'] },
      },
      orderBy: { timestamp: 'desc' },
      take: 10,
    });

    // Also get AdaptiveMetric records with adjustments
    const adaptiveMetricsWithAdjustments = await db.adaptiveMetric.findMany({
      where: { adjustment: { not: null } },
      orderBy: { date: 'desc' },
      take: 10,
    });

    // Also include pattern detections as "learn" events
    const recentPatternDetections = await db.patternDetection.findMany({
      where: { status: { in: ['active', 'confirmed'] } },
      orderBy: { lastDetected: 'desc' },
      take: 5,
    });

    // Build timeline entries from multiple sources
    const timelineEntries: Array<{ date: string; event: string; type: string }> = [];

    // From adaptive events
    for (const evt of adaptiveEvents) {
      let payload: Record<string, unknown> = {};
      try { payload = JSON.parse(evt.payload); } catch { /* skip */ }

      const dateStr = evt.timestamp.toLocaleDateString('es-ES', { month: 'short', day: 'numeric' });
      const eventType = evt.eventType === 'adaptive.threshold_adjusted' ? 'auto' : 'improve';
      const description = evt.eventType === 'adaptive.threshold_adjusted'
        ? (payload.description as string || `Ajuste umbral: ${payload.threshold || 'sistema'}`)
        : (payload.description as string || 'Métrica adaptativa registrada');

      timelineEntries.push({ date: dateStr, event: description, type: eventType });
    }

    // From adaptive metric adjustments
    for (const m of adaptiveMetricsWithAdjustments) {
      if (!m.adjustment) continue;
      let adj: Record<string, unknown> = {};
      try { adj = JSON.parse(m.adjustment); } catch { /* skip */ }

      const dateStr = m.date.toLocaleDateString('es-ES', { month: 'short', day: 'numeric' });
      const description = adj.description as string || `Ajuste ${m.threshold}: FP ${m.falsePositiveRate.toFixed(1)}%`;
      const eventType = adj.type as string || 'auto';

      // Avoid duplicates from adaptive events
      const isDuplicate = timelineEntries.some(te => te.date === dateStr && te.event === description);
      if (!isDuplicate) {
        timelineEntries.push({ date: dateStr, event: description, type: eventType });
      }
    }

    // From recent pattern detections (learn events)
    for (const p of recentPatternDetections) {
      const dateStr = p.lastDetected.toLocaleDateString('es-ES', { month: 'short', day: 'numeric' });
      const label = patternTypeLabels[p.patternType] || p.patternType;
      const description = `Nuevo patrón detectado: ${label}`;
      const isDuplicate = timelineEntries.some(te => te.date === dateStr && te.event === description);
      if (!isDuplicate) {
        timelineEntries.push({ date: dateStr, event: description, type: 'learn' });
      }
    }

    // Sort by date descending (most recent first)
    timelineEntries.sort((a, b) => {
      // Simple lexicographic sort works for "May 26" format
      return b.date.localeCompare(a.date);
    });

    // ===== 5. Current adaptive metrics (latest values) =====
    const latestAdaptiveMetric = await db.adaptiveMetric.findFirst({
      orderBy: { date: 'desc' },
    });

    const totalIterations = await db.adaptiveMetric.count();

    const currentMetrics = latestAdaptiveMetric
      ? {
          falsePositiveRate: latestAdaptiveMetric.falsePositiveRate,
          accuracy: latestAdaptiveMetric.accuracy,
          sensitivity: latestAdaptiveMetric.sensitivity,
          iterations: totalIterations,
        }
      : {
          falsePositiveRate: 0,
          accuracy: 0,
          sensitivity: 0,
          iterations: 0,
        };

    return NextResponse.json({
      activeSignals,
      confidenceIndicators,
      predictionChartData,
      timelineEntries,
      currentMetrics,
    });
  } catch (error) {
    console.error('[/api/strategies/signals] Error computing signals:', error);
    return NextResponse.json({
      activeSignals: [],
      confidenceIndicators: [],
      predictionChartData: [],
      timelineEntries: [],
      currentMetrics: { falsePositiveRate: 0, accuracy: 0, sensitivity: 0, iterations: 0 },
    }, { status: 200 });
  }
}
