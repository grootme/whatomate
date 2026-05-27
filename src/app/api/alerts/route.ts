import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { fetchService } from '@/lib/intelligence/service-client';

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

  return NextResponse.json(alert);
}
