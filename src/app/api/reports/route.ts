import { NextResponse } from 'next/server';
import { mockReports, mockReportTemplates } from '@/lib/mock-data';

export async function GET() {
  return NextResponse.json({
    reports: mockReports,
    templates: mockReportTemplates,
    stats: {
      total: mockReports.length,
      completed: mockReports.filter((r) => r.status === 'completado').length,
      generating: mockReports.filter((r) => r.status === 'generando').length,
      totalPages: mockReports.filter((r) => r.status === 'completado').reduce((s, r) => s + r.pages, 0),
    },
  });
}

export async function POST(request: Request) {
  const body = await request.json();
  const type = body.type || 'diario';
  const now = new Date();
  const typeLabels: Record<string, string> = { diario: 'Diario', semanal: 'Semanal', mensual: 'Mensual' };

  const report = {
    id: `rep-${Date.now()}`,
    title: `Reporte ${typeLabels[type]} - ${now.getDate()} ${now.toLocaleString('es', { month: 'long' })} ${now.getFullYear()}`,
    date: now.toISOString().split('T')[0],
    type: type as 'diario' | 'semanal' | 'mensual',
    status: 'completado' as const,
    pages: type === 'diario' ? 11 : type === 'semanal' ? 26 : 42,
    sections: mockReportTemplates.find((t) => t.type === type)?.sections || [],
    downloadUrl: `/download/reporte-${type}-${Date.now()}.pdf`,
  };

  return NextResponse.json({ report, message: 'Reporte generado exitosamente' }, { status: 201 });
}
