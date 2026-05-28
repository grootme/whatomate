import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/intelligence/auth';
import { db } from '@/lib/db';
import type { EntityType, RiskLevel, RelationType } from '@/lib/intelligence/types';

// ===== GET: Entity Relationship Graph Data =====
async function _GET() {
  try {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    // 1. Fetch entities from DB (last 30 days, ordered by riskScore desc, limit 100)
    const entities = await db.entity.findMany({
      where: {
        lastSeen: { gte: thirtyDaysAgo },
      },
      orderBy: { riskScore: 'desc' },
      take: 100,
    });

    if (entities.length === 0) {
      return NextResponse.json({
        nodes: [],
        edges: [],
        stats: {
          totalEntities: 0,
          totalRelations: 0,
          avgRiskScore: 0,
          highRiskCount: 0,
          byType: {},
          bySource: {},
        },
      });
    }

    const entityIds = new Set(entities.map((e) => e.id));

    // 2. Fetch EntityRelations for those entities
    const relations = await db.entityRelation.findMany({
      where: {
        OR: [
          { fromEntityId: { in: Array.from(entityIds) } },
          { toEntityId: { in: Array.from(entityIds) } },
        ],
      },
    });

    // 3. Compute platformIds for each entity (parse JSON)
    const nodes = entities.map((e) => {
      let sources: string[] = [];
      try {
        const parsed = e.platformIds ? JSON.parse(e.platformIds) : null;
        if (parsed && typeof parsed === 'object') {
          sources = Object.keys(parsed);
        }
      } catch {
        // platformIds was not valid JSON — leave sources empty
      }

      return {
        id: e.id,
        name: e.name,
        type: e.type as EntityType,
        riskScore: e.riskScore,
        riskLevel: e.riskLevel as RiskLevel,
        mentionCount: e.mentionCount,
        lastSeen: e.lastSeen.toISOString(),
        sources,
      };
    });

    // Filter edges: only include relations where both endpoints are in our entity set
    const edges = relations
      .filter(
        (r) => entityIds.has(r.fromEntityId) && entityIds.has(r.toEntityId)
      )
      .map((r) => ({
        id: r.id,
        from: r.fromEntityId,
        to: r.toEntityId,
        relationType: r.relationType as RelationType,
        strength: r.strength,
        evidenceCount: r.evidence
          ? (JSON.parse(r.evidence) as string[]).length
          : 0,
      }));

    // 4. Compute stats
    const totalEntities = entities.length;
    const totalRelations = edges.length;
    const avgRiskScore =
      totalEntities > 0
        ? Math.round(
            entities.reduce((sum, e) => sum + e.riskScore, 0) / totalEntities
          )
        : 0;
    const highRiskCount = entities.filter(
      (e) => e.riskLevel === 'high' || e.riskLevel === 'critical'
    ).length;

    // Count by entity type
    const byType: Record<string, number> = {};
    for (const e of entities) {
      byType[e.type] = (byType[e.type] || 0) + 1;
    }

    // Count by source platform
    const bySource: Record<string, number> = {};
    for (const node of nodes) {
      for (const source of node.sources) {
        bySource[source] = (bySource[source] || 0) + 1;
      }
    }

    return NextResponse.json({
      nodes,
      edges,
      stats: {
        totalEntities,
        totalRelations,
        avgRiskScore,
        highRiskCount,
        byType,
        bySource,
      },
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : 'Failed to fetch entity graph data';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export const GET = withAuth(_GET);
