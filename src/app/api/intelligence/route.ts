import { NextResponse } from 'next/server';
import { fetchService } from '@/lib/intelligence/service-client';

/**
 * GET /api/intelligence
 *
 * Proxies to the intelligence engine on port 8900 at /api/v1/status.
 * Returns system status with OSINT/Missions/Redis info.
 */
export async function GET() {
  try {
    const result = await fetchService<Record<string, unknown>>('intelligenceEngine', '/status');

    if (result.error) {
      console.warn('[api/intelligence] Intelligence engine unavailable:', result.error);
      return NextResponse.json(
        {
          status: 'unavailable',
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
    const message = err instanceof Error ? err.message : 'Failed to fetch intelligence status';
    console.error('[api/intelligence] Error:', message);
    return NextResponse.json(
      {
        status: 'error',
        error: message,
        source: 'intelligence-engine',
        timestamp: new Date().toISOString(),
      },
      { status: 500 },
    );
  }
}
