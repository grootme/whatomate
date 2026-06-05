import { NextResponse } from 'next/server';
import { fetchService } from '@/lib/intelligence/service-client';

/**
 * GET /api/intelligence/events
 *
 * Proxies to the intelligence engine on port 8900 at /api/v1/events.
 * Returns the event store data.
 */
export async function GET() {
  try {
    const result = await fetchService<Record<string, unknown>>('intelligenceEngine', '/events');

    if (result.error) {
      console.warn('[api/intelligence/events] Intelligence engine unavailable:', result.error);
      return NextResponse.json(
        {
          events: [],
          error: result.error,
          source: 'intelligence-engine',
          timestamp: new Date().toISOString(),
        },
        { status: 503 },
      );
    }

    return NextResponse.json({
      ...result.data,
      _meta: {
        source: 'intelligence-engine',
        latency: result.latency,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to fetch events';
    console.error('[api/intelligence/events] Error:', message);
    return NextResponse.json(
      {
        events: [],
        error: message,
        source: 'intelligence-engine',
        timestamp: new Date().toISOString(),
      },
      { status: 500 },
    );
  }
}
