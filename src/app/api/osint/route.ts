import { NextResponse } from 'next/server';
import { fetchService } from '@/lib/intelligence/service-client';
import { withAuth } from '@/lib/intelligence/auth';

async function _GET() {
  try {
    // ===== Try Go backend first =====
    const goResult = await fetchService<Record<string, unknown>>('goBackend', '/threat-feed');
    if (!goResult.error && goResult.data) {
      return NextResponse.json(goResult.data);
    }

    // ===== Fallback to local Next.js intelligence engine =====
    console.warn('[api/osint] Go backend unavailable, using local fallback:', goResult.error);

    // Fetch real OSINT data from all sources
    const [report, threat, events] = await Promise.all([
      fetchService<Record<string, unknown>>('osint', '/report'),
      fetchService<Record<string, unknown>>('osint', '/threat'),
      fetchService<Record<string, unknown>>('osint', '/events'),
    ]);

    // Also fetch from AI bridge for analyzed intel
    const aiAnalyses = await fetchService<unknown[]>('shadowbrokerAi', '/analyses');
    const intelEvents = await fetchService<unknown[]>('shadowbrokerAi', '/intel-events');

    const osintData = {
      earthquakes: (events.data as Record<string, unknown>)?.earthquakes ?? (report.data as Record<string, unknown>)?.earthquakes ?? [],
      flights: (events.data as Record<string, unknown>)?.flights ?? (report.data as Record<string, unknown>)?.flights ?? [],
      weather: (events.data as Record<string, unknown>)?.weather ?? (report.data as Record<string, unknown>)?.weather ?? { activeAlerts: 0, extremeEvents: [] },
      crypto: (events.data as Record<string, unknown>)?.crypto ?? (report.data as Record<string, unknown>)?.crypto ?? [],
      fires: (events.data as Record<string, unknown>)?.fires ?? (report.data as Record<string, unknown>)?.fires ?? [],
      ships: (events.data as Record<string, unknown>)?.ships ?? (report.data as Record<string, unknown>)?.ships ?? [],
      threatLevel: (threat.data as Record<string, unknown>)?.level ?? 'UNKNOWN',
      aiAnalyses: aiAnalyses.data ?? [],
      intelEvents: intelEvents.data ?? [],
      serviceStatus: {
        osint: !report.error,
        aiBridge: !aiAnalyses.error,
      },
    };

    return NextResponse.json(osintData);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export const GET = withAuth(_GET);
