import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET() {
  // Get real threshold configs from DB
  const thresholds = await db.thresholdConfig.findMany({
    where: { enabled: true },
    orderBy: { name: 'asc' },
  });

  // Get real pattern detections from DB
  const patterns = await db.patternDetection.findMany({
    where: { status: { in: ['active', 'confirmed'] } },
    orderBy: { lastDetected: 'desc' },
  });

  // Get real risk assessments from DB
  const recentRisks = await db.riskAssessment.findMany({
    orderBy: { createdAt: 'desc' },
    take: 20,
  });

  // Get real consensus votes from DB
  const recentVotes = await db.consensusVote.findMany({
    orderBy: { createdAt: 'desc' },
    take: 20,
  });

  // Get adaptive metrics for evolution tracking
  const adaptiveHistory = await db.adaptiveMetric.findMany({
    orderBy: { date: 'desc' },
    take: 30,
  });

  // Get predictions
  const predictions = await db.prediction.findMany({
    orderBy: { targetTime: 'desc' },
    take: 24,
  });

  // Risk dimensions (configurable weights)
  const riskDimensions = [
    { id: 'dim1', name: 'Naturaleza', weight: 35, description: 'Tipo y gravedad de la actividad detectada', color: '#EF4444' },
    { id: 'dim2', name: 'Volumen', weight: 25, description: 'Cantidad de eventos y mensajes relacionados', color: '#F59E0B' },
    { id: 'dim3', name: 'Conexiones', weight: 20, description: 'Vínculos entre entidades y redes identificadas', color: '#10B981' },
    { id: 'dim4', name: 'Contexto OSINT', weight: 15, description: 'Corroboración con fuentes de inteligencia abierta', color: '#06B6D4' },
    { id: 'dim5', name: 'Recencia', weight: 5, description: 'Temporalidad y frescura de los datos', color: '#8B5CF6' },
  ];

  return NextResponse.json({
    thresholds,
    patterns,
    riskDimensions,
    recentRisks,
    consensusVotes: recentVotes,
    adaptiveHistory,
    predictions,
  });
}

export async function PUT(request: Request) {
  const body = await request.json();

  // Update threshold configuration
  if (body.type === 'threshold' && body.id) {
    const updated = await db.thresholdConfig.update({
      where: { id: body.id },
      data: {
        name: body.name,
        description: body.description,
        metric: body.metric,
        condition: body.condition,
        value: body.value,
        unit: body.unit,
        alertSeverity: body.alertSeverity,
        alertType: body.alertType,
        enabled: body.enabled,
      },
    });
    return NextResponse.json({ message: 'Estrategia actualizada exitosamente', updated });
  }

  return NextResponse.json({ message: 'Estrategia actualizada exitosamente', updated: body });
}
