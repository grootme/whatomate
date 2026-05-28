/**
 * OSINT Data Processor — Single source of truth for OSINT ingestion.
 *
 * Eliminates duplication between /api/ingestion/osint and /api/scheduler.
 * All OSINT data transformation and persistence logic lives here.
 *
 * RICCO Patterns:
 * - Strategy Pattern: Each OSINT source type has its own processor
 * - Specification Pattern: Data validation before ingestion
 * - Event Sourcing: All state changes as events
 */

import { db } from '@/lib/db';
import { safeEventAppend } from './safe-event';
import { persistEvent } from './event-persist';
import type { OsintSnapshot, EventStream } from './types';

// ===== OSINT DATA TYPES =====

export interface OsintIngestionResult {
  inserted: number;
  duplicates: number;
  maxMagnitude: number;
  militaryFlightCount: number;
  weatherAlertCount: number;
  fireCount: number;
  shipCount: number;
  earthquakeCount: number;
  flightCount: number;
  gdeltCount: number;
  newsCount: number;
}

// ===== MILITARY CALLSIGN DETECTION =====

const MILITARY_CALLSIGN_PREFIXES = ['EVAC', 'DUKE', 'REACH', 'FEAR', 'RAM', 'NIGHT', 'VIPER', 'HAVOC', 'RESCUE'] as const;

function isMilitaryFlight(callsign?: string, type?: string): boolean {
  if (type?.toLowerCase().includes('military')) return true;
  if (!callsign) return false;
  return MILITARY_CALLSIGN_PREFIXES.some(prefix => callsign.startsWith(prefix));
}

// ===== INDIVIDUAL OSINT PROCESSORS =====

interface ProcessorContext {
  now: Date;
  source: 'osint';
}

async function processEarthquakes(
  earthquakes: NonNullable<OsintSnapshot['earthquakes']>,
  ctx: ProcessorContext
): Promise<{ inserted: number; duplicates: number; maxMagnitude: number }> {
  let inserted = 0;
  let duplicates = 0;
  let maxMagnitude = 0;

  for (const eq of earthquakes) {
    const sourceId = `eq_${eq.location}_${eq.time}_${eq.magnitude}`;
    const contentHash = `osint:${sourceId}:${(eq.location + eq.magnitude).substring(0, 50)}`;

    const existing = await db.rawMessage.findUnique({
      where: { source_sourceId: { source: 'osint', sourceId } },
    });

    if (existing) {
      duplicates++;
      continue;
    }

    await db.rawMessage.create({
      data: {
        source: 'osint',
        sourceId,
        channelName: 'Earthquakes',
        channelId: 'osint_earthquakes',
        senderName: eq.source || 'USGS/EMSC',
        content: `Earthquake: ${eq.location} - Magnitude ${eq.magnitude}, Depth ${eq.depth}km at ${eq.time}`,
        contentHash,
        timestamp: eq.time ? new Date(eq.time) : ctx.now,
        metadata: JSON.stringify({
          type: 'earthquake',
          magnitude: eq.magnitude,
          depth: eq.depth,
          location: eq.location,
          source: eq.source,
        }),
      },
    });

    inserted++;
    if (eq.magnitude > maxMagnitude) maxMagnitude = eq.magnitude;
  }

  return { inserted, duplicates, maxMagnitude };
}

async function processFlights(
  flights: NonNullable<OsintSnapshot['flights']>,
  ctx: ProcessorContext
): Promise<{ inserted: number; duplicates: number; militaryFlightCount: number }> {
  let inserted = 0;
  let duplicates = 0;
  let militaryFlightCount = 0;

  for (const flight of flights) {
    const sourceId = `flight_${flight.callsign}_${flight.time}`;
    const contentHash = `osint:${sourceId}:${flight.callsign?.substring(0, 50) || 'unknown'}`;

    const existing = await db.rawMessage.findUnique({
      where: { source_sourceId: { source: 'osint', sourceId } },
    });

    if (existing) {
      duplicates++;
      continue;
    }

    const military = isMilitaryFlight(flight.callsign, flight.type);
    if (military) militaryFlightCount++;

    await db.rawMessage.create({
      data: {
        source: 'osint',
        sourceId,
        channelName: 'Flights',
        channelId: 'osint_flights',
        senderName: flight.type || 'ADS-B',
        content: `Flight: ${flight.callsign} (${flight.type}) - Alt: ${flight.altitude}ft, Hdg: ${flight.heading}°, Zone: ${flight.zone} at ${flight.time}`,
        contentHash,
        timestamp: flight.time ? new Date(flight.time) : ctx.now,
        metadata: JSON.stringify({
          type: 'flight',
          callsign: flight.callsign,
          flightType: flight.type,
          altitude: flight.altitude,
          heading: flight.heading,
          zone: flight.zone,
          isMilitary: military,
        }),
      },
    });

    inserted++;
  }

  return { inserted, duplicates, militaryFlightCount };
}

async function processWeather(
  weather: OsintSnapshot['weather'],
  ctx: ProcessorContext
): Promise<{ inserted: number; duplicates: number; alertCount: number }> {
  if (!weather || (weather.activeAlerts === 0 && (weather.extremeEvents?.length ?? 0) === 0)) {
    return { inserted: 0, duplicates: 0, alertCount: 0 };
  }

  const sourceId = `weather_${ctx.now.toISOString().split('T')[0]}`;
  const contentHash = `osint:${sourceId}:weather_alerts`;

  const existing = await db.rawMessage.findUnique({
    where: { source_sourceId: { source: 'osint', sourceId } },
  });

  if (existing) {
    return { inserted: 0, duplicates: 1, alertCount: weather.activeAlerts };
  }

  await db.rawMessage.create({
    data: {
      source: 'osint',
      sourceId,
      channelName: 'Weather',
      channelId: 'osint_weather',
      senderName: 'AEMET/NOAA',
      content: `Weather Alert: ${weather.activeAlerts} active alerts. Extreme events: ${weather.extremeEvents?.join(', ') || 'None'}`,
      contentHash,
      timestamp: ctx.now,
      metadata: JSON.stringify({
        type: 'weather',
        activeAlerts: weather.activeAlerts,
        extremeEvents: weather.extremeEvents,
      }),
    },
  });

  return { inserted: 1, duplicates: 0, alertCount: weather.activeAlerts };
}

async function processFires(
  fires: NonNullable<OsintSnapshot['fires']>,
  ctx: ProcessorContext
): Promise<{ inserted: number; duplicates: number }> {
  let inserted = 0;
  let duplicates = 0;

  for (const fire of fires) {
    const sourceId = `fire_${fire.lat}_${fire.lon}_${fire.confidence}`;
    const contentHash = `osint:${sourceId}:${fire.location?.substring(0, 50) || `${fire.lat},${fire.lon}`}`;

    const existing = await db.rawMessage.findUnique({
      where: { source_sourceId: { source: 'osint', sourceId } },
    });

    if (existing) {
      duplicates++;
      continue;
    }

    await db.rawMessage.create({
      data: {
        source: 'osint',
        sourceId,
        channelName: 'Fires',
        channelId: 'osint_fires',
        senderName: 'NASA FIRMS',
        content: `Fire detected: ${fire.location} - Confidence: ${fire.confidence}%, Coords: ${fire.lat},${fire.lon}`,
        contentHash,
        timestamp: ctx.now,
        metadata: JSON.stringify({
          type: 'fire',
          location: fire.location,
          confidence: fire.confidence,
          lat: fire.lat,
          lon: fire.lon,
        }),
      },
    });

    inserted++;
  }

  return { inserted, duplicates };
}

async function processShips(
  ships: NonNullable<OsintSnapshot['ships']>,
  ctx: ProcessorContext
): Promise<{ inserted: number; duplicates: number }> {
  let inserted = 0;
  let duplicates = 0;

  for (const ship of ships) {
    const sourceId = `ship_${ship.name}_${ship.lat}_${ship.lon}`;
    const contentHash = `osint:${sourceId}:${ship.name?.substring(0, 50) || 'unknown'}`;

    const existing = await db.rawMessage.findUnique({
      where: { source_sourceId: { source: 'osint', sourceId } },
    });

    if (existing) {
      duplicates++;
      continue;
    }

    await db.rawMessage.create({
      data: {
        source: 'osint',
        sourceId,
        channelName: 'Maritime',
        channelId: 'osint_ships',
        senderName: 'AIS/MarineTraffic',
        content: `Vessel: ${ship.name} (${ship.type}) - Speed: ${ship.speed}kts, Coords: ${ship.lat},${ship.lon}`,
        contentHash,
        timestamp: ctx.now,
        metadata: JSON.stringify({
          type: 'ship',
          name: ship.name,
          shipType: ship.type,
          lat: ship.lat,
          lon: ship.lon,
          speed: ship.speed,
        }),
      },
    });

    inserted++;
  }

  return { inserted, duplicates };
}

async function processGdelt(
  gdelt: NonNullable<OsintSnapshot['gdelt']>,
  ctx: ProcessorContext
): Promise<{ inserted: number; duplicates: number }> {
  let inserted = 0;
  let duplicates = 0;

  for (const event of gdelt) {
    const sourceId = `gdelt_${event.name}_${event.date || ''}`;
    const contentHash = `osint:${sourceId}:${event.name?.substring(0, 50) || 'unknown'}`;

    const existing = await db.rawMessage.findUnique({
      where: { source_sourceId: { source: 'osint', sourceId } },
    });

    if (existing) {
      duplicates++;
      continue;
    }

    await db.rawMessage.create({
      data: {
        source: 'osint',
        sourceId,
        channelName: 'GDELT',
        channelId: 'osint_gdelt',
        senderName: event.source || 'GDELT',
        content: `GDELT Event: ${event.name}${event.url ? ` - ${event.url}` : ''}`,
        contentHash,
        timestamp: event.date ? new Date(event.date) : ctx.now,
        metadata: JSON.stringify({
          type: 'gdelt',
          name: event.name,
          url: event.url,
          date: event.date,
          source: event.source,
        }),
      },
    });

    inserted++;
  }

  return { inserted, duplicates };
}

async function processNews(
  news: NonNullable<OsintSnapshot['news']>,
  ctx: ProcessorContext
): Promise<{ inserted: number; duplicates: number }> {
  let inserted = 0;
  let duplicates = 0;

  for (const article of news) {
    const sourceId = `news_${article.title}_${article.source}`;
    const contentHash = `osint:${sourceId}:${article.title?.substring(0, 50) || 'unknown'}`;

    const existing = await db.rawMessage.findUnique({
      where: { source_sourceId: { source: 'osint', sourceId } },
    });

    if (existing) {
      duplicates++;
      continue;
    }

    await db.rawMessage.create({
      data: {
        source: 'osint',
        sourceId,
        channelName: 'News',
        channelId: 'osint_news',
        senderName: article.source,
        content: `News: ${article.title} (${article.source})${article.category ? ` [${article.category}]` : ''}`,
        contentHash,
        timestamp: article.publishedAt ? new Date(article.publishedAt) : ctx.now,
        metadata: JSON.stringify({
          type: 'news',
          title: article.title,
          source: article.source,
          url: article.url,
          publishedAt: article.publishedAt,
          category: article.category,
        }),
      },
    });

    inserted++;
  }

  return { inserted, duplicates };
}

// ===== MAIN OSINT PROCESSOR =====

/**
 * Ingest OSINT data from an OsintSnapshot into the RawMessage table.
 * Used by /api/ingestion/osint and /api/scheduler.
 */
export async function ingestOsintData(osintData: OsintSnapshot): Promise<OsintIngestionResult> {
  const now = new Date();
  const ctx: ProcessorContext = { now, source: 'osint' };

  // Run all OSINT processors
  const [eqResult, flightResult, weatherResult, fireResult, shipResult, gdeltResult, newsResult] = await Promise.all([
    processEarthquakes(osintData.earthquakes ?? [], ctx),
    processFlights(osintData.flights ?? [], ctx),
    processWeather(osintData.weather, ctx),
    processFires(osintData.fires ?? [], ctx),
    processShips(osintData.ships ?? [], ctx),
    processGdelt(osintData.gdelt ?? [], ctx),
    processNews(osintData.news ?? [], ctx),
  ]);

  const result: OsintIngestionResult = {
    inserted: eqResult.inserted + flightResult.inserted + weatherResult.inserted + fireResult.inserted + shipResult.inserted + gdeltResult.inserted + newsResult.inserted,
    duplicates: eqResult.duplicates + flightResult.duplicates + weatherResult.duplicates + fireResult.duplicates + shipResult.duplicates + gdeltResult.duplicates + newsResult.duplicates,
    maxMagnitude: eqResult.maxMagnitude,
    militaryFlightCount: flightResult.militaryFlightCount,
    weatherAlertCount: weatherResult.alertCount,
    fireCount: osintData.fires?.length ?? 0,
    shipCount: osintData.ships?.length ?? 0,
    earthquakeCount: osintData.earthquakes?.length ?? 0,
    flightCount: osintData.flights?.length ?? 0,
    gdeltCount: osintData.gdelt?.length ?? 0,
    newsCount: osintData.news?.length ?? 0,
  };

  // Update threshold currentValues with OSINT data
  if (result.maxMagnitude > 0) {
    const eqThreshold = await db.thresholdConfig.findFirst({ where: { metric: 'earthquake_magnitude' } });
    if (eqThreshold) await db.thresholdConfig.update({ where: { id: eqThreshold.id }, data: { currentValue: result.maxMagnitude } });
  }

  const flightsThreshold = await db.thresholdConfig.findFirst({ where: { metric: 'military_flights' } });
  if (flightsThreshold) await db.thresholdConfig.update({ where: { id: flightsThreshold.id }, data: { currentValue: result.militaryFlightCount } });

  const weatherThreshold = await db.thresholdConfig.findFirst({ where: { metric: 'weather_alerts' } });
  if (weatherThreshold) await db.thresholdConfig.update({ where: { id: weatherThreshold.id }, data: { currentValue: result.weatherAlertCount } });

  const gdeltThreshold = await db.thresholdConfig.findFirst({ where: { metric: 'gdelt_events' } });
  if (gdeltThreshold) await db.thresholdConfig.update({ where: { id: gdeltThreshold.id }, data: { currentValue: result.gdeltCount } });

  // Update OSINT agent state
  const agentState = await db.agentState.findUnique({ where: { agentId: 'ing-os' } });

  if (agentState) {
    await db.agentState.update({
      where: { agentId: 'ing-os' },
      data: {
        status: 'active',
        health: Math.min(100, 70 + Math.min(30, result.inserted * 3)),
        lastHeartbeat: now,
        messagesProcessed: agentState.messagesProcessed + result.inserted,
        startedAt: agentState.startedAt ?? now,
      },
    });
  } else {
    await db.agentState.create({
      data: {
        agentId: 'ing-os',
        name: 'OSINT Shadowbroker',
        layer: 1,
        layerName: 'Ingesta',
        status: 'active',
        health: 90,
        messagesProcessed: result.inserted,
        lastHeartbeat: now,
        startedAt: now,
      },
    });
  }

  // Emit ingestion event
  const batchId = `osint_batch_${Date.now()}`;
  const stream: EventStream = 'whatomate:osint_events';

  safeEventAppend(stream, {
    eventType: 'ingestion.batch_received',
    aggregateId: batchId,
    aggregateType: 'agent',
    payload: {
      source: 'osint',
      inserted: result.inserted,
      duplicates: result.duplicates,
      maxMagnitude: result.maxMagnitude,
      militaryFlights: result.militaryFlightCount,
      weatherAlerts: result.weatherAlertCount,
      fires: result.fireCount,
      ships: result.shipCount,
    },
  });

  await persistEvent(stream, {
    eventType: 'ingestion.batch_received',
    aggregateId: batchId,
    aggregateType: 'agent',
    payload: {
      source: 'osint',
      inserted: result.inserted,
      duplicates: result.duplicates,
      maxMagnitude: result.maxMagnitude,
      militaryFlights: result.militaryFlightCount,
      weatherAlerts: result.weatherAlertCount,
    },
  });

  return result;
}
