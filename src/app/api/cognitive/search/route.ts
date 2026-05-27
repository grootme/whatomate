import { NextRequest, NextResponse } from 'next/server';
import { fetchService } from '@/lib/intelligence/service-client';

// Cognitive Full-Text Search API — proxies to the real Cognitive API
export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get('q') || '';

  if (!query) {
    return NextResponse.json({ results: [] });
  }

  // Delegate search to the Cognitive API
  const result = await fetchService<Record<string, unknown>>(
    'cognitive',
    `/search?q=${encodeURIComponent(query)}`
  );

  if (result.error) {
    return NextResponse.json({
      results: [],
      query,
      total: 0,
      error: result.error,
    });
  }

  const data = result.data ?? {};
  return NextResponse.json({
    results: (data as Record<string, unknown>).results ?? data,
    query,
    total: Array.isArray(data) ? data.length : ((data as Record<string, unknown>).total as number) ?? 0,
  });
}
