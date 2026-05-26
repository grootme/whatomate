import { NextResponse } from 'next/server';
import { mockAlerts } from '@/lib/mock-data';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const severity = searchParams.get('severity');
  const source = searchParams.get('source');
  const acknowledged = searchParams.get('acknowledged');

  let filtered = [...mockAlerts];

  if (severity) {
    filtered = filtered.filter((a) => a.severity === severity);
  }
  if (source) {
    filtered = filtered.filter((a) => a.source === source);
  }
  if (acknowledged !== null) {
    const isAck = acknowledged === 'true';
    filtered = filtered.filter((a) => a.acknowledged === isAck);
  }

  return NextResponse.json({
    alerts: filtered,
    total: filtered.length,
    bySeverity: {
      CRÍTICA: filtered.filter((a) => a.severity === 'CRÍTICA').length,
      ALTA: filtered.filter((a) => a.severity === 'ALTA').length,
      MEDIA: filtered.filter((a) => a.severity === 'MEDIA').length,
      BAJA: filtered.filter((a) => a.severity === 'BAJA').length,
      INFO: filtered.filter((a) => a.severity === 'INFO').length,
    },
    threatLevel: 78,
  });
}

export async function POST(request: Request) {
  const body = await request.json();

  const alert = {
    id: `alert-${Date.now()}`,
    timestamp: new Date().toISOString(),
    source: body.source || 'Manual',
    severity: body.severity || 'MEDIA',
    title: body.title || 'Nueva alerta manual',
    description: body.description || '',
    actionTaken: body.actionTaken || 'Creada manualmente',
    acknowledged: false,
  };

  return NextResponse.json({ alert, message: 'Alerta creada exitosamente' }, { status: 201 });
}
