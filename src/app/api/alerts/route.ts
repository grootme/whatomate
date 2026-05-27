import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { safeEventAppend } from '@/lib/intelligence/safe-event';
import { fetchService } from '@/lib/intelligence/service-client';
import { strategyRegistry } from '@/lib/intelligence/strategies';
import { buildStrategyContext } from '@/lib/intelligence/context-builder';

export async function GET() {
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

export async function POST(request: Request) {
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

  // Create IntelligenceEvent for alert creation
  await db.intelligenceEvent.create({
    data: {
      eventType: 'monitoring.alert_generated',
      aggregateId: alert.id,
      aggregateType: 'alert',
      stream: 'whatomate:alerts',
      payload: JSON.stringify({
        source: alert.source,
        severity: alert.severity,
        title: alert.title,
        strategy: alert.strategy,
      }),
      metadata: JSON.stringify({ alertCreated: true }),
      processed: false,
    },
  });

  safeEventAppend('whatomate:alerts', {
    eventType: 'monitoring.alert_generated',
    aggregateId: alert.id,
    aggregateType: 'alert',
    payload: {
      source: alert.source,
      severity: alert.severity,
      title: alert.title,
      strategy: alert.strategy,
    },
  });

  return NextResponse.json(alert, { status: 201 });
}

export async function PATCH(request: Request) {
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

  // ===== When acknowledging: create IntelligenceEvent =====
  if (body.acknowledged) {
    const ackEventId = `ack_${alertId}_${Date.now()}`;

    safeEventAppend('whatomate:alerts', {
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
    });

    const dbEvent = await db.intelligenceEvent.create({
      data: {
        eventType: 'monitoring.alert_acknowledged',
        aggregateId: alertId,
        aggregateType: 'alert',
        stream: 'whatomate:alerts',
        payload: JSON.stringify({
          alertId,
          severity: alert.severity,
          title: alert.title,
          acknowledgedBy: body.acknowledgedBy,
          strategy: alert.strategy,
        }),
        metadata: JSON.stringify({ acknowledgedBy: body.acknowledgedBy }),
        processed: false,
      },
    });

    eventIds.push(dbEvent.id);
  }

  // ===== When escalating: create IntelligenceEvent AND run consensus strategy =====
  if (body.escalated) {
    const escEventId = `esc_${alertId}_${Date.now()}`;

    safeEventAppend('whatomate:alerts', {
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
    });

    const dbEvent = await db.intelligenceEvent.create({
      data: {
        eventType: 'monitoring.alert_escalated',
        aggregateId: alertId,
        aggregateType: 'alert',
        stream: 'whatomate:alerts',
        payload: JSON.stringify({
          alertId,
          severity: alert.severity,
          title: alert.title,
          strategy: alert.strategy,
          escalatedBy: body.acknowledgedBy,
        }),
        metadata: JSON.stringify({ escalated: true, escalatedBy: body.acknowledgedBy }),
        processed: false,
      },
    });

    eventIds.push(dbEvent.id);

    // Run the consensus strategy to get multi-agent opinion on this escalated alert
    try {
      const context = await buildStrategyContext();
      const consensusResult = await strategyRegistry.evaluateWith('consensus', context);

      // Create IntelligenceEvent for consensus result
      const consensusEvent = await db.intelligenceEvent.create({
        data: {
          eventType: 'consensus.decision_made',
          aggregateId: alertId,
          aggregateType: 'alert',
          stream: 'whatomate:decisions',
          payload: JSON.stringify({
            alertId,
            consensusAction: consensusResult.action,
            consensusSeverity: consensusResult.severity,
            consensusConfidence: consensusResult.confidence,
            consensusReasoning: consensusResult.reasoning,
            triggeredBy: 'escalation',
          }),
          metadata: JSON.stringify({ strategyId: 'consensus', triggeredByEscalation: true, alertId }),
          processed: false,
        },
      });

      eventIds.push(consensusEvent.id);

      safeEventAppend('whatomate:decisions', {
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
      });
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
}
