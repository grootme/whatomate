import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/intelligence/auth';
import { db } from '@/lib/db';
import { processUnprocessedMessages } from '@/lib/intelligence/analysis-engine';
import { ingestOsintData } from '@/lib/intelligence/osint-processor';
import { fetchService } from '@/lib/intelligence/service-client';
import { persistEvent } from '@/lib/intelligence/event-persist';
import { strategyRegistry } from '@/lib/intelligence/strategies';
import { buildStrategyContext } from '@/lib/intelligence/context-builder';
import { runAnomalyDetection } from '@/lib/intelligence/anomaly-detector';
import type { OsintSnapshot, EventStream } from '@/lib/intelligence/types';

// ===== POST: Run all scheduled tasks =====
async function _POST() {
  const startTime = Date.now();
  const now = new Date();
  const summary: {
    osintIngestion: { success: boolean; inserted: number; error?: string };
    messageProcessing: { success: boolean; processed: number; suspiciousCount: number; entitiesUpdated: number; error?: string };
    strategyEvaluation: { success: boolean; results: Array<{ strategy: string; action: string; confidence: number; reasoning: string }>; alertsGenerated: number; error?: string };
    adaptiveMetrics: { success: boolean; adjustments: string[]; error?: string };
    anomalyDetection: { success: boolean; anomaliesDetected: number; alertsCreated: number; error?: string };
    schedulerEvent: string;
  } = {
    osintIngestion: { success: false, inserted: 0 },
    messageProcessing: { success: false, processed: 0, suspiciousCount: 0, entitiesUpdated: 0 },
    strategyEvaluation: { success: false, results: [], alertsGenerated: 0 },
    adaptiveMetrics: { success: false, adjustments: [] },
    anomalyDetection: { success: false, anomaliesDetected: 0, alertsCreated: 0 },
    schedulerEvent: '',
  };

  // ===== TASK 1: Fetch and ingest OSINT data =====
  try {
    const osintResponse = await fetchService<OsintSnapshot>('osint', '/api/live-data/osint-snapshot');

    if (osintResponse.data && !osintResponse.error) {
      const ingestionResult = await ingestOsintData(osintResponse.data);
      summary.osintIngestion = { success: true, inserted: ingestionResult.inserted };
    } else {
      summary.osintIngestion = { success: false, inserted: 0, error: osintResponse.error || 'No data from OSINT service' };
    }
  } catch (err) {
    summary.osintIngestion = { success: false, inserted: 0, error: err instanceof Error ? err.message : 'Unknown error' };
  }

  // ===== TASK 2: Process unprocessed messages =====
  try {
    const processingResult = await processUnprocessedMessages(100);
    summary.messageProcessing = {
      success: true,
      processed: processingResult.processed,
      suspiciousCount: processingResult.suspiciousCount,
      entitiesUpdated: processingResult.entitiesUpdated,
    };
  } catch (err) {
    summary.messageProcessing = { success: false, processed: 0, suspiciousCount: 0, entitiesUpdated: 0, error: err instanceof Error ? err.message : 'Unknown error' };
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

        // Persist strategy result event using shared persistEvent
        const stream: EventStream = 'whatomate:decisions';
        await persistEvent(stream, {
          eventType: 'monitoring.alert_generated',
          aggregateId: `scheduler_strategy_${strategy.id}_${Date.now()}`,
          aggregateType: 'alert',
          payload: {
            strategy: strategy.id,
            action: result.action,
            severity: result.severity,
            confidence: result.confidence,
            reasoning: result.reasoning,
            triggeredBy: 'scheduler',
          },
          metadata: { strategyId: strategy.id, autoTriggered: true, source: 'scheduler' },
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

  // ===== TASK 5: Run anomaly detection =====
  try {
    const anomalyResult = await runAnomalyDetection();
    summary.anomalyDetection = {
      success: true,
      anomaliesDetected: anomalyResult.anomaliesDetected,
      alertsCreated: anomalyResult.alertsCreated,
    };
  } catch (err) {
    summary.anomalyDetection = { success: false, anomaliesDetected: 0, alertsCreated: 0, error: err instanceof Error ? err.message : 'Unknown error' };
  }

  // ===== Create scheduler event using persistEvent =====
  const schedulerEventId = `scheduler_run_${Date.now()}`;
  const durationMs = Date.now() - startTime;
  const stream: EventStream = 'whatomate:decisions';

  await persistEvent(stream, {
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
        anomalyDetections: summary.anomalyDetection.anomaliesDetected,
        anomalyAlerts: summary.anomalyDetection.alertsCreated,
        adaptiveAdjustments: summary.adaptiveMetrics.adjustments.length,
      },
    },
    metadata: { schedulerRun: true, timestamp: now.toISOString() },
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
async function _GET() {
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

export const POST = withAuth(_POST);
export const GET = withAuth(_GET);