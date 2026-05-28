import { NextResponse } from 'next/server';
import { fetchService } from '@/lib/intelligence/service-client';
import { db } from '@/lib/db';
import { generateReport } from '@/lib/intelligence/report-generator';

export async function GET() {
  // ===== Try Go backend first =====
  const goResult = await fetchService<Record<string, unknown>>('goBackend', '/reports');
  if (!goResult.error && goResult.data) {
    return NextResponse.json(goResult.data);
  }

  // ===== Fallback to local Next.js intelligence engine =====
  console.warn('[api/reports] Go backend unavailable, using local fallback:', goResult.error);

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

  // Trigger async report generation directly (no self-fetch)
  // Don't await — let it run in the background so the user gets an immediate response
  generateReport(report.id).catch((err) => {
    console.error('Failed to trigger report generation:', err);
  });

  return NextResponse.json(report, { status: 201 });
}
