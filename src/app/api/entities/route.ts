import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/intelligence/auth';
import { db } from '@/lib/db';
import { persistEvent } from '@/lib/intelligence/event-persist';

// ===== GET /api/entities =====
// List entities with filtering (by type, riskLevel, source, search) and pagination

async function _GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);

    // Filters
    const type = searchParams.get('type');
    const riskLevel = searchParams.get('riskLevel');
    const source = searchParams.get('source');
    const search = searchParams.get('search');

    // Pagination
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '20', 10)));
    const offset = (page - 1) * limit;

    // Build where clause
    const where: any = {};

    if (type) {
      where.type = type;
    }

    if (riskLevel) {
      // Support comma-separated risk levels
      const levels = riskLevel.split(',').map((l) => l.trim());
      if (levels.length === 1) {
        where.riskLevel = levels[0];
      } else {
        where.riskLevel = { in: levels };
      }
    }

    if (source) {
      // Source is stored in platformIds JSON; filter using contains on the JSON string
      where.platformIds = { contains: source };
    }

    if (search) {
      // Search by name or aliases
      where.OR = [
        { name: { contains: search } },
        { aliases: { contains: search } },
      ];
    }

    const [entities, totalCount] = await Promise.all([
      db.entity.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        skip: offset,
        take: limit,
      }),
      db.entity.count({ where }),
    ]);

    // Parse JSON fields for response
    const formatted = entities.map((e) => ({
      id: e.id,
      name: e.name,
      type: e.type,
      aliases: e.aliases ? JSON.parse(e.aliases) : [],
      riskScore: e.riskScore,
      riskLevel: e.riskLevel,
      platformIds: e.platformIds ? JSON.parse(e.platformIds) : {},
      firstSeen: e.firstSeen.toISOString(),
      lastSeen: e.lastSeen.toISOString(),
      mentionCount: e.mentionCount,
      metadata: e.metadata ? JSON.parse(e.metadata) : {},
      createdAt: e.createdAt.toISOString(),
      updatedAt: e.updatedAt.toISOString(),
    }));

    return NextResponse.json({
      entities: formatted,
      pagination: {
        page,
        limit,
        total: totalCount,
        totalPages: Math.ceil(totalCount / limit),
      },
    });
  } catch (error) {
    console.error('[Entities API] GET error:', error);
    return NextResponse.json(
      { error: 'Internal server error fetching entities' },
      { status: 500 },
    );
  }
}

// ===== POST /api/entities =====
// Create a new entity

async function _POST(request: Request) {
  try {
    const body = await request.json();

    // Validate required fields
    if (!body.name || typeof body.name !== 'string') {
      return NextResponse.json(
        { error: 'Field "name" is required and must be a string' },
        { status: 400 },
      );
    }

    if (!body.type || typeof body.type !== 'string') {
      return NextResponse.json(
        { error: 'Field "type" is required and must be a string' },
        { status: 400 },
      );
    }

    const validTypes = ['person', 'organization', 'location', 'crypto_wallet', 'event'];
    if (!validTypes.includes(body.type)) {
      return NextResponse.json(
        { error: `Field "type" must be one of: ${validTypes.join(', ')}` },
        { status: 400 },
      );
    }

    const validRiskLevels = ['low', 'medium', 'high', 'critical'];
    const riskLevel = body.riskLevel || 'low';
    if (!validRiskLevels.includes(riskLevel)) {
      return NextResponse.json(
        { error: `Field "riskLevel" must be one of: ${validRiskLevels.join(', ')}` },
        { status: 400 },
      );
    }

    const riskScore = typeof body.riskScore === 'number'
      ? Math.min(100, Math.max(0, body.riskScore))
      : 0;

    // Serialize JSON fields
    const aliases = body.aliases
      ? JSON.stringify(Array.isArray(body.aliases) ? body.aliases : [body.aliases])
      : null;
    const platformIds = body.platformIds
      ? JSON.stringify(body.platformIds)
      : null;
    const metadata = body.metadata
      ? JSON.stringify(body.metadata)
      : null;

    const entity = await db.entity.create({
      data: {
        name: body.name,
        type: body.type,
        aliases,
        riskScore,
        riskLevel,
        platformIds,
        mentionCount: body.mentionCount || 0,
        metadata,
      },
    });

    // Persist entity creation event
    await persistEvent('whatomate:entities', {
      eventType: 'analysis.entity_created',
      aggregateId: entity.id,
      aggregateType: 'entity',
      payload: {
        name: entity.name,
        type: entity.type,
        riskScore: entity.riskScore,
        riskLevel: entity.riskLevel,
      },
      metadata: { source: 'api', action: 'create' },
    });

    return NextResponse.json(
      {
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
      { status: 201 },
    );
  } catch (error) {
    console.error('[Entities API] POST error:', error);
    return NextResponse.json(
      { error: 'Internal server error creating entity' },
      { status: 500 },
    );
  }
}

// ===== PUT /api/entities =====
// Update entity (risk score, aliases, metadata) — requires id in body

async function _PUT(request: Request) {
  try {
    const body = await request.json();

    if (!body.id || typeof body.id !== 'string') {
      return NextResponse.json(
        { error: 'Field "id" is required for update' },
        { status: 400 },
      );
    }

    // Check entity exists
    const existing = await db.entity.findUnique({ where: { id: body.id } });
    if (!existing) {
      return NextResponse.json(
        { error: 'Entity not found' },
        { status: 404 },
      );
    }

    // Build update data — only update provided fields
    const updateData: any = {};

    if (body.riskScore !== undefined) {
      updateData.riskScore = Math.min(100, Math.max(0, body.riskScore));
    }

    if (body.riskLevel !== undefined) {
      const validRiskLevels = ['low', 'medium', 'high', 'critical'];
      if (!validRiskLevels.includes(body.riskLevel)) {
        return NextResponse.json(
          { error: `Field "riskLevel" must be one of: ${validRiskLevels.join(', ')}` },
          { status: 400 },
        );
      }
      updateData.riskLevel = body.riskLevel;
    }

    if (body.aliases !== undefined) {
      updateData.aliases = JSON.stringify(
        Array.isArray(body.aliases) ? body.aliases : [body.aliases],
      );
    }

    if (body.metadata !== undefined) {
      updateData.metadata = JSON.stringify(body.metadata);
    }

    if (body.platformIds !== undefined) {
      updateData.platformIds = JSON.stringify(body.platformIds);
    }

    if (body.name !== undefined) {
      updateData.name = body.name;
    }

    if (body.mentionCount !== undefined) {
      updateData.mentionCount = body.mentionCount;
    }

    if (body.lastSeen !== undefined) {
      updateData.lastSeen = new Date(body.lastSeen);
    }

    const entity = await db.entity.update({
      where: { id: body.id },
      data: updateData,
    });

    // Persist entity update event
    await persistEvent('whatomate:entities', {
      eventType: 'analysis.entity_updated',
      aggregateId: entity.id,
      aggregateType: 'entity',
      payload: {
        name: entity.name,
        type: entity.type,
        riskScore: entity.riskScore,
        riskLevel: entity.riskLevel,
        updatedFields: Object.keys(updateData),
      },
      metadata: { source: 'api', action: 'update' },
    });

    return NextResponse.json({
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
    });
  } catch (error) {
    console.error('[Entities API] PUT error:', error);
    return NextResponse.json(
      { error: 'Internal server error updating entity' },
      { status: 500 },
    );
  }
}

export const GET = withAuth(_GET);
export const POST = withAuth(_POST);
export const PUT = withAuth(_PUT);
