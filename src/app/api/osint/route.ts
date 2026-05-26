import { NextResponse } from 'next/server';
import { mockOsintData } from '@/lib/mock-data';

export async function GET() {
  return NextResponse.json({
    earthquakes: mockOsintData.earthquakes,
    flights: mockOsintData.flights,
    weather: mockOsintData.weather,
    crypto: mockOsintData.crypto,
    lastUpdated: new Date().toISOString(),
    sources: {
      usgs: { status: 'active', lastSync: '2 min ago' },
      emsc: { status: 'active', lastSync: '5 min ago' },
      flightAware: { status: 'active', lastSync: '1 min ago' },
      openWeather: { status: 'active', lastSync: '10 min ago' },
      coinGecko: { status: 'active', lastSync: '30s ago' },
      shadowbroker: { status: 'active', lastSync: '3 min ago' },
    },
  });
}
