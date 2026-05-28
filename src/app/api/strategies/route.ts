import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/intelligence/auth';
import { fetchService } from '@/lib/intelligence/service-client';
import { db } from '@/lib/db';
import { strategyRegistry } from '@/lib/intelligence/strategies';
import type { StrategyContext } from '@/lib/intelligence/types';

const DEFAULT_DIMENSIONS = [
  { name: 'Naturaleza', weight: 35, description: 'Tipo y gravedad de la actividad detectada', color: '#EF4444' },
  { name: 'Volumen', weight: 25, description: 'Cantidad de eventos y mensajes relacionados', color: '#F59E0B' },
  { name: 'Conexiones', weight: 20, description: 'Vínculos entre entidades y redes identificadas', color: '#10B981' },
  { name: 'Contexto OSINT', weight: 15, description: 'Corroboración con fuentes de inteligencia abierta', color: '#06B6D4' },
  { name: 'Recencia', weight: 5, description: 'Temporalidad y frescura de los datos', color: '#8B5CF6' },
];

async function _GET() {
  // ===== Try Go backend first =====
  const goResult = await fetchService<Record<string, unknown>>('goBackend', '/strategies');
  if (!goResult.error && goResult.data) {
    return NextResponse.json(goResult.data);
  }

  // ===== Fallback to local Next.js intelligence engine =====
  console.warn('[api/strategies] Go backend unavailable, using local fallback:', goResult.error);

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

  // Get strategy registry entries
  const strategyEntries = strategyRegistry.getAll().map(s => ({
    id: s.id,
    name: s.name,
    description: s.description,
  }));

  // Risk dimensions from DB — seed defaults if table is empty
  let riskDimensions = await db.riskDimension.findMany({ orderBy: { name: 'asc' } });

  if (riskDimensions.length === 0) {
    await Promise.all(
      DEFAULT_DIMENSIONS.map(dim =>
        db.riskDimension.upsert({
          where: { name: dim.name },
          update: {},
          create: dim,
        })
      )
    );
    riskDimensions = await db.riskDimension.findMany({ orderBy: { name: 'asc' } });
  }

  return NextResponse.json({
    thresholds,
    patterns,
    riskDimensions,
    strategies: strategyEntries,
    recentRisks,
    consensusVotes: recentVotes,
    adaptiveHistory,
    predictions,
  });
}

async function _PUT(request: Request) {
  // ===== Try Go backend first for write operations =====
  try {
    const body = await request.json();
    const goResult = await fetchService<Record<string, unknown>>('goBackend', '/strategies', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!goResult.error && goResult.data) {
      return NextResponse.json(goResult.data);
    }
    console.warn('[api/strategies] Go backend PUT unavailable, using local fallback:', goResult.error);
  } catch {
    console.warn('[api/strategies] Go backend PUT failed, using local fallback');
  }

  // ===== Fallback to local =====
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

  // Update risk dimension weight
  if (body.type === 'risk_dimension' && body.id) {
    const updated = await db.riskDimension.update({
      where: { id: body.id },
      data: { weight: body.weight },
    });
    return NextResponse.json({ message: 'Dimensión de riesgo actualizada', updated });
  }

  return NextResponse.json({ message: 'Estrategia actualizada exitosamente', updated: body });
}

// ===== POST: Execute a strategy evaluation =====
async function _POST(request: NextRequest) {
  // ===== Try Go backend first =====
  try {
    const bodyText = await request.text();
    const goResult = await fetchService<Record<string, unknown>>('goBackend', '/strategies', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: bodyText,
    });
    if (!goResult.error && goResult.data) {
      return NextResponse.json(goResult.data);
    }
    console.warn('[api/strategies] Go backend POST unavailable, using local fallback:', goResult.error);
  } catch {
    console.warn('[api/strategies] Go backend POST failed, using local fallback');
  }

  // ===== Fallback to local =====
  try {
    const body = await request.json();
    const strategyType = body.type as string;

    if (!strategyType) {
      return NextResponse.json({ error: 'Missing "type" field' }, { status: 400 });
    }

    // Build the strategy context from DB data
    const [rawMessages, entities, patterns, thresholds, alerts] = await Promise.all([
      db.rawMessage.findMany({
        where: { processed: true },
        orderBy: { timestamp: 'desc' },
        take: 100,
      }),
      db.entity.findMany({ take: 100 }),
      db.patternDetection.findMany({
        where: { status: { in: ['active', 'confirmed'] } },
        orderBy: { lastDetected: 'desc' },
        take: 50,
      }),
      db.thresholdConfig.findMany({ where: { enabled: true } }),
      db.alert.findMany({ orderBy: { timestamp: 'desc' }, take: 50 }),
    ]);

    // Parse JSON fields that are stored as strings in SQLite
    const mappedMessages = rawMessages.map((m) => ({
      ...m,
      timestamp: m.timestamp,
      analyzedAt: m.analyzedAt,
      metadata: m.metadata ? JSON.parse(m.metadata) : undefined,
    }));

    const mappedEntities = entities.map((e) => ({
      ...e,
      aliases: e.aliases ? JSON.parse(e.aliases) : undefined,
      platformIds: e.platformIds ? JSON.parse(e.platformIds) : undefined,
      metadata: e.metadata ? JSON.parse(e.metadata) : undefined,
    }));

    const mappedPatterns = patterns.map((p) => ({
      ...p,
      evidenceIds: p.evidenceIds ? JSON.parse(p.evidenceIds) : undefined,
      entityIds: p.entityIds ? JSON.parse(p.entityIds) : undefined,
    }));

    const ctx: StrategyContext = {
      messages: mappedMessages,
      entities: mappedEntities,
      patterns: mappedPatterns,
      thresholds,
      alerts: alerts.map((a) => ({
        ...a,
        relatedEvents: a.relatedEvents ? JSON.parse(a.relatedEvents) : undefined,
      })),
    };

    // Run the strategy
    const result = await strategyRegistry.evaluateWith(strategyType as Parameters<typeof strategyRegistry.evaluateWith>[0], ctx);

    // For consensus, also return the individual votes that were just recorded
    if (strategyType === 'consensus' && result.data?.alertId) {
      const votes = await db.consensusVote.findMany({
        where: { alertId: result.data.alertId as string },
        orderBy: { createdAt: 'desc' },
      });
      return NextResponse.json({
        result,
        votes,
      });
    }

    return NextResponse.json({ result });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Strategy evaluation failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export const GET = withAuth(_GET);
export const PUT = withAuth(_PUT);
export const POST = withAuth(_POST);
