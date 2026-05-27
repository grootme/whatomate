import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { safeEventAppend } from '@/lib/intelligence/safe-event';
import { strategyRegistry } from '@/lib/intelligence/strategies';
import { buildStrategyContext } from '@/lib/intelligence/context-builder';
import { fetchService } from '@/lib/intelligence/service-client';
import type { OsintSnapshot } from '@/lib/intelligence/types';

// ===== ANALYSIS KEYWORDS (shared with processing route) =====
const SUSPICIOUS_KEYWORDS = [
  'fraude', 'estafa', 'scam', 'crypto', 'invertir', 'dinero',
  'ganancia', 'lucro', 'pirámide', 'ponzi', 'bitcoin', 'ethereum',
  'lavado', 'blanqueo', 'soborno', 'cohecho', 'corrupción',
  'falso', 'enganar', 'estafar', 'robo', 'hack',
];

const ENTITY_PATTERNS: Record<string, { type: string; patterns: RegExp[] }> = {
  person: {
    type: 'person',
    patterns: [
      /\b(?:Sr|Sra|Srta|Dr|Dra|Don|Doña)\s+[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+(?:\s+[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+){0,3}\b/g,
      /\b(?:llam[ao]|conocid[ao] como|alias)\s+[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+/gi,
    ],
  },
  organization: {
    type: 'organization',
    patterns: [
      /\b(?:empresa|compañía|corporación|grupo|organización|fundación|asociación)\s+[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+/gi,
      /\b[A-ZÁÉÍÓÚÑ]{2,}(?:\s+[A-ZÁÉÍÓÚÑ]{2,}){0,3}\b/g,
    ],
  },
  location: {
    type: 'location',
    patterns: [
      /\b(?:en|desde|hacia|cerca de|zona de|región de)\s+[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+(?:\s+[a-záéíóúñ]+){0,2}/gi,
    ],
  },
  crypto_wallet: {
    type: 'crypto_wallet',
    patterns: [
      /\b0x[a-fA-F0-9]{40}\b/g,
      /\b[13][a-km-zA-HJ-NP-Z1-9]{25,34}\b/g,
      /\bbc1[a-zA-HJ-NP-Z0-9]{25,90}\b/g,
    ],
  },
};

// ===== POST: Run all scheduled tasks =====
export async function POST() {
  const startTime = Date.now();
  const now = new Date();
  const summary: {
    osintIngestion: { success: boolean; inserted: number; error?: string };
    messageProcessing: { success: boolean; processed: number; alertsGenerated: number; entitiesUpdated: number; error?: string };
    strategyEvaluation: { success: boolean; results: Array<{ strategy: string; action: string; confidence: number; reasoning: string }>; alertsGenerated: number; error?: string };
    adaptiveMetrics: { success: boolean; adjustments: string[]; error?: string };
    schedulerEvent: string;
  } = {
    osintIngestion: { success: false, inserted: 0 },
    messageProcessing: { success: false, processed: 0, alertsGenerated: 0, entitiesUpdated: 0 },
    strategyEvaluation: { success: false, results: [], alertsGenerated: 0 },
    adaptiveMetrics: { success: false, adjustments: [] },
    schedulerEvent: '',
  };

  // ===== TASK 1: Fetch and ingest OSINT data =====
  try {
    const osintResponse = await fetchService<Record<string, unknown>>('osint', '/api/live-data');

    if (osintResponse.data && !osintResponse.error) {
      const osintData = osintResponse.data as OsintSnapshot;
      let osintInserted = 0;

      // Process earthquakes
      const earthquakes = osintData.earthquakes ?? [];
      let maxMagnitude = 0;
      for (const eq of earthquakes) {
        const sourceId = `eq_${eq.location}_${eq.time}_${eq.magnitude}`;
        const existing = await db.rawMessage.findUnique({
          where: { source_sourceId: { source: 'osint', sourceId } },
        });
        if (!existing) {
          await db.rawMessage.create({
            data: {
              source: 'osint',
              sourceId,
              channelName: 'Earthquakes',
              channelId: 'osint_earthquakes',
              senderName: eq.source || 'USGS/EMSC',
              content: `Earthquake: ${eq.location} - Magnitude ${eq.magnitude}, Depth ${eq.depth}km at ${eq.time}`,
              contentHash: `osint:${sourceId}:${(eq.location + eq.magnitude).substring(0, 50)}`,
              timestamp: eq.time ? new Date(eq.time) : now,
              metadata: JSON.stringify({ type: 'earthquake', magnitude: eq.magnitude, depth: eq.depth, location: eq.location, source: eq.source }),
            },
          });
          osintInserted++;
          if (eq.magnitude > maxMagnitude) maxMagnitude = eq.magnitude;
        }
      }

      // Process flights
      const flights = osintData.flights ?? [];
      let militaryFlightCount = 0;
      for (const flight of flights) {
        const sourceId = `flight_${flight.callsign}_${flight.time}`;
        const existing = await db.rawMessage.findUnique({
          where: { source_sourceId: { source: 'osint', sourceId } },
        });
        if (!existing) {
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
              contentHash: `osint:${sourceId}:${flight.callsign?.substring(0, 50) || 'unknown'}`,
              timestamp: flight.time ? new Date(flight.time) : now,
              metadata: JSON.stringify({ type: 'flight', callsign: flight.callsign, flightType: flight.type, altitude: flight.altitude, heading: flight.heading, zone: flight.zone, isMilitary }),
            },
          });
          osintInserted++;
        }
      }

      // Process weather
      const weather = osintData.weather;
      if (weather && (weather.activeAlerts > 0 || (weather.extremeEvents?.length ?? 0) > 0)) {
        const sourceId = `weather_${now.toISOString().split('T')[0]}`;
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
              contentHash: `osint:${sourceId}:weather_alerts`,
              timestamp: now,
              metadata: JSON.stringify({ type: 'weather', activeAlerts: weather.activeAlerts, extremeEvents: weather.extremeEvents }),
            },
          });
          osintInserted++;
        }
      }

      // Process fires
      const fires = osintData.fires ?? [];
      for (const fire of fires) {
        const sourceId = `fire_${fire.lat}_${fire.lon}_${fire.confidence}`;
        const existing = await db.rawMessage.findUnique({
          where: { source_sourceId: { source: 'osint', sourceId } },
        });
        if (!existing) {
          await db.rawMessage.create({
            data: {
              source: 'osint',
              sourceId,
              channelName: 'Fires',
              channelId: 'osint_fires',
              senderName: 'NASA FIRMS',
              content: `Fire detected: ${fire.location} - Confidence: ${fire.confidence}%, Coords: ${fire.lat},${fire.lon}`,
              contentHash: `osint:${sourceId}:${fire.location?.substring(0, 50) || `${fire.lat},${fire.lon}`}`,
              timestamp: now,
              metadata: JSON.stringify({ type: 'fire', location: fire.location, confidence: fire.confidence, lat: fire.lat, lon: fire.lon }),
            },
          });
          osintInserted++;
        }
      }

      // Process ships
      const ships = osintData.ships ?? [];
      for (const ship of ships) {
        const sourceId = `ship_${ship.name}_${ship.lat}_${ship.lon}`;
        const existing = await db.rawMessage.findUnique({
          where: { source_sourceId: { source: 'osint', sourceId } },
        });
        if (!existing) {
          await db.rawMessage.create({
            data: {
              source: 'osint',
              sourceId,
              channelName: 'Maritime',
              channelId: 'osint_ships',
              senderName: 'AIS/MarineTraffic',
              content: `Vessel: ${ship.name} (${ship.type}) - Speed: ${ship.speed}kts, Coords: ${ship.lat},${ship.lon}`,
              contentHash: `osint:${sourceId}:${ship.name?.substring(0, 50) || 'unknown'}`,
              timestamp: now,
              metadata: JSON.stringify({ type: 'ship', name: ship.name, shipType: ship.type, lat: ship.lat, lon: ship.lon, speed: ship.speed }),
            },
          });
          osintInserted++;
        }
      }

      // Update thresholds
      if (maxMagnitude > 0) {
        const eqThreshold = await db.thresholdConfig.findFirst({ where: { metric: 'earthquake_magnitude' } });
        if (eqThreshold) await db.thresholdConfig.update({ where: { id: eqThreshold.id }, data: { currentValue: maxMagnitude } });
      }
      const flightsThreshold = await db.thresholdConfig.findFirst({ where: { metric: 'military_flights' } });
      if (flightsThreshold) await db.thresholdConfig.update({ where: { id: flightsThreshold.id }, data: { currentValue: militaryFlightCount } });

      summary.osintIngestion = { success: true, inserted: osintInserted };
    } else {
      summary.osintIngestion = { success: false, inserted: 0, error: osintResponse.error || 'No data from OSINT service' };
    }
  } catch (err) {
    summary.osintIngestion = { success: false, inserted: 0, error: err instanceof Error ? err.message : 'Unknown error' };
  }

  // ===== TASK 2: Process unprocessed messages =====
  try {
    const unprocessed = await db.rawMessage.findMany({
      where: { processed: false },
      take: 100,
      orderBy: { timestamp: 'asc' },
    });

    let alertsGenerated = 0;
    let entitiesUpdated = 0;

    for (const msg of unprocessed) {
      const contentLower = msg.content.toLowerCase();
      const isSuspicious = SUSPICIOUS_KEYWORDS.some(kw => contentLower.includes(kw));

      // Entity extraction
      for (const [, config] of Object.entries(ENTITY_PATTERNS)) {
        for (const pattern of config.patterns) {
          pattern.lastIndex = 0;
          const matches = msg.content.matchAll(pattern);
          for (const match of matches) {
            if (match[0] && match[0].length > 2) {
              const entityName = match[0].trim();
              const entityType = config.type;
              const existingEntity = await db.entity.findFirst({ where: { name: entityName, type: entityType } });
              if (existingEntity) {
                const newRiskScore = Math.min(100, existingEntity.riskScore + (isSuspicious ? 15 : 5));
                const newRiskLevel = newRiskScore >= 90 ? 'critical' : newRiskScore >= 70 ? 'high' : newRiskScore >= 40 ? 'medium' : 'low';
                await db.entity.update({
                  where: { id: existingEntity.id },
                  data: { riskScore: newRiskScore, riskLevel: newRiskLevel, mentionCount: existingEntity.mentionCount + 1, lastSeen: now },
                });
              } else {
                await db.entity.create({
                  data: {
                    name: entityName,
                    type: entityType,
                    riskScore: isSuspicious ? 40 : 10,
                    riskLevel: isSuspicious ? 'medium' : 'low',
                    mentionCount: 1,
                    lastSeen: now,
                    platformIds: JSON.stringify({ [msg.source]: [msg.channelId].filter(Boolean) }),
                    metadata: JSON.stringify({ source: 'scheduler', firstSeenIn: msg.id }),
                  },
                });
              }
              entitiesUpdated++;
            }
          }
        }
      }

      await db.rawMessage.update({
        where: { id: msg.id },
        data: { processed: true, analyzedAt: now },
      });
    }

    summary.messageProcessing = { success: true, processed: unprocessed.length, alertsGenerated, entitiesUpdated };
  } catch (err) {
    summary.messageProcessing = { success: false, processed: 0, alertsGenerated: 0, entitiesUpdated: 0, error: err instanceof Error ? err.message : 'Unknown error' };
  }

  // ===== TASK 3: Run all strategies =====
  try {
    const context = await buildStrategyContext();
    const allStrategies = strategyRegistry.getAll();
    const results: Array<{ strategy: string; action: string; confidence: number; reasoning: string }> = [];
    let alertsFromStrategies = 0;

    for (const strategy of allStrategies) {
      try {
        const result = await strategyRegistry.evaluateWith(strategy.id, context);
        results.push({
          strategy: strategy.id,
          action: result.action,
          confidence: result.confidence,
          reasoning: result.reasoning,
        });
        if (result.action === 'alert') alertsFromStrategies++;

        // Create IntelligenceEvent for each strategy result
        await db.intelligenceEvent.create({
          data: {
            eventType: 'monitoring.alert_generated',
            aggregateId: `scheduler_strategy_${strategy.id}_${Date.now()}`,
            aggregateType: 'alert',
            stream: 'whatomate:decisions',
            payload: JSON.stringify({
              strategy: strategy.id,
              action: result.action,
              severity: result.severity,
              confidence: result.confidence,
              reasoning: result.reasoning,
              triggeredBy: 'scheduler',
            }),
            metadata: JSON.stringify({ strategyId: strategy.id, autoTriggered: true, source: 'scheduler' }),
            processed: false,
          },
        });
      } catch (err) {
        results.push({
          strategy: strategy.id,
          action: 'error',
          confidence: 0,
          reasoning: `Evaluation failed: ${err instanceof Error ? err.message : 'Unknown error'}`,
        });
      }
    }

    summary.strategyEvaluation = { success: true, results, alertsGenerated: alertsFromStrategies };
  } catch (err) {
    summary.strategyEvaluation = { success: false, results: [], alertsGenerated: 0, error: err instanceof Error ? err.message : 'Unknown error' };
  }

  // ===== TASK 4: Update adaptive metrics =====
  try {
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const recentAlerts = await db.alert.findMany({ where: { timestamp: { gte: thirtyDaysAgo } } });
    const totalAlerts = recentAlerts.length;
    const acknowledged = recentAlerts.filter(a => a.acknowledged).length;
    const escalated = recentAlerts.filter(a => a.escalated).length;
    const possibleFalsePositives = totalAlerts - acknowledged - escalated;
    const falsePositiveRate = totalAlerts > 0 ? Math.max(0, possibleFalsePositives / totalAlerts * 100) : 0;
    const sensitivity = Math.min(100, (totalAlerts > 0 ? acknowledged / totalAlerts : 0) * 100 + (totalAlerts > 0 ? escalated / totalAlerts : 0) * 50);
    const accuracy = Math.min(100, (1 - falsePositiveRate / 100) * 100);

    await db.adaptiveMetric.create({
      data: {
        date: now,
        falsePositiveRate,
        sensitivity,
        accuracy,
        threshold: 'system',
        adjustment: JSON.stringify({
          totalAlerts,
          acknowledged,
          escalated,
          action: falsePositiveRate > 15 ? 'increase_thresholds' : falsePositiveRate < 5 ? 'decrease_thresholds' : 'maintain',
          triggeredBy: 'scheduler',
        }),
      },
    });

    // Adaptive threshold adjustment
    const adjustments: string[] = [];
    if (falsePositiveRate > 15) {
      const thresholds = await db.thresholdConfig.findMany({ where: { enabled: true } });
      for (const threshold of thresholds) {
        const newValue = Math.round(threshold.value * 1.1);
        await db.thresholdConfig.update({ where: { id: threshold.id }, data: { value: newValue } });
        adjustments.push(`${threshold.name}: ${threshold.value} → ${newValue} (+10%)`);
      }
    } else if (falsePositiveRate < 5 && sensitivity < 80) {
      const thresholds = await db.thresholdConfig.findMany({ where: { enabled: true } });
      for (const threshold of thresholds) {
        const newValue = Math.round(threshold.value * 0.9);
        await db.thresholdConfig.update({ where: { id: threshold.id }, data: { value: newValue } });
        adjustments.push(`${threshold.name}: ${threshold.value} → ${newValue} (-10%)`);
      }
    }

    summary.adaptiveMetrics = { success: true, adjustments };
  } catch (err) {
    summary.adaptiveMetrics = { success: false, adjustments: [], error: err instanceof Error ? err.message : 'Unknown error' };
  }

  // ===== Create scheduler event =====
  const schedulerEventId = `scheduler_run_${Date.now()}`;
  const durationMs = Date.now() - startTime;

  safeEventAppend('whatomate:decisions', {
    eventType: 'adaptive.metric_recorded',
    aggregateId: schedulerEventId,
    aggregateType: 'agent',
    payload: {
      type: 'scheduler_run',
      durationMs,
      summary: {
        osintInserted: summary.osintIngestion.inserted,
        messagesProcessed: summary.messageProcessing.processed,
        strategyAlerts: summary.strategyEvaluation.alertsGenerated,
        adaptiveAdjustments: summary.adaptiveMetrics.adjustments.length,
      },
    },
  });

  await db.intelligenceEvent.create({
    data: {
      eventType: 'adaptive.metric_recorded',
      aggregateId: schedulerEventId,
      aggregateType: 'agent',
      stream: 'whatomate:decisions',
      payload: JSON.stringify({
        type: 'scheduler_run',
        durationMs,
        summary: {
          osintInserted: summary.osintIngestion.inserted,
          messagesProcessed: summary.messageProcessing.processed,
          strategyAlerts: summary.strategyEvaluation.alertsGenerated,
          adaptiveAdjustments: summary.adaptiveMetrics.adjustments.length,
        },
      }),
      metadata: JSON.stringify({ schedulerRun: true, timestamp: now.toISOString() }),
      processed: false,
    },
  });

  summary.schedulerEvent = schedulerEventId;

  return NextResponse.json({
    success: true,
    durationMs,
    timestamp: now.toISOString(),
    summary,
  });
}

// ===== GET: Return scheduler status =====
export async function GET() {
  try {
    // Last scheduler run
    const lastRun = await db.intelligenceEvent.findFirst({
      where: { eventType: 'adaptive.metric_recorded', metadata: { contains: 'schedulerRun' } },
      orderBy: { timestamp: 'desc' },
    });

    // Scheduler run history
    const schedulerHistory = await db.intelligenceEvent.findMany({
      where: { eventType: 'adaptive.metric_recorded', metadata: { contains: 'schedulerRun' } },
      orderBy: { timestamp: 'desc' },
      take: 10,
    });

    // Parse history for display
    const history = schedulerHistory.map(evt => {
      let payload: Record<string, unknown> = {};
      try { payload = JSON.parse(evt.payload); } catch { /* ignore */ }
      return {
        id: evt.id,
        timestamp: evt.timestamp.toISOString(),
        durationMs: (payload.summary as Record<string, unknown>)?.durationMs ?? 0,
        osintInserted: ((payload.summary as Record<string, unknown>)?.osintInserted as number) ?? 0,
        messagesProcessed: ((payload.summary as Record<string, unknown>)?.messagesProcessed as number) ?? 0,
        strategyAlerts: ((payload.summary as Record<string, unknown>)?.strategyAlerts as number) ?? 0,
      };
    });

    // Next scheduled run (estimated — every 15 minutes)
    const lastRunTime = lastRun?.timestamp ?? new Date(0);
    const nextRun = new Date(lastRunTime.getTime() + 15 * 60 * 1000);

    return NextResponse.json({
      status: 'active',
      lastRun: lastRun?.timestamp?.toISOString() ?? null,
      nextScheduledRun: nextRun.toISOString(),
      intervalMinutes: 15,
      history,
    });
  } catch (error) {
    console.error('[Scheduler] GET error:', error);
    return NextResponse.json(
      { error: 'Internal server error fetching scheduler status' },
      { status: 500 }
    );
  }
}
