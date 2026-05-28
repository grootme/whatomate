import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/intelligence/auth';
import { fetchService } from '@/lib/intelligence/service-client';
import { db } from '@/lib/db';
import { runAnomalyDetection } from '@/lib/intelligence/anomaly-detector';

// ===== GET: Return recent anomaly alerts and metrics =====
async function _GET() {
  // ===== Try Go backend first =====
  const goResult = await fetchService<Record<string, unknown>>('goBackend', '/anomalies');
  if (!goResult.error && goResult.data) {
    return NextResponse.json(goResult.data);
  }

  // ===== Fallback to local Next.js intelligence engine =====
  console.warn('[api/anomalies] Go backend unavailable, using local fallback:', goResult.error);

  try {
    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
    const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    // Recent anomaly alerts (source='mon-ano')
    const recentAnomalyAlerts = await db.alert.findMany({
      where: { source: 'mon-ano' },
      orderBy: { timestamp: 'desc' },
      take: 50,
    });

    // Anomaly alert counts
    const lastHourCount = await db.alert.count({
      where: { source: 'mon-ano', timestamp: { gte: oneHourAgo } },
    });
    const last24hCount = await db.alert.count({
      where: { source: 'mon-ano', timestamp: { gte: twentyFourHoursAgo } },
    });
    const totalCount = await db.alert.count({
      where: { source: 'mon-ano' },
    });

    // Anomaly alerts by severity
    const severityBreakdown = await db.alert.groupBy({
      by: ['severity'],
      where: { source: 'mon-ano' },
      _count: { id: true },
    });

    // Anomaly events from IntelligenceEvent table
    const recentAnomalyEvents = await db.intelligenceEvent.findMany({
      where: { eventType: 'monitoring.anomaly_detected' },
      orderBy: { timestamp: 'desc' },
      take: 20,
    });

    // Agent state for mon-ano
    const agentState = await db.agentState.findUnique({
      where: { agentId: 'mon-ano' },
    });

    // Unacknowledged anomaly alerts
    const unacknowledgedCount = await db.alert.count({
      where: { source: 'mon-ano', acknowledged: false },
    });

    return NextResponse.json({
      alerts: recentAnomalyAlerts.map(a => ({
        id: a.id,
        source: a.source,
        severity: a.severity,
        title: a.title,
        description: a.description,
        actionTaken: a.actionTaken,
        strategy: a.strategy,
        acknowledged: a.acknowledged,
        escalated: a.escalated,
        timestamp: a.timestamp.toISOString(),
      })),
      metrics: {
        lastHour: lastHourCount,
        last24h: last24hCount,
        total: totalCount,
        unacknowledged: unacknowledgedCount,
        bySeverity: severityBreakdown.map(s => ({
          severity: s.severity,
          count: s._count.id,
        })),
      },
      recentEvents: recentAnomalyEvents.length,
      agent: agentState
        ? {
            agentId: agentState.agentId,
            name: agentState.name,
            status: agentState.status,
            health: agentState.health,
            messagesProcessed: agentState.messagesProcessed,
            lastHeartbeat: agentState.lastHeartbeat?.toISOString() ?? null,
          }
        : null,
    });
  } catch (error) {
    console.error('[Anomalies API] GET error:', error);
    return NextResponse.json(
      { error: 'Internal server error fetching anomaly data' },
      { status: 500 }
    );
  }
}

// ===== POST: Trigger anomaly detection and return results =====
async function _POST() {
  // ===== Try Go backend first =====
  try {
    const goResult = await fetchService<Record<string, unknown>>('goBackend', '/anomalies', {
      method: 'POST',
    });
    if (!goResult.error && goResult.data) {
      return NextResponse.json(goResult.data);
    }
    console.warn('[api/anomalies] Go backend POST unavailable, using local fallback:', goResult.error);
  } catch {
    console.warn('[api/anomalies] Go backend POST failed, using local fallback');
  }

  // ===== Fallback to local =====
  try {
    const result = await runAnomalyDetection();

    return NextResponse.json({
      detectionId: result.detectionId,
      timestamp: result.timestamp,
      anomaliesDetected: result.anomaliesDetected,
      alertsCreated: result.alertsCreated,
      agentHealth: result.agentHealth,
      details: result.details.map(d => ({
        type: d.type,
        metric: d.metric,
        currentValue: d.currentValue,
        baselineValue: d.baselineValue,
        deviation: d.deviation,
        zScore: d.zScore,
        severity: d.severity,
        description: d.description,
        relatedIds: d.relatedIds,
      })),
    });
  } catch (error) {
    console.error('[Anomalies API] POST error:', error);
    return NextResponse.json(
      { error: 'Internal server error during anomaly detection' },
      { status: 500 }
    );
  }
}

export const GET = withAuth(_GET);
export const POST = withAuth(_POST);
