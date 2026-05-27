import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/intelligence/auth';
import { db } from '@/lib/db';
import { processUnprocessedMessages } from '@/lib/intelligence/analysis-engine';
import { persistEvent } from '@/lib/intelligence/event-persist';
import { strategyRegistry } from '@/lib/intelligence/strategies';
import { buildStrategyContext } from '@/lib/intelligence/context-builder';
import type { EventStream } from '@/lib/intelligence/types';

// ===== POST: Run analysis on unprocessed messages =====
async function _POST() {
  try {
    // Step A: Process unprocessed messages using shared engine
    const processingResult = await processUnprocessedMessages(100);

    if (processingResult.processed === 0) {
      return NextResponse.json({
        processed: 0,
        suspiciousCount: 0,
        entitiesUpdated: 0,
        strategyResults: [],
        message: 'No unprocessed messages found',
      });
    }

    // Step B: Build strategy context and run ALL 6 strategies
    const context = await buildStrategyContext();
    const allStrategies = strategyRegistry.getAll();
    const strategyResults: Array<{ strategy: string; action: string; confidence: number; reasoning: string }> = [];

    for (const strategy of allStrategies) {
      try {
        const result = await strategyRegistry.evaluateWith(strategy.id, context);
        strategyResults.push({
          strategy: strategy.id,
          action: result.action,
          confidence: result.confidence,
          reasoning: result.reasoning,
        });

        // Persist strategy result event using shared persistEvent
        const stream: EventStream = 'whatomate:decisions';
        await persistEvent(stream, {
          eventType: 'monitoring.alert_generated',
          aggregateId: `strategy_${strategy.id}_processing_${Date.now()}`,
          aggregateType: 'alert',
          payload: {
            strategy: strategy.id,
            action: result.action,
            severity: result.severity,
            confidence: result.confidence,
            reasoning: result.reasoning,
            triggeredBy: 'processing',
            processedCount: processingResult.processed,
          },
          metadata: { strategyId: strategy.id, autoTriggered: true, source: 'processing' },
        });
      } catch (err) {
        console.error(`[Processing] Strategy ${strategy.id} evaluation error:`, err);
        strategyResults.push({
          strategy: strategy.id,
          action: 'error',
          confidence: 0,
          reasoning: `Evaluation failed: ${err instanceof Error ? err.message : 'Unknown error'}`,
        });
      }
    }

    return NextResponse.json({
      processed: processingResult.processed,
      suspiciousCount: processingResult.suspiciousCount,
      entitiesUpdated: processingResult.entitiesUpdated,
      strategyResults,
    });
  } catch (error) {
    console.error('[Processing] POST error:', error);
    return NextResponse.json(
      { error: 'Internal server error during processing' },
      { status: 500 }
    );
  }
}

// ===== GET: Return processing stats =====
async function _GET() {
  try {
    // Unprocessed message count
    const unprocessedCount = await db.rawMessage.count({
      where: { processed: false },
    });

    // Processed message count
    const processedCount = await db.rawMessage.count({
      where: { processed: true },
    });

    // Last processing run timestamp
    const lastProcessed = await db.rawMessage.findFirst({
      where: { processed: true, analyzedAt: { not: null } },
      orderBy: { analyzedAt: 'desc' },
      select: { analyzedAt: true },
    });

    // Entity counts by risk level
    const criticalEntities = await db.entity.count({ where: { riskLevel: 'critical' } });
    const highEntities = await db.entity.count({ where: { riskLevel: 'high' } });
    const mediumEntities = await db.entity.count({ where: { riskLevel: 'medium' } });
    const lowEntities = await db.entity.count({ where: { riskLevel: 'low' } });

    // Recent analysis events
    const recentAnalysisEvents = await db.intelligenceEvent.count({
      where: { eventType: 'analysis.semantic_completed' },
    });

    // Analysis agent states
    const analysisAgents = await db.agentState.findMany({
      where: { agentId: { in: ['ana-sem', 'ana-pat', 'ana-cro', 'ana-ris'] } },
    });

    return NextResponse.json({
      messages: {
        unprocessed: unprocessedCount,
        processed: processedCount,
        lastProcessingRun: lastProcessed?.analyzedAt?.toISOString() ?? null,
      },
      entities: {
        critical: criticalEntities,
        high: highEntities,
        medium: mediumEntities,
        low: lowEntities,
        total: criticalEntities + highEntities + mediumEntities + lowEntities,
      },
      events: {
        analysisCompleted: recentAnalysisEvents,
      },
      agents: analysisAgents.map(a => ({
        agentId: a.agentId,
        name: a.name,
        status: a.status,
        health: a.health,
        messagesProcessed: a.messagesProcessed,
        lastHeartbeat: a.lastHeartbeat?.toISOString() ?? null,
      })),
    });
  } catch (error) {
    console.error('[Processing] GET error:', error);
    return NextResponse.json(
      { error: 'Internal server error fetching processing stats' },
      { status: 500 }
    );
  }
}

export const POST = withAuth(_POST);
export const GET = withAuth(_GET);
