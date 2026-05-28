import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/intelligence/auth';
import { db } from '@/lib/db';
import { persistEvent } from '@/lib/intelligence/event-persist';

// ===== GET /api/entities/[id] =====
// Single entity with its relations and related alerts

async function _GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;

    const entity = await db.entity.findUnique({
      where: { id },
    });

    if (!entity) {
      return NextResponse.json(
        { error: 'Entity not found' },
        { status: 404 },
      );
    }

    // Get relations where this entity is either source or target
    const [outgoingRelations, incomingRelations] = await Promise.all([
      db.entityRelation.findMany({
        where: { fromEntityId: id },
      }),
      db.entityRelation.findMany({
        where: { toEntityId: id },
      }),
    ]);

    // Resolve related entity names
    const relatedEntityIds = new Set<string>();
    for (const r of [...outgoingRelations, ...incomingRelations]) {
      if (r.fromEntityId !== id) relatedEntityIds.add(r.fromEntityId);
      if (r.toEntityId !== id) relatedEntityIds.add(r.toEntityId);
    }

    const relatedEntities = await db.entity.findMany({
      where: { id: { in: Array.from(relatedEntityIds) } },
      select: { id: true, name: true, type: true, riskScore: true, riskLevel: true },
    });

    const entityMap = new Map(relatedEntities.map((e) => [e.id, e]));

    // Format relations with resolved entity info
    const relations = [
      ...outgoingRelations.map((r) => ({
        id: r.id,
        direction: 'outgoing' as const,
        relatedEntity: entityMap.get(r.toEntityId) || { id: r.toEntityId, name: 'Unknown' },
        relationType: r.relationType,
        strength: r.strength,
        firstSeen: r.firstSeen.toISOString(),
        lastSeen: r.lastSeen.toISOString(),
      })),
      ...incomingRelations.map((r) => ({
        id: r.id,
        direction: 'incoming' as const,
        relatedEntity: entityMap.get(r.fromEntityId) || { id: r.fromEntityId, name: 'Unknown' },
        relationType: r.relationType,
        strength: r.strength,
        firstSeen: r.firstSeen.toISOString(),
        lastSeen: r.lastSeen.toISOString(),
      })),
    ];

    // Get related alerts — alerts that reference this entity via patternIds or relatedEvents
    // Also get alerts from patterns that include this entity
    const patternDetections = await db.patternDetection.findMany({
      where: { entityIds: { contains: id } },
      select: { id: true },
    });

    const patternIds = patternDetections.map((p) => p.id);

    // Get alerts linked to those patterns
    let relatedAlerts: Array<{
      id: string;
      severity: string;
      title: string;
      description: string;
      strategy: string;
      acknowledged: boolean;
      escalated: boolean;
      timestamp: string;
    }> = [];

    if (patternIds.length > 0) {
      // SQLite doesn't support OR with contains easily, so fetch alerts for each pattern
      const alertsFromPatterns = await db.alert.findMany({
        where: {
          patternId: { in: patternIds },
        },
        orderBy: { timestamp: 'desc' },
        take: 20,
      });

      relatedAlerts = alertsFromPatterns.map((a) => ({
        id: a.id,
        severity: a.severity,
        title: a.title,
        description: a.description,
        strategy: a.strategy,
        acknowledged: a.acknowledged,
        escalated: a.escalated,
        timestamp: a.timestamp.toISOString(),
      }));
    }

    // Also get risk assessments for this entity
    const riskAssessments = await db.riskAssessment.findMany({
      where: { entityId: id },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });

    return NextResponse.json({
      entity: {
        id: entity.id,
        name: entity.name,
        type: entity.type,
        aliases: entity.aliases ? JSON.parse(entity.aliases) : [],
        riskScore: entity.riskScore,
        riskLevel: entity.riskLevel,
        platformIds: entity.platformIds ? JSON.parse(entity.platformIds) : {},
        firstSeen: entity.firstSeen.toISOString(),
        lastSeen: entity.lastSeen.toISOString(),
        mentionCount: entity.mentionCount,
        metadata: entity.metadata ? JSON.parse(entity.metadata) : {},
        createdAt: entity.createdAt.toISOString(),
        updatedAt: entity.updatedAt.toISOString(),
      },
      relations,
      relatedAlerts,
      riskAssessments: riskAssessments.map((ra) => ({
        id: ra.id,
        score: ra.score,
        nature: ra.nature,
        volume: ra.volume,
        connections: ra.connections,
        osintContext: ra.osintContext,
        recency: ra.recency,
        strategy: ra.strategy,
        reasoning: ra.reasoning,
        createdAt: ra.createdAt.toISOString(),
      })),
    });
  } catch (error) {
    console.error('[Entities API] GET /:id error:', error);
    return NextResponse.json(
      { error: 'Internal server error fetching entity' },
      { status: 500 },
    );
  }
}

// ===== DELETE /api/entities/[id] =====
// Soft-delete: set riskLevel to 'low' and riskScore to 0

async function _DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;

    const existing = await db.entity.findUnique({ where: { id } });

    if (!existing) {
      return NextResponse.json(
        { error: 'Entity not found' },
        { status: 404 },
      );
    }

    // Soft-delete: reset risk and mark as low
    const entity = await db.entity.update({
      where: { id },
      data: {
        riskLevel: 'low',
        riskScore: 0,
        metadata: existing.metadata
          ? JSON.stringify({
              ...(JSON.parse(existing.metadata) as Record<string, unknown>),
              softDeleted: true,
              deletedAt: new Date().toISOString(),
            })
          : JSON.stringify({
              softDeleted: true,
              deletedAt: new Date().toISOString(),
            }),
      },
    });

    // Persist entity soft-delete event
    await persistEvent('whatomate:entities', {
      eventType: 'analysis.entity_soft_deleted',
      aggregateId: entity.id,
      aggregateType: 'entity',
      payload: {
        name: entity.name,
        type: entity.type,
        previousRiskScore: existing.riskScore,
        previousRiskLevel: existing.riskLevel,
      },
      metadata: { source: 'api', action: 'soft_delete' },
    });

    return NextResponse.json({
      id: entity.id,
      name: entity.name,
      type: entity.type,
      riskScore: entity.riskScore,
      riskLevel: entity.riskLevel,
      softDeleted: true,
      message: 'Entity soft-deleted: risk level reset to low, risk score set to 0',
    });
  } catch (error) {
    console.error('[Entities API] DELETE /:id error:', error);
    return NextResponse.json(
      { error: 'Internal server error deleting entity' },
      { status: 500 },
    );
  }
}

export const GET = withAuth(_GET);
export const DELETE = withAuth(_DELETE);
