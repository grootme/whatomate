import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/intelligence/auth';
import { db } from '@/lib/db';
import { ingestOsintData } from '@/lib/intelligence/osint-processor';
import { fetchService } from '@/lib/intelligence/service-client';
import { persistEvent } from '@/lib/intelligence/event-persist';
import { strategyRegistry } from '@/lib/intelligence/strategies';
import { buildStrategyContext } from '@/lib/intelligence/context-builder';
import type { OsintSnapshot } from '@/lib/intelligence/types';

// ===== GET: Read-only OSINT agent status (no side effects) =====
async function _GET() {
  try {
    const agentState = await db.agentState.findUnique({
      where: { agentId: 'ing-os' },
    });

    if (!agentState) {
      return NextResponse.json({ status: 'unknown', agentId: 'ing-os' });
    }

    return NextResponse.json({
      agentId: agentState.agentId,
      name: agentState.name,
      layer: agentState.layer,
      layerName: agentState.layerName,
      status: agentState.status,
      health: agentState.health,
      messagesProcessed: agentState.messagesProcessed,
      lastHeartbeat: agentState.lastHeartbeat,
      startedAt: agentState.startedAt,
    });
  } catch (error) {
    console.error('[OSINT Status] GET error:', error);
    return NextResponse.json(
      { error: 'Internal server error fetching OSINT status' },
      { status: 500 },
    );
  }
}

// ===== POST: Fetch OSINT data and ingest =====
async function _POST() {
  try {
    // 1. Fetch live OSINT data from shadowbroker service
    const osintResponse = await fetchService<OsintSnapshot>('osint', '/api/live-data');

    if (osintResponse.error || !osintResponse.data) {
      // Mark agent as error if service unavailable
      const agentState = await db.agentState.findUnique({ where: { agentId: 'ing-os' } });
      if (agentState) {
        await db.agentState.update({
          where: { agentId: 'ing-os' },
          data: { status: 'error', health: Math.max(0, agentState.health - 10) },
        });
      }
      return NextResponse.json(
        { error: osintResponse.error || 'No data from OSINT service', inserted: 0 },
        { status: 502 },
      );
    }

    const osintData = osintResponse.data;

    // 2. Ingest all OSINT data through the shared processor
    const result = await ingestOsintData(osintData);

    // 3. Auto-trigger strategy evaluation when new data was inserted
    const strategyResults: Array<{
      strategy: string;
      action: string;
      confidence: number;
      reasoning: string;
    }> = [];
    let alertsFromStrategies = 0;

    if (result.inserted > 0) {
      try {
        const context = await buildStrategyContext();
        // Include OSINT data in context for risk_scoring strategy
        context.osintData = osintData;

        const allStrategies = strategyRegistry.getAll();

        for (const strategy of allStrategies) {
          try {
            const evalResult = await strategyRegistry.evaluateWith(strategy.id, context);
            strategyResults.push({
              strategy: strategy.id,
              action: evalResult.action,
              confidence: evalResult.confidence,
              reasoning: evalResult.reasoning,
            });

            if (evalResult.action === 'alert') {
              alertsFromStrategies++;
            }

            // Persist strategy evaluation as a durable event
            await persistEvent('whatomate:decisions', {
              eventType: 'monitoring.alert_generated',
              aggregateId: `strategy_${strategy.id}_osint_${Date.now()}`,
              aggregateType: 'alert',
              payload: {
                strategy: strategy.id,
                action: evalResult.action,
                severity: evalResult.severity,
                confidence: evalResult.confidence,
                reasoning: evalResult.reasoning,
                triggeredBy: 'osint_ingestion',
              },
              metadata: { strategyId: strategy.id, autoTriggered: true, source: 'osint' },
            });
          } catch (err) {
            console.error(
              `[OSINT Ingestion] Strategy ${strategy.id} auto-evaluation error:`,
              err,
            );
            strategyResults.push({
              strategy: strategy.id,
              action: 'error',
              confidence: 0,
              reasoning: `Evaluation failed: ${err instanceof Error ? err.message : 'Unknown error'}`,
            });
          }
        }
      } catch (ctxErr) {
        console.error(
          '[OSINT Ingestion] Failed to build strategy context for auto-evaluation:',
          ctxErr,
        );
      }
    }

    // 4. Return full result with strategy evaluation
    return NextResponse.json({
      inserted: result.inserted,
      duplicates: result.duplicates,
      data: {
        earthquakes: result.earthquakeCount,
        flights: result.flightCount,
        militaryFlights: result.militaryFlightCount,
        weatherAlerts: result.weatherAlertCount,
        fires: result.fireCount,
        ships: result.shipCount,
      },
      thresholds: {
        earthquakeMagnitude: result.maxMagnitude,
        militaryFlights: result.militaryFlightCount,
        weatherAlerts: result.weatherAlertCount,
      },
      agent: {
        agentId: 'ing-os',
        status: 'active',
      },
      latency: osintResponse.latency,
      strategyEvaluation: {
        triggered: result.inserted > 0,
        results: strategyResults,
        alertsGenerated: alertsFromStrategies,
      },
    });
  } catch (error) {
    console.error('[OSINT Ingestion] POST error:', error);
    return NextResponse.json(
      { error: 'Internal server error during OSINT ingestion' },
      { status: 500 },
    );
  }
}

export const GET = withAuth(_GET);
export const POST = withAuth(_POST);
