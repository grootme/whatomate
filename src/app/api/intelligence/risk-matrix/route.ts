import { NextResponse } from 'next/server';
import { fetchService } from '@/lib/intelligence/service-client';

/**
 * GET /api/intelligence/risk-matrix
 *
 * Proxies to the intelligence engine on port 8900 at /api/v1/risk-matrix.
 * Returns risk matrix with weighted scores.
 */
export async function GET() {
  try {
    const result = await fetchService<Record<string, unknown>>('intelligenceEngine', '/risk-matrix');

    if (result.error) {
      console.warn('[api/intelligence/risk-matrix] Intelligence engine unavailable:', result.error);
      return NextResponse.json(
        {
          dimensions: [],
          overallScore: 0,
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
    const message = err instanceof Error ? err.message : 'Failed to fetch risk matrix';
    console.error('[api/intelligence/risk-matrix] Error:', message);
    return NextResponse.json(
      {
        dimensions: [],
        overallScore: 0,
        error: message,
        source: 'intelligence-engine',
        timestamp: new Date().toISOString(),
      },
      { status: 500 },
    );
  }
}
