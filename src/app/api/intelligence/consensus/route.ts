import { NextResponse } from 'next/server';
import { fetchService } from '@/lib/intelligence/service-client';

/**
 * GET /api/intelligence/consensus
 *
 * Proxies to the intelligence engine on port 8900 at /api/v1/consensus.
 * Returns multi-agent consensus data.
 */
export async function GET() {
  try {
    const result = await fetchService<Record<string, unknown>>('intelligenceEngine', '/consensus');

    if (result.error) {
      console.warn('[api/intelligence/consensus] Intelligence engine unavailable:', result.error);
      return NextResponse.json(
        {
          votes: [],
          consensusLevel: 'unknown',
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
    const message = err instanceof Error ? err.message : 'Failed to fetch consensus';
    console.error('[api/intelligence/consensus] Error:', message);
    return NextResponse.json(
      {
        votes: [],
        consensusLevel: 'unknown',
        error: message,
        source: 'intelligence-engine',
        timestamp: new Date().toISOString(),
      },
      { status: 500 },
    );
  }
}
