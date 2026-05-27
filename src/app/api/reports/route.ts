import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET() {
  const reports = await db.report.findMany({
    orderBy: { createdAt: 'desc' },
    take: 20,
  });

  // Compute report stats
  const totalAlerts = await db.alert.count();
  const totalEvents = await db.intelligenceEvent.count();
  const totalEntities = await db.entity.count();

  return NextResponse.json({
    reports,
    stats: { totalAlerts, totalEvents, totalEntities },
  });
}

export async function POST(request: Request) {
  const body = await request.json();

  const now = new Date();
  const dateFrom = new Date(body.dateFrom || now.getTime() - 24 * 60 * 60 * 1000);
  const dateTo = new Date(body.dateTo || now);

  // Count data for the report period
  const alertCount = await db.alert.count({
    where: { timestamp: { gte: dateFrom, lte: dateTo } },
  });
  const eventCount = await db.intelligenceEvent.count({
    where: { timestamp: { gte: dateFrom, lte: dateTo } },
  });
  const entityCount = await db.entity.count({
    where: { lastSeen: { gte: dateFrom, lte: dateTo } },
  });

  const report = await db.report.create({
    data: {
      title: body.title || `Reporte ${body.type === 'diario' ? 'Diario' : body.type === 'semanal' ? 'Semanal' : 'Mensual'} - ${now.toLocaleDateString('es-ES')}`,
      type: body.type || 'diario',
      status: 'generando',
      sections: JSON.stringify(body.sections || ['Resumen ejecutivo', 'Alertas activas', 'Métricas de agentes', 'Eventos destacados', 'Recomendaciones']),
      dateFrom,
      dateTo,
      alertCount,
      eventCount,
      entityCount,
    },
  });

  // Trigger async report generation via the generate endpoint
  // Don't await — let it run in the background so the user gets an immediate response
  fetch(`${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/reports/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reportId: report.id }),
  }).catch((err) => {
    console.error('Failed to trigger report generation:', err);
    // Attempt to mark the report as error since generation failed to start
    db.report.update({
      where: { id: report.id },
      data: { status: 'error' },
    }).catch(() => {
      // Silently handle — error status update is best-effort
    });
  });

  return NextResponse.json(report, { status: 201 });
}
