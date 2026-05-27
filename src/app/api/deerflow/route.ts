import { NextResponse } from 'next/server';
import { fetchService } from '@/lib/intelligence/service-client';

export async function GET() {
  // Check if Hermes is available for research tasks
  const status = await fetchService<Record<string, unknown>>('hermes', '/status');

  return NextResponse.json({
    available: !status.error,
    status: status.data ?? { status: 'unavailable' },
    recentResearch: [],
  });
}

export async function POST(request: Request) {
  const { topic } = await request.json();

  // Execute research via Hermes agent
  const result = await fetchService<Record<string, unknown>>('hermes', '/execute', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      task: `Investigar: ${topic}`,
      tools: ['deerflow_research'],
    }),
  });

  return NextResponse.json({
    topic,
    result: result.data,
    error: result.error,
  });
}
