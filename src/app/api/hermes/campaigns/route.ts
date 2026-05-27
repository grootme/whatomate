import { NextResponse } from 'next/server';
import { fetchService } from '@/lib/intelligence/service-client';

export async function GET() {
  // Try to fetch campaigns from Hermes service
  const result = await fetchService<Record<string, unknown>[]>('hermes', '/campaigns');

  if (result.data && Array.isArray(result.data)) {
    return NextResponse.json({ campaigns: result.data });
  }

  // No fallback — campaigns come from Hermes/WhatsApp Business API
  return NextResponse.json({ campaigns: [] });
}
