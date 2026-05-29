import { NextResponse } from 'next/server';
import { fetchService } from '@/lib/intelligence/service-client';
import { buildMissionGroups, updateMissionsWithOsint, missionRegistry } from '@/lib/intelligence/missions';
import type { OsintSnapshot } from '@/lib/intelligence/types';
import { withAuth } from '@/lib/intelligence/auth';

async function _GET() {
  try {
    // Check microservice availability in parallel
    const [whatsappRes, telegramRes, osintRes] = await Promise.all([
      fetchService<{ connected: boolean }>('whatsapp', '/status'),
      fetchService<{ status: string }>('telegram', '/status'),
      fetchService<OsintSnapshot & { threatLevel?: string }>('osint', '/live-data/osint-snapshot'),
    ]);

    const serviceStatus = {
      whatsapp: !whatsappRes.error,
      telegram: !telegramRes.error,
      osint: !osintRes.error,
    };

    // Build base mission groups from service status
    let missions = buildMissionGroups(serviceStatus);

    // Enrich with live OSINT data if available
    if (!osintRes.error && osintRes.data) {
      const osintData: OsintSnapshot = {
        earthquakes: osintRes.data.earthquakes,
        flights: osintRes.data.flights,
        weather: osintRes.data.weather,
        fires: osintRes.data.fires,
        ships: osintRes.data.ships,
        gdelt: osintRes.data.gdelt,
        news: osintRes.data.news,
      };

      missions = updateMissionsWithOsint(missions, osintData);

      // Compute cross-mission correlations
      const correlations = missionRegistry.findCrossMissionCorrelations(osintData);

      // Register missions in registry for cross-mission queries
      for (const mission of missions) {
        missionRegistry.register(mission);
      }

      return NextResponse.json({
        missions,
        correlations,
        osintAvailable: true,
        services: serviceStatus,
      });
    }

    // Register missions in registry even without OSINT
    for (const mission of missions) {
      missionRegistry.register(mission);
    }

    return NextResponse.json({
      missions,
      correlations: [],
      osintAvailable: false,
      services: serviceStatus,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export const GET = withAuth(_GET);
