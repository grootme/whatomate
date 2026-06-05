import { NextRequest, NextResponse } from 'next/server';
import { fetchService } from '@/lib/intelligence/service-client';

/**
 * GET /api/hermes/[resource]
 *
 * Parameterized handler that replaces the individual hermes sub-routes
 * (chatbot, templates, campaigns). Each resource maps to a specific
 * upstream path on the Hermes service and wraps the response in the
 * expected key so that existing view components remain unchanged.
 *
 * CONSOLIDATES: hermes/chatbot, hermes/templates, hermes/campaigns
 */

const RESOURCE_CONFIG: Record<string, { path: string; wrapper: string }> = {
  chatbot:   { path: '/chatbot/flows', wrapper: 'flows' },
  templates: { path: '/templates',      wrapper: 'templates' },
  campaigns: { path: '/campaigns',      wrapper: 'campaigns' },
};

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ resource: string }> },
) {
  const { resource } = await params;
  const config = RESOURCE_CONFIG[resource];

  if (!config) {
    return NextResponse.json(
      { error: 'Resource not found', validResources: Object.keys(RESOURCE_CONFIG) },
      { status: 404 },
    );
  }

  const result = await fetchService<Record<string, unknown>[]>('hermes', config.path);

  if (!result.error && result.data) {
    return NextResponse.json({ [config.wrapper]: result.data });
  }

  // Graceful fallback — return empty array wrapper so views don't break
  return NextResponse.json({ [config.wrapper]: [] });
}
