import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/intelligence/auth';
import { getEventTimeline, replayEntity, replayAlert } from '@/lib/intelligence/event-replay';

// ===== GET /api/event-replay =====
// Returns event timeline for an aggregate
// Query params: aggregateId (required), limit (optional, default 50)

async function _GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const aggregateId = searchParams.get('aggregateId');
  const limitParam = searchParams.get('limit');

  if (!aggregateId) {
    return NextResponse.json(
      { error: 'Query parameter "aggregateId" is required' },
      { status: 400 },
    );
  }

  const limit = limitParam ? parseInt(limitParam, 10) : 50;

  if (isNaN(limit) || limit < 1) {
    return NextResponse.json(
      { error: 'Query parameter "limit" must be a positive integer' },
      { status: 400 },
    );
  }

  const timeline = await getEventTimeline(aggregateId, limit);

  return NextResponse.json({
    aggregateId,
    limit,
    count: timeline.length,
    timeline,
  });
}

// ===== POST /api/event-replay =====
// Replay entity or alert state from events
// Body: { type: 'entity'|'alert', id: string, asOf?: string (ISO date) }

async function _POST(request: Request) {
  let body: {
    type?: string;
    id?: string;
    asOf?: string;
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: 'Invalid JSON body' },
      { status: 400 },
    );
  }

  const { type, id, asOf } = body;

  if (!type || !['entity', 'alert'].includes(type)) {
    return NextResponse.json(
      { error: 'Field "type" is required and must be either "entity" or "alert"' },
      { status: 400 },
    );
  }

  if (!id || typeof id !== 'string') {
    return NextResponse.json(
      { error: 'Field "id" is required and must be a string' },
      { status: 400 },
    );
  }

  const asOfDate = asOf ? new Date(asOf) : undefined;

  if (asOf && isNaN(asOfDate!.getTime())) {
    return NextResponse.json(
      { error: 'Field "asOf" must be a valid ISO date string' },
      { status: 400 },
    );
  }

  if (type === 'entity') {
    const result = await replayEntity(id, asOfDate);

    return NextResponse.json({
      type: 'entity',
      state: result.state,
      eventsUsed: result.events,
      meta: {
        replayedAt: result.replayedAt,
        eventCount: result.eventCount,
      },
    });
  }

  if (type === 'alert') {
    const result = await replayAlert(id);

    return NextResponse.json({
      type: 'alert',
      state: result.state,
      eventsUsed: result.events,
      meta: {
        replayedAt: result.replayedAt,
        eventCount: result.eventCount,
      },
    });
  }

  // Unreachable due to validation above, but satisfies TypeScript
  return NextResponse.json(
    { error: 'Invalid replay type' },
    { status: 400 },
  );
}

export const GET = withAuth(_GET);
export const POST = withAuth(_POST);
