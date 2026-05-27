import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/intelligence/auth';
import { db } from '@/lib/db';

// ===== GET /api/predictions/dashboard =====
// Returns prediction data formatted for dashboard visualization

async function _GET() {
  try {
    const now = new Date();

    // ─── 1. Activity Forecast ───
    // Use Prediction records (metric='activity', period='hour') for the next 24 hours
    const next24h = new Date(now.getTime() + 24 * 60 * 60 * 1000);

    const activityPredictions = await db.prediction.findMany({
      where: {
        metric: 'activity',
        period: 'hour',
        targetTime: { gte: now, lte: next24h },
        actualValue: null,
      },
      orderBy: { targetTime: 'asc' },
    });

    // If we don't have enough predictions in DB, generate synthetic forecast
    // based on historical patterns from raw message counts
    let activityForecast: Array<{
      hour: string;
      predicted: number;
      confidence: number;
      lowerBound: number;
      upperBound: number;
    }>;

    if (activityPredictions.length >= 8) {
      // Use real predictions from DB
      activityForecast = activityPredictions.map((p) => {
        const predicted = Math.round(p.value);
        const bound = Math.round(predicted * 0.15);
        return {
          hour: p.targetTime.toLocaleTimeString('en-GB', {
            hour: '2-digit',
            minute: '2-digit',
          }),
          predicted,
          confidence: Math.round(p.confidence),
          lowerBound: Math.max(0, predicted - bound),
          upperBound: predicted + bound,
        };
      });
    } else {
      // Generate forecast from historical hourly message counts (last 7 days same hour)
      const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

      // Get message counts by hour from last 7 days
      const recentMessages = await db.rawMessage.findMany({
        where: { timestamp: { gte: sevenDaysAgo } },
        select: { timestamp: true },
      });

      // Build hour-of-day distribution
      const hourBuckets: Record<number, number[]> = {};
      for (let h = 0; h < 24; h++) {
        hourBuckets[h] = [];
      }

      for (const msg of recentMessages) {
        const hour = msg.timestamp.getHours();
        const dayFraction = msg.timestamp.getMinutes() / 60;
        // Count messages per hour-of-day
        if (!hourBuckets[hour]) hourBuckets[hour] = [];
        hourBuckets[hour].push(1);
      }

      // Build forecast for next 24 hours
      activityForecast = Array.from({ length: 24 }, (_, i) => {
        const targetHour = new Date(now.getTime() + (i + 1) * 60 * 60 * 1000);
        const h = targetHour.getHours();
        const dayCount = Math.max(1, Math.ceil((now.getTime() - sevenDaysAgo.getTime()) / (24 * 60 * 60 * 1000)));
        const avgPerHour = hourBuckets[h] ? hourBuckets[h].length / dayCount : 0;
        const predicted = Math.round(avgPerHour);
        const bound = Math.round(predicted * 0.15);

        return {
          hour: targetHour.toLocaleTimeString('en-GB', {
            hour: '2-digit',
            minute: '2-digit',
          }),
          predicted,
          confidence: Math.round(Math.min(95, 50 + (recentMessages.length > 100 ? 30 : 10))),
          lowerBound: Math.max(0, predicted - bound),
          upperBound: predicted + bound,
        };
      });
    }

    // ─── 2. Risk Trend ───
    // Aggregate RiskAssessment records by day for last 30 days
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const riskAssessments = await db.riskAssessment.findMany({
      where: { createdAt: { gte: thirtyDaysAgo } },
      orderBy: { createdAt: 'asc' },
    });

    // Group by date
    const riskByDate: Record<
      string,
      { scores: number[]; entityIds: Set<string> }
    > = {};

    for (const ra of riskAssessments) {
      const dateKey = ra.createdAt.toISOString().split('T')[0];
      if (!riskByDate[dateKey]) {
        riskByDate[dateKey] = { scores: [], entityIds: new Set() };
      }
      riskByDate[dateKey].scores.push(ra.score);
      if (ra.entityId) {
        riskByDate[dateKey].entityIds.add(ra.entityId);
      }
    }

    const riskTrend: Array<{
      date: string;
      avgScore: number;
      maxScore: number;
      entityCount: number;
    }> = Object.entries(riskByDate)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, data]) => ({
        date,
        avgScore:
          data.scores.length > 0
            ? Math.round(
                data.scores.reduce((s, v) => s + v, 0) / data.scores.length
              )
            : 0,
        maxScore: data.scores.length > 0 ? Math.max(...data.scores) : 0,
        entityCount: data.entityIds.size,
      }));

    // ─── 3. Anomaly Probability ───
    // Compute from recent AdaptiveMetric FPR and alert frequency
    const sevenDaysAgoDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    const [recentMetrics, recentAnomalyAlerts, totalAlerts24h] =
      await Promise.all([
        db.adaptiveMetric.findMany({
          where: { date: { gte: sevenDaysAgoDate } },
          orderBy: { date: 'desc' },
          take: 30,
        }),
        db.alert.findMany({
          where: {
            source: 'mon-ano',
            timestamp: { gte: sevenDaysAgoDate },
          },
        }),
        db.alert.count({
          where: { timestamp: { gte: twentyFourHoursAgo } },
        }),
      ]);

    // Base probability from FPR (false positive rate)
    const avgFPR =
      recentMetrics.length > 0
        ? recentMetrics.reduce((s, m) => s + m.falsePositiveRate, 0) /
          recentMetrics.length
        : 0.05; // default 5% FPR

    // Adjust probability based on anomaly alert frequency
    const anomalyAlertRate = recentAnomalyAlerts.length / 7; // per day
    const alertSpike = anomalyAlertRate > 3 ? 0.2 : anomalyAlertRate > 1 ? 0.1 : 0;

    // 24h probability: base FPR + alert spike factor
    const next24hProb = Math.min(
      100,
      Math.round((avgFPR * 100 + alertSpike * 100 + (totalAlerts24h > 5 ? 15 : totalAlerts24h > 2 ? 5 : 0)))
    );

    // Weekly probability: higher due to longer window
    const nextWeekProb = Math.min(
      100,
      Math.round(next24hProb * 2.5 + (anomalyAlertRate > 2 ? 10 : 0))
    );

    // Determine driving factors
    const factors: string[] = [];
    if (avgFPR > 0.1) factors.push('Elevated false positive rate in adaptive metrics');
    if (anomalyAlertRate > 2) factors.push('High anomaly alert frequency in last 7 days');
    if (totalAlerts24h > 5) factors.push('Alert spike detected in last 24 hours');
    if (recentAnomalyAlerts.some((a) => a.severity === 'CRÍTICA' || a.severity === 'ALTA')) {
      factors.push('Critical/high severity anomalies recently detected');
    }
    const lowSensitivity =
      recentMetrics.length > 0
        ? recentMetrics.reduce((s, m) => s + m.sensitivity, 0) /
          recentMetrics.length
        : 0;
    if (lowSensitivity < 0.5 && recentMetrics.length > 0) {
      factors.push('Low detection sensitivity may miss anomalies');
    }
    if (factors.length === 0) {
      factors.push('Normal operational baseline — no elevated risk factors');
    }

    const anomalyProbability = {
      next24h: next24hProb,
      nextWeek: nextWeekProb,
      factors,
    };

    // ─── 4. Strategic Indicators ───
    // Compute from threshold breach counts, pattern counts, entity risk averages
    const [
      allThresholds,
      activePatterns,
      entityRiskStats,
      recentEntityCount,
      criticalEntityCount,
    ] = await Promise.all([
      db.thresholdConfig.findMany({
        where: { enabled: true },
      }),
      db.patternDetection.findMany({
        where: { status: { in: ['active', 'confirmed', 'investigating'] } },
      }),
      db.entity.aggregate({
        _avg: { riskScore: true },
        _max: { riskScore: true },
      }),
      db.entity.count({
        where: {
          lastSeen: { gte: sevenDaysAgoDate },
        },
      }),
      db.entity.count({
        where: { riskLevel: { in: ['high', 'critical'] } },
      }),
    ]);

    // Count thresholds where currentValue >= value (breached)
    const breachedCount = allThresholds.filter(
      (t) => t.currentValue >= t.value
    ).length;

    // Compute trend helper
    function computeTrend(
      current: number,
      previous: number
    ): 'up' | 'down' | 'stable' {
      if (previous === 0) return current > 0 ? 'up' : 'stable';
      const change = ((current - previous) / previous) * 100;
      if (change > 10) return 'up';
      if (change < -10) return 'down';
      return 'stable';
    }

    // Get previous period counts for trend computation
    const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
    const sevenDaysAgoStart = sevenDaysAgoDate;

    const [prevPatterns, currPatterns, prevAlerts, currAlerts] =
      await Promise.all([
        db.patternDetection.count({
          where: {
            status: { in: ['active', 'confirmed'] },
            firstDetected: { gte: fourteenDaysAgo, lt: sevenDaysAgoStart },
          },
        }),
        db.patternDetection.count({
          where: {
            status: { in: ['active', 'confirmed'] },
            firstDetected: { gte: sevenDaysAgoStart },
          },
        }),
        db.alert.count({
          where: { timestamp: { gte: fourteenDaysAgo, lt: sevenDaysAgoStart } },
        }),
        db.alert.count({
          where: { timestamp: { gte: sevenDaysAgoStart } },
        }),
      ]);

    const avgRiskScore = entityRiskStats._avg.riskScore ?? 0;

    const strategicIndicators: Array<{
      name: string;
      value: number;
      trend: 'up' | 'down' | 'stable';
      description: string;
    }> = [
      {
        name: 'Threat Exposure',
        value: Math.round(avgRiskScore),
        trend: computeTrend(
          currPatterns,
          prevPatterns
        ),
        description: `Average entity risk score across ${recentEntityCount} active entities`,
      },
      {
        name: 'Threshold Breaches',
        value: breachedCount,
        trend: breachedCount > allThresholds.length * 0.3 ? 'up' : 'stable',
        description: `${breachedCount} of ${allThresholds.length} enabled thresholds currently breached`,
      },
      {
        name: 'Active Threat Patterns',
        value: activePatterns.length,
        trend: computeTrend(currPatterns, prevPatterns),
        description: `${activePatterns.filter((p) => p.severity === 'CRÍTICA' || p.severity === 'ALTA').length} high-severity patterns detected`,
      },
      {
        name: 'Alert Volume',
        value: currAlerts,
        trend: computeTrend(currAlerts, prevAlerts),
        description: `${currAlerts} alerts in last 7 days vs ${prevAlerts} in prior week`,
      },
      {
        name: 'High-Risk Entities',
        value: criticalEntityCount,
        trend: criticalEntityCount > 5 ? 'up' : 'stable',
        description: `${criticalEntityCount} entities at high or critical risk level`,
      },
      {
        name: 'Detection Sensitivity',
        value: Math.round(lowSensitivity * 100),
        trend: lowSensitivity > 0.7 ? 'up' : lowSensitivity < 0.4 ? 'down' : 'stable',
        description: `Anomaly detection sensitivity at ${Math.round(lowSensitivity * 100)}%`,
      },
    ];

    return NextResponse.json({
      activityForecast,
      riskTrend,
      anomalyProbability,
      strategicIndicators,
    });
  } catch (error) {
    console.error('[Predictions Dashboard API] GET error:', error);

    // Return safe defaults on error
    const now = new Date();
    const defaultForecast = Array.from({ length: 24 }, (_, i) => {
      const targetHour = new Date(now.getTime() + (i + 1) * 60 * 60 * 1000);
      return {
        hour: targetHour.toLocaleTimeString('en-GB', {
          hour: '2-digit',
          minute: '2-digit',
        }),
        predicted: 0,
        confidence: 50,
        lowerBound: 0,
        upperBound: 0,
      };
    });

    return NextResponse.json({
      activityForecast: defaultForecast,
      riskTrend: [],
      anomalyProbability: {
        next24h: 0,
        nextWeek: 0,
        factors: ['Unable to compute anomaly probability — using defaults'],
      },
      strategicIndicators: [],
    });
  }
}

export const GET = withAuth(_GET);
