import { NextResponse } from 'next/server';
import { fetchService } from '@/lib/intelligence/service-client';

export async function GET() {
  const [dashboard, entities, decisions, summaries] = await Promise.all([
    fetchService<Record<string, unknown>>('cognitive', '/dashboard'),
    fetchService<unknown[]>('cognitive', '/entities'),
    fetchService<unknown[]>('cognitive', '/decisions'),
    fetchService<unknown[]>('cognitive', '/summaries'),
  ]);

  return NextResponse.json({
    dashboard: dashboard.data ?? { status: 'unavailable' },
    entities: entities.data ?? [],
    decisions: decisions.data ?? [],
    summaries: summaries.data ?? [],
    serviceStatus: {
      cognitive: !dashboard.error,
    },
  });
}
