/**
 * Intelligence Scheduler — manages periodic automated tasks.
 *
 * Tasks:
 * - OSINT data ingestion (every 15 min)
 * - Message processing (every 5 min)
 * - Strategy evaluation (every 15 min)
 * - Correlation analysis (every 30 min)
 * - Adaptive metrics (every 60 min)
 * - Health checks (every 5 min)
 * - Prediction accuracy tracking (every 60 min)
 *
 * RICCO Patterns Applied:
 * - Registry Pattern (ADN 3): Task definitions are registered and looked up by ID
 * - Specification Pattern (ADN 1): `isPending` spec determines if a task should run
 * - Observer Pattern (ADN 4): Every task execution is recorded as a durable event
 */

import { db } from '@/lib/db';
import { persistEvent } from './event-persist';
import type { DecisionStrategy, EventStream } from './types';

// ===== Types =====

export interface ScheduledTask {
  id: string;
  name: string;
  intervalMs: number;
  lastRun: Date | null;
  nextRun: Date;
  enabled: boolean;
  handler: () => Promise<{ success: boolean; result?: unknown; error?: string }>;
}

export interface TaskStatus {
  id: string;
  name: string;
  intervalMs: number;
  lastRun: Date | null;
  nextRun: Date;
  enabled: boolean;
}

export interface TaskResult {
  taskId: string;
  success: boolean;
  result?: unknown;
  error?: string;
  durationMs: number;
}

// ===== Internal task store =====

const BASE_URL = 'http://localhost:3000';

/**
 * Creates the initial `nextRun` timestamp aligned to the current time.
 * All tasks start with `nextRun = now` so they execute on the first cycle.
 */
function initialNextRun(): Date {
  return new Date();
}

// ===== Task Handlers =====

/**
 * OSINT Ingestion — fetches live OSINT data and ingests into the system.
 * Calls POST /api/ingestion/osint internally.
 */
async function osintIngestHandler(): Promise<{ success: boolean; result?: unknown; error?: string }> {
  try {
    const response = await fetch(`${BASE_URL}/api/ingestion/osint`, { method: 'POST' });
    if (!response.ok) {
      return { success: false, error: `HTTP ${response.status}` };
    }
    const data = await response.json();
    return { success: true, result: data };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' };
  }
}

/**
 * Message Processing — processes unprocessed messages through the analysis engine.
 * Calls POST /api/processing internally.
 */
async function processMessagesHandler(): Promise<{ success: boolean; result?: unknown; error?: string }> {
  try {
    const response = await fetch(`${BASE_URL}/api/processing`, { method: 'POST' });
    if (!response.ok) {
      return { success: false, error: `HTTP ${response.status}` };
    }
    const data = await response.json();
    return { success: true, result: data };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' };
  }
}

/**
 * Strategy Evaluation — evaluates each registered strategy type.
 * Calls POST /api/strategies with each strategy type sequentially.
 */
async function strategyEvalHandler(): Promise<{ success: boolean; result?: unknown; error?: string }> {
  const strategyTypes: DecisionStrategy[] = [
    'threshold',
    'pattern',
    'risk_scoring',
    'consensus',
    'predictive',
    'adaptive',
  ];

  const results: Array<{ strategy: string; success: boolean; result?: unknown; error?: string }> = [];
  let anySuccess = false;

  for (const type of strategyTypes) {
    try {
      const response = await fetch(`${BASE_URL}/api/strategies`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type }),
      });
      if (!response.ok) {
        results.push({ strategy: type, success: false, error: `HTTP ${response.status}` });
        continue;
      }
      const data = await response.json();
      results.push({ strategy: type, success: true, result: data });
      anySuccess = true;
    } catch (err) {
      results.push({
        strategy: type,
        success: false,
        error: err instanceof Error ? err.message : 'Unknown error',
      });
    }
  }

  return {
    success: anySuccess,
    result: results,
    error: anySuccess ? undefined : 'All strategy evaluations failed',
  };
}

/**
 * Correlation Analysis — runs cross-platform correlation engine.
 * Calls POST /api/correlation internally.
 */
async function correlationHandler(): Promise<{ success: boolean; result?: unknown; error?: string }> {
  try {
    const response = await fetch(`${BASE_URL}/api/correlation`, { method: 'POST' });
    if (!response.ok) {
      return { success: false, error: `HTTP ${response.status}` };
    }
    const data = await response.json();
    return { success: true, result: data };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' };
  }
}

/**
 * Adaptive Metrics — records system-wide adaptive metrics and adjusts thresholds.
 * Calls POST /api/scheduler internally (triggers only the adaptive part).
 */
async function adaptiveMetricsHandler(): Promise<{ success: boolean; result?: unknown; error?: string }> {
  try {
    // Run adaptive metrics calculation directly (same logic as scheduler's TASK 4)
    const now = new Date();
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
          action: falsePositiveRate > 15
            ? 'increase_thresholds'
            : falsePositiveRate < 5
              ? 'decrease_thresholds'
              : 'maintain',
          triggeredBy: 'adaptive_scheduler',
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

    return {
      success: true,
      result: {
        falsePositiveRate,
        sensitivity,
        accuracy,
        totalAlerts,
        adjustments,
      },
    };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' };
  }
}

/**
 * Health Check — checks the health of all registered microservices.
 * Calls GET /api/health internally.
 */
async function healthCheckHandler(): Promise<{ success: boolean; result?: unknown; error?: string }> {
  try {
    const response = await fetch(`${BASE_URL}/api/health`, { method: 'GET' });
    if (!response.ok) {
      return { success: false, error: `HTTP ${response.status}` };
    }
    const data = await response.json();
    return { success: true, result: data };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' };
  }
}

/**
 * Prediction Accuracy Tracking — compares stored predictions to actual values
 * and records accuracy metrics.
 *
 * For each prediction whose `targetTime` has passed and has no `actualValue`:
 * 1. Compute the actual value from DB (e.g., message count in the predicted period)
 * 2. Calculate the error percentage
 * 3. Update the prediction record with the actual value
 * 4. Record an accuracy metric event
 */
async function predictionAccuracyHandler(): Promise<{ success: boolean; result?: unknown; error?: string }> {
  try {
    const now = new Date();

    // Find predictions whose target time has passed but haven't been validated
    const pendingPredictions = await db.prediction.findMany({
      where: {
        targetTime: { lte: now },
        actualValue: null,
      },
      orderBy: { targetTime: 'asc' },
      take: 50,
    });

    if (pendingPredictions.length === 0) {
      return {
        success: true,
        result: { validated: 0, message: 'No pending predictions to validate' },
      };
    }

    const results: Array<{
      predictionId: string;
      metric: string;
      predicted: number;
      actual: number;
      errorPct: number;
      confidence: number;
    }> = [];

    for (const prediction of pendingPredictions) {
      // Determine the time window for actual value lookup
      const targetTime = prediction.targetTime;
      let windowStart: Date;

      switch (prediction.period) {
        case 'hour':
          windowStart = new Date(targetTime.getTime() - 60 * 60 * 1000);
          break;
        case 'day':
          windowStart = new Date(targetTime.getTime() - 24 * 60 * 60 * 1000);
          break;
        case 'week':
          windowStart = new Date(targetTime.getTime() - 7 * 24 * 60 * 60 * 1000);
          break;
        default:
          windowStart = new Date(targetTime.getTime() - 60 * 60 * 1000);
      }

      // Count actual messages in the period as the "actual" value
      const actualCount = await db.rawMessage.count({
        where: {
          timestamp: {
            gte: windowStart,
            lte: targetTime,
          },
        },
      });

      const actualValue = actualCount;
      const predictedValue = prediction.value;
      const errorPct = predictedValue > 0
        ? Math.abs((actualValue - predictedValue) / predictedValue) * 100
        : actualValue > 0
          ? 100
          : 0;

      // Update the prediction with the actual value
      await db.prediction.update({
        where: { id: prediction.id },
        data: { actualValue },
      });

      results.push({
        predictionId: prediction.id,
        metric: prediction.metric,
        predicted: predictedValue,
        actual: actualValue,
        errorPct: Math.round(errorPct * 100) / 100,
        confidence: prediction.confidence,
      });
    }

    // Compute aggregate accuracy
    const avgErrorPct = results.length > 0
      ? results.reduce((sum, r) => sum + r.errorPct, 0) / results.length
      : 0;
    const avgAccuracy = Math.max(0, 100 - avgErrorPct);

    // Persist accuracy tracking event
    const stream: EventStream = 'whatomate:predictions';
    await persistEvent(stream, {
      eventType: 'prediction.forecast',
      aggregateId: `prediction_accuracy_${Date.now()}`,
      aggregateType: 'threshold',
      payload: {
        type: 'accuracy_tracking',
        validatedCount: results.length,
        avgErrorPct: Math.round(avgErrorPct * 100) / 100,
        avgAccuracy: Math.round(avgAccuracy * 100) / 100,
        results: results.map(r => ({
          predictionId: r.predictionId,
          metric: r.metric,
          predicted: r.predicted,
          actual: r.actual,
          errorPct: r.errorPct,
        })),
      },
      metadata: { schedulerTask: 'prediction-accuracy', triggeredAt: now.toISOString() },
    });

    return {
      success: true,
      result: {
        validated: results.length,
        avgErrorPct: Math.round(avgErrorPct * 100) / 100,
        avgAccuracy: Math.round(avgAccuracy * 100) / 100,
        predictions: results,
      },
    };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' };
  }
}

// ===== Scheduler Configuration — Task Registry =====

const MINUTE = 60 * 1000;

/**
 * The central task registry. Each task defines:
 * - id: unique identifier
 * - name: human-readable label
 * - intervalMs: how often the task should run (milliseconds)
 * - lastRun: timestamp of the last successful execution (null if never run)
 * - nextRun: the next scheduled execution time
 * - enabled: whether the task is active
 * - handler: async function that performs the task
 */
export const schedulerConfig: ScheduledTask[] = [
  {
    id: 'osint-ingest',
    name: 'OSINT Data Ingestion',
    intervalMs: 15 * MINUTE,
    lastRun: null,
    nextRun: initialNextRun(),
    enabled: true,
    handler: osintIngestHandler,
  },
  {
    id: 'process-messages',
    name: 'Message Processing',
    intervalMs: 5 * MINUTE,
    lastRun: null,
    nextRun: initialNextRun(),
    enabled: true,
    handler: processMessagesHandler,
  },
  {
    id: 'strategy-eval',
    name: 'Strategy Evaluation',
    intervalMs: 15 * MINUTE,
    lastRun: null,
    nextRun: initialNextRun(),
    enabled: true,
    handler: strategyEvalHandler,
  },
  {
    id: 'correlation',
    name: 'Correlation Analysis',
    intervalMs: 30 * MINUTE,
    lastRun: null,
    nextRun: initialNextRun(),
    enabled: true,
    handler: correlationHandler,
  },
  {
    id: 'adaptive-metrics',
    name: 'Adaptive Metrics',
    intervalMs: 60 * MINUTE,
    lastRun: null,
    nextRun: initialNextRun(),
    enabled: true,
    handler: adaptiveMetricsHandler,
  },
  {
    id: 'health-check',
    name: 'Health Check',
    intervalMs: 5 * MINUTE,
    lastRun: null,
    nextRun: initialNextRun(),
    enabled: true,
    handler: healthCheckHandler,
  },
  {
    id: 'prediction-accuracy',
    name: 'Prediction Accuracy Tracking',
    intervalMs: 60 * MINUTE,
    lastRun: null,
    nextRun: initialNextRun(),
    enabled: true,
    handler: predictionAccuracyHandler,
  },
];

// ===== Public API =====

/**
 * Returns the current state of all scheduled tasks.
 * Omits the `handler` function for safe serialization.
 */
export function getSchedulerStatus(): TaskStatus[] {
  return schedulerConfig.map((task) => ({
    id: task.id,
    name: task.name,
    intervalMs: task.intervalMs,
    lastRun: task.lastRun,
    nextRun: task.nextRun,
    enabled: task.enabled,
  }));
}

/**
 * Runs a specific task by ID.
 * Updates `lastRun` and `nextRun` on success or failure.
 * Records the execution as a durable event.
 *
 * @returns The task result with duration
 */
export async function runTask(taskId: string): Promise<TaskResult> {
  const task = schedulerConfig.find((t) => t.id === taskId);

  if (!task) {
    return {
      taskId,
      success: false,
      error: `Task "${taskId}" not found in scheduler configuration`,
      durationMs: 0,
    };
  }

  if (!task.enabled) {
    return {
      taskId,
      success: false,
      error: `Task "${taskId}" is disabled`,
      durationMs: 0,
    };
  }

  const start = Date.now();

  try {
    const handlerResult = await task.handler();
    const durationMs = Date.now() - start;

    // Update task timing regardless of handler success/failure
    task.lastRun = new Date();
    task.nextRun = new Date(Date.now() + task.intervalMs);

    // Persist execution event
    const stream: EventStream = 'whatomate:decisions';
    await persistEvent(stream, {
      eventType: 'agent.status_changed',
      aggregateId: `scheduler_${taskId}_${Date.now()}`,
      aggregateType: 'agent',
      payload: {
        type: 'scheduler_task_execution',
        taskId,
        taskName: task.name,
        success: handlerResult.success,
        durationMs,
        result: handlerResult.result,
        error: handlerResult.error,
      },
      metadata: { schedulerTask: taskId, autoTriggered: false },
    }).catch(() => {
      // Don't fail the task if event persistence fails
    });

    return {
      taskId,
      success: handlerResult.success,
      result: handlerResult.result,
      error: handlerResult.error,
      durationMs,
    };
  } catch (err) {
    const durationMs = Date.now() - start;

    // Still update timing on unhandled errors
    task.lastRun = new Date();
    task.nextRun = new Date(Date.now() + task.intervalMs);

    return {
      taskId,
      success: false,
      error: err instanceof Error ? err.message : 'Unknown error during task execution',
      durationMs,
    };
  }
}

/**
 * Runs all tasks whose `nextRun` time has passed.
 * Returns results for each task that was executed.
 *
 * Tasks are executed sequentially to avoid overloading the system.
 */
export async function runPendingTasks(): Promise<TaskResult[]> {
  const now = new Date();
  const results: TaskResult[] = [];

  for (const task of schedulerConfig) {
    if (!task.enabled) continue;
    if (task.nextRun > now) continue;

    const result = await runTask(task.id);
    results.push(result);
  }

  return results;
}

/**
 * Enables/disables a task or changes its interval.
 * If the interval changes, `nextRun` is recalculated from `lastRun` (or now).
 *
 * @param taskId - The task to update
 * @param updates - Partial updates: `enabled` and/or `intervalMs`
 */
export function updateTaskConfig(
  taskId: string,
  updates: { enabled?: boolean; intervalMs?: number },
): boolean {
  const task = schedulerConfig.find((t) => t.id === taskId);

  if (!task) {
    return false;
  }

  if (updates.enabled !== undefined) {
    task.enabled = updates.enabled;
  }

  if (updates.intervalMs !== undefined && updates.intervalMs > 0) {
    task.intervalMs = updates.intervalMs;
    // Recalculate nextRun from lastRun or now
    const base = task.lastRun ?? new Date();
    task.nextRun = new Date(base.getTime() + task.intervalMs);
  }

  return true;
}
