import { NextResponse } from 'next/server';
import { fetchService } from '@/lib/intelligence/service-client';

export async function GET() {
  const [status, tools] = await Promise.all([
    fetchService<Record<string, unknown>>('hermes', '/status'),
    fetchService<unknown[]>('hermes', '/tools'),
  ]);

  return NextResponse.json({
    status: status.data ?? { status: 'unavailable' },
    tools: tools.data ?? [],
    connected: !status.error,
  });
}
