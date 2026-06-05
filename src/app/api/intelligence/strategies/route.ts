import { NextRequest, NextResponse } from 'next/server';
import { fetchService } from '@/lib/intelligence/service-client';

/**
 * GET /api/intelligence/strategies
 *
 * Proxies to the intelligence engine on port 8900 at /api/v1/strategies.
 * Returns the strategy list.
 */
export async function GET() {
  try {
    const result = await fetchService<Record<string, unknown>>('intelligenceEngine', '/strategies');

    if (result.error) {
      console.warn('[api/intelligence/strategies] Intelligence engine unavailable:', result.error);
      return NextResponse.json(
        {
          strategies: [],
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
    const message = err instanceof Error ? err.message : 'Failed to fetch strategies';
    console.error('[api/intelligence/strategies] Error:', message);
    return NextResponse.json(
      {
        strategies: [],
        error: message,
        source: 'intelligence-engine',
        timestamp: new Date().toISOString(),
      },
      { status: 500 },
    );
  }
}

/**
 * POST /api/intelligence/strategies
 *
 * Proxies strategy execution requests to the intelligence engine on port 8900
 * at /api/v1/strategies/{name}/execute.
 *
 * Expects body: { name: string, ...executionParams }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const strategyName = body.name as string | undefined;

    if (!strategyName) {
      return NextResponse.json(
        { error: 'Missing "name" field in request body' },
        { status: 400 },
      );
    }

    const result = await fetchService<Record<string, unknown>>(
      'intelligenceEngine',
      `/strategies/${encodeURIComponent(strategyName)}/execute`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      },
    );

    if (result.error) {
      console.warn(`[api/intelligence/strategies] Execute "${strategyName}" failed:`, result.error);
      return NextResponse.json(
        {
          executed: false,
          error: result.error,
          strategy: strategyName,
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
        strategy: strategyName,
        latency: result.latency,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to execute strategy';
    console.error('[api/intelligence/strategies] POST Error:', message);
    return NextResponse.json(
      {
        executed: false,
        error: message,
        source: 'intelligence-engine',
        timestamp: new Date().toISOString(),
      },
      { status: 500 },
    );
  }
}
