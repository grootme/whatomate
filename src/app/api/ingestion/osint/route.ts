import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { safeEventAppend } from '@/lib/intelligence/safe-event';
import { fetchService } from '@/lib/intelligence/service-client';
import { strategyRegistry } from '@/lib/intelligence/strategies';
import { buildStrategyContext } from '@/lib/intelligence/context-builder';
import type { OsintSnapshot } from '@/lib/intelligence/types';

// ===== GET: Fetch OSINT data from shadowbroker and ingest =====
export async function GET() {
  try {
    // Fetch live OSINT data from shadowbroker service
    const osintResponse = await fetchService<Record<string, unknown>>('osint', '/api/live-data');

    if (osintResponse.error || !osintResponse.data) {
      // Mark agent as error if service unavailable
      const agentState = await db.agentState.findUnique({ where: { agentId: 'ing-os' } });
      if (agentState) {
        await db.agentState.update({
          where: { agentId: 'ing-os' },
          data: { status: 'error', health: Math.max(0, agentState.health - 10) },
        });
      }
      return NextResponse.json({
        error: osintResponse.error || 'No data from OSINT service',
        inserted: 0,
        thresholds: [],
      }, { status: 502 });
    }

    const osintData = osintResponse.data as OsintSnapshot;
    const now = new Date();
    let inserted = 0;
    let duplicates = 0;

    // ===== Process Earthquake Data =====
    const earthquakes = osintData.earthquakes ?? [];
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
          timestamp: eq.time ? new Date(eq.time) : now,
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

    // ===== Process Flight Data =====
    const flights = osintData.flights ?? [];
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

      const isMilitary = flight.type?.toLowerCase().includes('military') ||
                         flight.callsign?.startsWith('EVAC') ||
                         flight.callsign?.startsWith('DUKE') ||
                         flight.callsign?.startsWith('REACH') ||
                         flight.callsign?.startsWith('FEAR');

      if (isMilitary) militaryFlightCount++;

      await db.rawMessage.create({
        data: {
          source: 'osint',
          sourceId,
          channelName: 'Flights',
          channelId: 'osint_flights',
          senderName: flight.type || 'ADS-B',
          content: `Flight: ${flight.callsign} (${flight.type}) - Alt: ${flight.altitude}ft, Hdg: ${flight.heading}°, Zone: ${flight.zone} at ${flight.time}`,
          contentHash,
          timestamp: flight.time ? new Date(flight.time) : now,
          metadata: JSON.stringify({
            type: 'flight',
            callsign: flight.callsign,
            flightType: flight.type,
            altitude: flight.altitude,
            heading: flight.heading,
            zone: flight.zone,
            isMilitary,
          }),
        },
      });
      inserted++;
    }

    // ===== Process Weather Alerts =====
    const weather = osintData.weather;
    let weatherAlertCount = weather?.activeAlerts ?? 0;

    if (weather && (weather.activeAlerts > 0 || (weather.extremeEvents?.length ?? 0) > 0)) {
      const sourceId = `weather_${now.toISOString().split('T')[0]}`;
      const contentHash = `osint:${sourceId}:weather_alerts`;

      const existing = await db.rawMessage.findUnique({
        where: { source_sourceId: { source: 'osint', sourceId } },
      });

      if (!existing) {
        await db.rawMessage.create({
          data: {
            source: 'osint',
            sourceId,
            channelName: 'Weather',
            channelId: 'osint_weather',
            senderName: 'AEMET/NOAA',
            content: `Weather Alert: ${weather.activeAlerts} active alerts. Extreme events: ${weather.extremeEvents?.join(', ') || 'None'}`,
            contentHash,
            timestamp: now,
            metadata: JSON.stringify({
              type: 'weather',
              activeAlerts: weather.activeAlerts,
              extremeEvents: weather.extremeEvents,
            }),
          },
        });
        inserted++;
      } else {
        duplicates++;
      }
    }

    // ===== Process Fire Data =====
    const fires = osintData.fires ?? [];
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
          timestamp: now,
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

    // ===== Process Ship Data =====
    const ships = osintData.ships ?? [];
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
          timestamp: now,
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

    // ===== Update Thresholds =====
    const eqThreshold = await db.thresholdConfig.findFirst({
      where: { metric: 'earthquake_magnitude' },
    });
    if (eqThreshold && maxMagnitude > 0) {
      await db.thresholdConfig.update({
        where: { id: eqThreshold.id },
        data: { currentValue: maxMagnitude },
      });
    }

    const flightsThreshold = await db.thresholdConfig.findFirst({
      where: { metric: 'military_flights' },
    });
    if (flightsThreshold) {
      await db.thresholdConfig.update({
        where: { id: flightsThreshold.id },
        data: { currentValue: militaryFlightCount },
      });
    }

    const weatherThreshold = await db.thresholdConfig.findFirst({
      where: { metric: 'weather_alerts' },
    });
    if (weatherThreshold) {
      await db.thresholdConfig.update({
        where: { id: weatherThreshold.id },
        data: { currentValue: weatherAlertCount },
      });
    }

    // ===== Update AgentState for ing-os =====
    const agentState = await db.agentState.findUnique({ where: { agentId: 'ing-os' } });
    const dataFreshness = osintResponse.latency < 5000 ? 100 : osintResponse.latency < 10000 ? 70 : 40;
    const health = Math.min(100, dataFreshness);

    if (agentState) {
      await db.agentState.update({
        where: { agentId: 'ing-os' },
        data: {
          status: 'active',
          health,
          lastHeartbeat: now,
          messagesProcessed: agentState.messagesProcessed + inserted,
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
          health,
          messagesProcessed: inserted,
          lastHeartbeat: now,
          startedAt: now,
        },
      });
    }

    // ===== Emit event (non-blocking, with timeout) =====
    const batchId = `osint_batch_${Date.now()}`;

    safeEventAppend('whatomate:osint_events', {
      eventType: 'ingestion.batch_received',
      aggregateId: batchId,
      aggregateType: 'agent',
      payload: {
        source: 'osint',
        inserted,
        duplicates,
        maxMagnitude,
        militaryFlights: militaryFlightCount,
        weatherAlerts: weatherAlertCount,
        fires: fires.length,
        ships: ships.length,
        latency: osintResponse.latency,
      },
    });

    // Persist event to SQLite for durability
    await db.intelligenceEvent.create({
      data: {
        eventType: 'ingestion.batch_received',
        aggregateId: batchId,
        aggregateType: 'agent',
        stream: 'whatomate:osint_events',
        payload: JSON.stringify({
          source: 'osint',
          inserted,
          duplicates,
          maxMagnitude,
          militaryFlights: militaryFlightCount,
          weatherAlerts: weatherAlertCount,
        }),
        metadata: JSON.stringify({ latency: osintResponse.latency }),
        processed: false,
      },
    });

    // ===== AUTO-TRIGGER STRATEGY EVALUATION =====
    // After OSINT ingestion, automatically evaluate all 6 strategies
    const strategyResults: Array<{ strategy: string; action: string; confidence: number; reasoning: string }> = [];
    let alertsFromStrategies = 0;

    if (inserted > 0) {
      try {
        const context = await buildStrategyContext();
        // Include OSINT data in context for risk_scoring strategy
        context.osintData = osintData;

        const allStrategies = strategyRegistry.getAll();

        for (const strategy of allStrategies) {
          try {
            const result = await strategyRegistry.evaluateWith(strategy.id, context);
            strategyResults.push({
              strategy: strategy.id,
              action: result.action,
              confidence: result.confidence,
              reasoning: result.reasoning,
            });

            if (result.action === 'alert') {
              alertsFromStrategies++;
            }

            // Create IntelligenceEvent for each strategy result
            await db.intelligenceEvent.create({
              data: {
                eventType: 'monitoring.alert_generated',
                aggregateId: `strategy_${strategy.id}_osint_${Date.now()}`,
                aggregateType: 'alert',
                stream: 'whatomate:decisions',
                payload: JSON.stringify({
                  strategy: strategy.id,
                  action: result.action,
                  severity: result.severity,
                  confidence: result.confidence,
                  reasoning: result.reasoning,
                  triggeredBy: 'osint_ingestion',
                }),
                metadata: JSON.stringify({ strategyId: strategy.id, autoTriggered: true, source: 'osint' }),
                processed: false,
              },
            });
          } catch (err) {
            console.error(`[OSINT Ingestion] Strategy ${strategy.id} auto-evaluation error:`, err);
            strategyResults.push({
              strategy: strategy.id,
              action: 'error',
              confidence: 0,
              reasoning: `Evaluation failed: ${err instanceof Error ? err.message : 'Unknown error'}`,
            });
          }
        }
      } catch (ctxErr) {
        console.error('[OSINT Ingestion] Failed to build strategy context for auto-evaluation:', ctxErr);
      }
    }

    return NextResponse.json({
      inserted,
      duplicates,
      data: {
        earthquakes: earthquakes.length,
        flights: flights.length,
        militaryFlights: militaryFlightCount,
        weatherAlerts: weatherAlertCount,
        fires: fires.length,
        ships: ships.length,
      },
      thresholds: {
        earthquakeMagnitude: maxMagnitude,
        militaryFlights: militaryFlightCount,
        weatherAlerts: weatherAlertCount,
      },
      agent: {
        agentId: 'ing-os',
        health,
        messagesProcessed: (agentState?.messagesProcessed ?? 0) + inserted,
      },
      latency: osintResponse.latency,
      strategyEvaluation: {
        triggered: inserted > 0,
        results: strategyResults,
        alertsGenerated: alertsFromStrategies,
      },
    });
  } catch (error) {
    console.error('[OSINT Ingestion] GET error:', error);
    return NextResponse.json(
      { error: 'Internal server error during OSINT ingestion' },
      { status: 500 }
    );
  }
}
