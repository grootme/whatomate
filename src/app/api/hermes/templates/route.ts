import { NextResponse } from 'next/server';
import { fetchService } from '@/lib/intelligence/service-client';

export async function GET() {
  // Try to fetch templates from Hermes service
  const result = await fetchService<Record<string, unknown>[]>('hermes', '/templates');

  if (result.data && Array.isArray(result.data)) {
    return NextResponse.json({ templates: result.data });
  }

  // No fallback — templates come from Hermes/WhatsApp Business API
  return NextResponse.json({ templates: [] });
}
