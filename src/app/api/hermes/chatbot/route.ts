import { NextResponse } from 'next/server';
import { fetchService } from '@/lib/intelligence/service-client';

export async function GET() {
  // Try to fetch chatbot flows from Hermes service
  const result = await fetchService<Record<string, unknown>[]>('hermes', '/chatbot/flows');

  if (result.data && Array.isArray(result.data)) {
    return NextResponse.json({ flows: result.data });
  }

  // No fallback — chatbot flows come from Hermes/WhatsApp Business API
  return NextResponse.json({ flows: [] });
}
