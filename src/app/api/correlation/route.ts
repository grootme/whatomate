import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { runFullCorrelation } from '@/lib/intelligence/correlation-engine';
import { fetchService } from '@/lib/intelligence/service-client';
import { withAuth } from '@/lib/intelligence/auth';

// ===== POST: Run full correlation analysis =====
async function _POST() {
  try {
    // ===== Try Go backend first =====
    const goResult = await fetchService<Record<string, unknown>>('goBackend', '/correlation', {
      method: 'POST',
    });
    if (!goResult.error && goResult.data) {
      return NextResponse.json(goResult.data);
    }

    console.warn('[api/correlation] Go backend POST unavailable, using local fallback:', goResult.error);

    const result = await runFullCorrelation();

    return NextResponse.json({
      success: true,
      correlationId: result.correlationId,
      timestamp: result.timestamp,
      entities: {
        relationsCreated: result.relationsCreated,
        entitiesUpdated: result.entitiesUpdated,
        crossPlatformGroups: result.crossPlatformGroups,
      },
      patterns: {
        patternsUpdated: result.patternsUpdated,
        crossPlatformDetections: result.crossPlatformDetections,
      },
    });
  } catch (error) {
    console.error('[Correlation] POST error:', error);
    return NextResponse.json(
      { error: 'Internal server error during correlation analysis' },
      { status: 500 }
    );
  }
}

// ===== GET: Return correlation stats from DB =====
async function _GET() {
  try {
    // EntityRelation count
    const totalRelations = await db.entityRelation.count();

    // EntityRelation count by type
    const communicatesWithCount = await db.entityRelation.count({
      where: { relationType: 'communicates_with' },
    });
    const mentionsCount = await db.entityRelation.count({
      where: { relationType: 'mentions' },
    });

    // Cross-platform entity count: entities whose platformIds contain multiple sources
    const allEntities = await db.entity.findMany({
      select: { id: true, platformIds: true },
    });

    let crossPlatformEntityCount = 0;
    const platformDistribution: Record<string, number> = {};

    for (const entity of allEntities) {
      if (!entity.platformIds) continue;
      try {
        const pids = JSON.parse(entity.platformIds) as Record<string, string[]>;
        const sources = Object.keys(pids).filter(k => pids[k] && pids[k].length > 0);

        if (sources.length >= 2) {
          crossPlatformEntityCount++;
        }

        for (const source of sources) {
          platformDistribution[source] = (platformDistribution[source] || 0) + 1;
        }
      } catch {
        // Skip malformed JSON
      }
    }

    // Recent correlation events
    const recentCorrelationEvents = await db.intelligenceEvent.findMany({
      where: { eventType: 'analysis.correlation_found' },
      orderBy: { timestamp: 'desc' },
      take: 10,
      select: {
        id: true,
        aggregateId: true,
        payload: true,
        timestamp: true,
        processed: true,
      },
    });

    // Parse correlation event payloads
    const parsedEvents = recentCorrelationEvents.map(event => {
      let payload: Record<string, unknown> = {};
      try {
        payload = JSON.parse(event.payload);
      } catch {
        // Keep empty payload
      }
      return {
        id: event.id,
        aggregateId: event.aggregateId,
        timestamp: event.timestamp.toISOString(),
        processed: event.processed,
        relationsCreated: payload.relationsCreated ?? 0,
        entitiesUpdated: payload.entitiesUpdated ?? 0,
        patternsUpdated: payload.patternsUpdated ?? 0,
        crossPlatformDetections: payload.crossPlatformDetections ?? 0,
        crossPlatformGroups: payload.crossPlatformGroups ?? [],
      };
    });

    // Active pattern detections by type
    const activePatterns = await db.patternDetection.findMany({
      where: { status: { in: ['active', 'investigating', 'confirmed'] } },
      select: {
        id: true,
        patternType: true,
        severity: true,
        confidence: true,
        occurrences: true,
        status: true,
        lastDetected: true,
      },
      orderBy: { confidence: 'desc' },
    });

    // Agent state for ana-cro
    const correlatorAgent = await db.agentState.findUnique({
      where: { agentId: 'ana-cro' },
    });

    return NextResponse.json({
      relations: {
        total: totalRelations,
        communicatesWith: communicatesWithCount,
        mentions: mentionsCount,
      },
      entities: {
        crossPlatform: crossPlatformEntityCount,
        total: allEntities.length,
        platformDistribution,
      },
      patterns: activePatterns.map(p => ({
        id: p.id,
        type: p.patternType,
        severity: p.severity,
        confidence: p.confidence,
        occurrences: p.occurrences,
        status: p.status,
        lastDetected: p.lastDetected.toISOString(),
      })),
      recentEvents: parsedEvents,
      agent: correlatorAgent
        ? {
            agentId: correlatorAgent.agentId,
            name: correlatorAgent.name,
            status: correlatorAgent.status,
            health: correlatorAgent.health,
            messagesProcessed: correlatorAgent.messagesProcessed,
            lastHeartbeat: correlatorAgent.lastHeartbeat?.toISOString() ?? null,
          }
        : null,
    });
  } catch (error) {
    console.error('[Correlation] GET error:', error);
    return NextResponse.json(
      { error: 'Internal server error fetching correlation stats' },
      { status: 500 }
    );
  }
}

export const GET = withAuth(_GET);
export const POST = withAuth(_POST);
