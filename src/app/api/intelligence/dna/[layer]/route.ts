import { NextRequest, NextResponse } from 'next/server';
import { fetchService } from '@/lib/intelligence/service-client';

/**
 * Valid DNA layer names that can be requested.
 */
const VALID_LAYERS = ['ingestion', 'analysis', 'monitoring', 'reports'] as const;
type DnaLayer = (typeof VALID_LAYERS)[number];

/**
 * GET /api/intelligence/dna/[layer]
 *
 * Proxies to the intelligence engine on port 8900 at /api/v1/dna/{layer}.
 * Returns DNA layer data (ingestion, analysis, monitoring, or reports).
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ layer: string }> },
) {
  const { layer } = await params;

  // Validate the layer parameter
  if (!VALID_LAYERS.includes(layer as DnaLayer)) {
    return NextResponse.json(
      {
        error: `Invalid DNA layer: "${layer}". Valid layers: ${VALID_LAYERS.join(', ')}`,
        validLayers: VALID_LAYERS,
      },
      { status: 400 },
    );
  }

  try {
    const result = await fetchService<Record<string, unknown>>('intelligenceEngine', `/dna/${layer}`);

    if (result.error) {
      console.warn(`[api/intelligence/dna/${layer}] Intelligence engine unavailable:`, result.error);
      return NextResponse.json(
        {
          layer,
          data: [],
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
        layer,
        latency: result.latency,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : `Failed to fetch DNA layer: ${layer}`;
    console.error(`[api/intelligence/dna/${layer}] Error:`, message);
    return NextResponse.json(
      {
        layer,
        data: [],
        error: message,
        source: 'intelligence-engine',
        timestamp: new Date().toISOString(),
      },
      { status: 500 },
    );
  }
}
