/**
 * INNOVATION 3: OSINT-to-Entity Correlation Bridge
 *
 * Bridges the gap between OSINT data (earthquakes, weather alerts, etc.)
 * and the entity graph. When OSINT events arrive:
 * - Extracts location names from OSINT data
 * - Searches for existing entities of type 'location' matching those names
 * - If found, updates entity lastSeen and increments mentionCount
 * - If not found, creates new location entity
 *
 * This ensures that OSINT events are reflected in the entity graph,
 * enabling cross-correlation between message-based entities and
 * real-world events.
 *
 * RICCO Patterns:
 * - Event Sourcing: All bridge operations recorded as events
 * - Strategy Pattern: Different extractors per OSINT data type
 */

import { db } from '@/lib/db';
import { persistEvent } from './event-persist';
import type { OsintSnapshot, EventStream } from './types';

// ===== TYPES =====

export interface BridgeResult {
  locationsExtracted: number;
  entitiesCreated: number;
  entitiesUpdated: number;
  bridgeId: string;
}

// ===== LOCATION NAME EXTRACTION =====

/**
 * Extract location names from earthquake data.
 * Earthquake records have a `location` field.
 */
function extractEarthquakeLocations(earthquakes: NonNullable<OsintSnapshot['earthquakes']>): string[] {
  return earthquakes
    .map(eq => eq.location)
    .filter((loc): loc is string => !!loc && loc.length > 1);
}

/**
 * Extract location names from weather alerts.
 * Extreme events may contain location names.
 */
function extractWeatherLocations(weather: OsintSnapshot['weather']): string[] {
  if (!weather || !weather.extremeEvents) return [];
  // Weather extreme events may contain location info like "Tormenta en Madrid"
  return weather.extremeEvents
    .map(event => {
      // Try to extract location from event text
      const parts = event.split(/\s+(?:en|de|del|da|in|at|of)\s+/i);
      return parts.length > 1 ? parts[parts.length - 1].trim() : '';
    })
    .filter(loc => loc.length > 2);
}

/**
 * Extract location names from fire data.
 * Fire records have a `location` field.
 */
function extractFireLocations(fires: NonNullable<OsintSnapshot['fires']>): string[] {
  return fires
    .map(fire => fire.location)
    .filter((loc): loc is string => !!loc && loc.length > 1);
}

/**
 * Extract location names from ship data (using zone/port if available).
 * Ship data doesn't have explicit location names, so we derive from coordinates.
 */
function extractShipLocations(ships: NonNullable<OsintSnapshot['ships']>): string[] {
  // Ships don't have explicit location names; use "Maritime:{lat},{lon}" as identifier
  return ships
    .map(ship => `Maritime:${ship.lat.toFixed(1)},${ship.lon.toFixed(1)}`)
    .filter(loc => loc.length > 1);
}

/**
 * Extract location names from GDELT events.
 */
function extractGdeltLocations(gdelt: NonNullable<OsintSnapshot['gdelt']>): string[] {
  // GDELT event names often contain location info
  return gdelt
    .map(event => event.name)
    .filter((name): name is string => !!name && name.length > 2);
}

/**
 * Extract location names from news articles.
 */
function extractNewsLocations(news: NonNullable<OsintSnapshot['news']>): string[] {
  // News category may contain location info
  return news
    .map(article => article.category || '')
    .filter(cat => cat.length > 2);
}

// ===== MAIN BRIDGE FUNCTION =====

/**
 * Process OSINT data and bridge location names to the entity graph.
 *
 * 1. Extract location names from all OSINT data types
 * 2. For each location, search for existing 'location' entity
 * 3. If found: update lastSeen, increment mentionCount
 * 4. If not found: create new location entity
 * 5. Emit bridge event
 */
export async function bridgeOsintToEntities(osintData: OsintSnapshot): Promise<BridgeResult> {
  const now = new Date();
  const bridgeId = `osint_bridge_${Date.now()}`;

  // Step 1: Extract all location names
  const allLocations = new Set<string>([
    ...extractEarthquakeLocations(osintData.earthquakes ?? []),
    ...extractWeatherLocations(osintData.weather),
    ...extractFireLocations(osintData.fires ?? []),
    ...extractShipLocations(osintData.ships ?? []),
    ...extractGdeltLocations(osintData.gdelt ?? []),
    ...extractNewsLocations(osintData.news ?? []),
  ]);

  let entitiesCreated = 0;
  let entitiesUpdated = 0;

  // Step 2: For each location, find or create entity
  for (const locationName of allLocations) {
    // Search for existing location entity with this name (case-insensitive)
    const existing = await db.entity.findFirst({
      where: {
        type: 'location',
        name: { contains: locationName },
      },
    });

    if (existing) {
      // Update existing entity: bump lastSeen and mentionCount
      await db.entity.update({
        where: { id: existing.id },
        data: {
          lastSeen: now,
          mentionCount: existing.mentionCount + 1,
        },
      });
      entitiesUpdated++;
    } else {
      // Create new location entity
      await db.entity.create({
        data: {
          name: locationName,
          type: 'location',
          riskScore: 10, // Low default risk for locations
          riskLevel: 'low',
          mentionCount: 1,
          firstSeen: now,
          lastSeen: now,
          platformIds: JSON.stringify({ osint: [`loc_${locationName.replace(/\s+/g, '_').toLowerCase()}`] }),
          metadata: JSON.stringify({
            source: 'osint_bridge',
            bridgeId,
            createdAt: now.toISOString(),
          }),
        },
      });
      entitiesCreated++;
    }
  }

  // Step 3: Emit bridge event
  const stream: EventStream = 'whatomate:intel_events';
  await persistEvent(stream, {
    eventType: 'analysis.correlation_found',
    aggregateId: bridgeId,
    aggregateType: 'entity',
    payload: {
      action: 'osint_entity_bridge',
      locationsExtracted: allLocations.size,
      entitiesCreated,
      entitiesUpdated,
      locationNames: Array.from(allLocations).slice(0, 50), // Cap at 50 for event size
    },
    metadata: {
      source: 'osint-entity-bridge',
      bridgeId,
    },
  });

  console.log(
    `[OsintEntityBridge] Bridge ${bridgeId}: ${allLocations.size} locations → ${entitiesCreated} created, ${entitiesUpdated} updated`
  );

  return {
    locationsExtracted: allLocations.size,
    entitiesCreated,
    entitiesUpdated,
    bridgeId,
  };
}
