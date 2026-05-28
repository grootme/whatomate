import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/intelligence/auth';
import { fetchService } from '@/lib/intelligence/service-client';
import { db } from '@/lib/db';
import { persistEvent } from '@/lib/intelligence/event-persist';
import { strategyRegistry } from '@/lib/intelligence/strategies';
import { buildStrategyContext } from '@/lib/intelligence/context-builder';

async function _GET() {
  // ===== Try Go backend first =====
  const goResult = await fetchService<Record<string, unknown>[]>('goBackend', '/alerts');
  if (!goResult.error && goResult.data) {
    return NextResponse.json(goResult.data);
  }

  // ===== Fallback to local Next.js intelligence engine =====
  console.warn('[api/alerts] Go backend unavailable, using local fallback:', goResult.error);

  // Get alerts from database
  const dbAlerts = await db.alert.findMany({
    orderBy: { timestamp: 'desc' },
    take: 50,
  });

  // Also check Shadowbroker AI Bridge for real-time alerts
  const sbAlerts = await fetchService<Record<string, unknown>[]>('shadowbrokerAi', '/alerts');

  // Merge: prioritize DB alerts, supplement with live alerts
  const liveAlerts = (sbAlerts.data ?? []).map((a: Record<string, unknown>) => ({
    id: (a.id as string) || `sb_${Date.now()}_${Math.random().toString(36).slice(2)}`,
    timestamp: (a.timestamp as string) || new Date().toISOString(),
    source: (a.source as string) || 'Shadowbroker AI Bridge',
    severity: (a.severity as string) || 'MEDIA',
    title: (a.title as string) || (a.type as string) || 'Alerta OSINT',
    description: (a.description as string) || (a.analysis as string) || '',
    actionTaken: (a.actionTaken as string) || 'Monitoreo automático',
    acknowledged: (a.acknowledged as boolean) || false,
    strategy: 'threshold' as const,
  }));

  // Format DB alerts
  const formattedDbAlerts = dbAlerts.map(a => ({
    id: a.id,
    timestamp: a.timestamp.toISOString(),
    source: a.source,
    severity: a.severity,
    title: a.title,
    description: a.description,
    actionTaken: a.actionTaken || '',
    acknowledged: a.acknowledged,
    strategy: a.strategy,
  }));

  // Combine and deduplicate
  const allAlerts = [...formattedDbAlerts, ...liveAlerts];

  return NextResponse.json(allAlerts);
}

async function _POST(request: Request) {
  try {
    const body = await request.json();

    const alert = await db.alert.create({
      data: {
        source: body.source,
        severity: body.severity,
        title: body.title,
        description: body.description,
        actionTaken: body.actionTaken,
        strategy: body.strategy || 'threshold',
        thresholdId: body.thresholdId,
        patternId: body.patternId,
      },
    });

    // Persist alert creation event via persistEvent (handles Redis + SQLite)
    await persistEvent('whatomate:alerts', {
      eventType: 'monitoring.alert_generated',
      aggregateId: alert.id,
      aggregateType: 'alert',
      payload: {
        source: alert.source,
        severity: alert.severity,
        title: alert.title,
        strategy: alert.strategy,
      },
      metadata: { alertCreated: true },
    });

    return NextResponse.json(alert, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to create alert';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

async function _PATCH(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const alertId = searchParams.get('id');
    const body = await request.json();

    if (!alertId) {
      return NextResponse.json({ error: 'Alert ID required' }, { status: 400 });
    }

    const alert = await db.alert.update({
      where: { id: alertId },
      data: {
        acknowledged: body.acknowledged,
        acknowledgedBy: body.acknowledgedBy,
        acknowledgedAt: body.acknowledged ? new Date() : undefined,
        escalated: body.escalated,
      },
    });

    const eventIds: string[] = [];

    // ===== When acknowledging: persist event via persistEvent =====
    if (body.acknowledged) {
      const ackEventId = await persistEvent('whatomate:alerts', {
        eventType: 'monitoring.alert_acknowledged',
        aggregateId: alertId,
        aggregateType: 'alert',
        payload: {
          alertId,
          severity: alert.severity,
          title: alert.title,
          acknowledgedBy: body.acknowledgedBy,
          strategy: alert.strategy,
        },
        metadata: { acknowledgedBy: body.acknowledgedBy },
      });

      eventIds.push(ackEventId);
    }

    // ===== When escalating: persist event via persistEvent AND run consensus strategy =====
    if (body.escalated) {
      const escEventId = await persistEvent('whatomate:alerts', {
        eventType: 'monitoring.alert_escalated',
        aggregateId: alertId,
        aggregateType: 'alert',
        payload: {
          alertId,
          severity: alert.severity,
          title: alert.title,
          strategy: alert.strategy,
          escalatedBy: body.acknowledgedBy,
        },
        metadata: { escalated: true, escalatedBy: body.acknowledgedBy },
      });

      eventIds.push(escEventId);

      // Run the consensus strategy to get multi-agent opinion on this escalated alert
      try {
        const context = await buildStrategyContext();
        const consensusResult = await strategyRegistry.evaluateWith('consensus', context);

        // Persist consensus decision event via persistEvent
        const consensusEventId = await persistEvent('whatomate:decisions', {
          eventType: 'consensus.decision_made',
          aggregateId: alertId,
          aggregateType: 'alert',
          payload: {
            alertId,
            consensusAction: consensusResult.action,
            consensusSeverity: consensusResult.severity,
            consensusConfidence: consensusResult.confidence,
            consensusReasoning: consensusResult.reasoning,
            triggeredBy: 'escalation',
          },
          metadata: { strategyId: 'consensus', triggeredByEscalation: true, alertId },
        });

        eventIds.push(consensusEventId);
      } catch (err) {
        console.error('[Alerts] Consensus strategy evaluation on escalation failed:', err);
      }
    }

    // Update the alert's relatedEvents field with the event IDs
    if (eventIds.length > 0) {
      const existingRelated = alert.relatedEvents ? JSON.parse(alert.relatedEvents) : [];
      const updatedRelated = [...new Set([...existingRelated, ...eventIds])];

      await db.alert.update({
        where: { id: alertId },
        data: {
          relatedEvents: JSON.stringify(updatedRelated),
        },
      });

      // Return updated alert with relatedEvents
      const updatedAlert = await db.alert.findUnique({ where: { id: alertId } });
      return NextResponse.json(updatedAlert || alert);
    }

    return NextResponse.json(alert);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to update alert';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export const GET = withAuth(_GET);
export const POST = withAuth(_POST);
export const PATCH = withAuth(_PATCH);
