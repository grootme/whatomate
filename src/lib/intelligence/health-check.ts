/**
 * Health Check Registry — Microservice Health Monitoring with DB Persistence
 *
 * Monitors microservice health beyond simple HTTP ping by tracking latency,
 * consecutive failures/successes, and determining status through a
 * multi-signal evaluation.
 *
 * Persistence:
 *  - After each `runOne()`, the result is saved to IntelligenceEvent
 *  - On startup, previous health states are loaded from DB
 *  - `getHistory(serviceName, limit)` returns the last N results from DB
 */

import { fetchService } from './service-client';
import type { SERVICE_ENDPOINTS } from './types';
import { db } from '@/lib/db';

// ===== Types =====

export type HealthStatus = 'healthy' | 'degraded' | 'unhealthy' | 'unknown';

export interface HealthCheckResult {
  service: string;
  status: HealthStatus;
  latencyMs: number;
  lastCheck: Date;
  consecutiveFailures: number;
  consecutiveSuccesses: number;
  metadata?: Record<string, unknown>;
}

export interface HealthCheckRegistry {
  checks: Map<string, HealthCheckResult>;
  runAll(): Promise<HealthCheckResult[]>;
  runOne(service: string): Promise<HealthCheckResult>;
  getStatus(): Record<string, HealthCheckResult>;
  getHistory(serviceName: string, limit?: number): Promise<HealthCheckResult[]>;
}

// ===== Service Check Definitions =====

type ServiceKey = keyof typeof SERVICE_ENDPOINTS;

interface ServiceCheckDefinition {
  service: ServiceKey;
  path: string;
  description: string;
}

const SERVICE_CHECKS: ServiceCheckDefinition[] = [
  { service: 'whatsapp', path: '/status', description: 'WhatsApp Baileys Bridge' },
  { service: 'telegram', path: '/status', description: 'Telegram Telethon Bridge' },
  { service: 'osint', path: '/report', description: 'OSINT Shadowbroker Engine' },
  { service: 'cognitive', path: '/dashboard', description: 'Cognitive Analysis Engine' },
  { service: 'hermes', path: '/status', description: 'Hermes Communication Hub' },
  { service: 'shadowbrokerAi', path: '/status', description: 'Shadowbroker AI Engine' },
  { service: 'backend', path: '/health', description: 'Backend Core API' },
];

// ===== Status Determination =====

/**
 * Determines health status based on:
 *  - Latency < 2s & response OK → 'healthy'
 *  - Latency < 5s OR 1-2 consecutive failures → 'degraded'
 *  - Latency > 5s OR 3+ consecutive failures → 'unhealthy'
 */
function determineStatus(
  latencyMs: number,
  hasError: boolean,
  consecutiveFailures: number,
): HealthStatus {
  // 3+ consecutive failures → unhealthy regardless of latency
  if (consecutiveFailures >= 3) return 'unhealthy';
  // Any error at all with high latency → unhealthy
  if (hasError && latencyMs > 5000) return 'unhealthy';
  // Error with moderate latency or 1-2 failures → degraded
  if (hasError || consecutiveFailures >= 1) return 'degraded';
  // High latency without error → degraded
  if (latencyMs >= 5000) return 'degraded';
  // Moderate latency → degraded
  if (latencyMs >= 2000) return 'degraded';
  // Low latency, no error → healthy
  return 'healthy';
}

// ===== DB Persistence Helpers =====

/**
 * Persist a health check result to the IntelligenceEvent table.
 * Silently catches errors to avoid disrupting the health check flow.
 */
async function persistHealthCheck(result: HealthCheckResult): Promise<void> {
  try {
    await db.intelligenceEvent.create({
      data: {
        eventType: 'health_check.result',
        aggregateId: `health:${result.service}`,
        aggregateType: 'health_check',
        stream: 'whatomate:system',
        payload: JSON.stringify(result),
        processed: true,
      },
    });
  } catch (err) {
    // Silently swallow — persistence should not break health checks
    console.error(`[health-check] Failed to persist result for ${result.service}:`, err);
  }
}

/**
 * Load the most recent health check result for each service from DB.
 * Returns a Map of service name → HealthCheckResult.
 */
async function loadPreviousStatesFromDB(): Promise<Map<string, HealthCheckResult>> {
  const previousStates = new Map<string, HealthCheckResult>();

  try {
    // Get the latest event per service by querying for each aggregate
    for (const checkDef of SERVICE_CHECKS) {
      const aggregateId = `health:${checkDef.service}`;
      const latestEvent = await db.intelligenceEvent.findFirst({
        where: {
          eventType: 'health_check.result',
          aggregateId,
        },
        orderBy: { timestamp: 'desc' },
        take: 1,
      });

      if (latestEvent) {
        try {
          const result = JSON.parse(latestEvent.payload) as HealthCheckResult;
          previousStates.set(checkDef.service, result);
        } catch {
          // Ignore malformed payload
        }
      }
    }
  } catch (err) {
    // DB might not be available yet — that's fine, start fresh
    console.error('[health-check] Failed to load previous states from DB:', err);
  }

  return previousStates;
}

// ===== Singleton Registry =====

class HealthCheckRegistryImpl implements HealthCheckRegistry {
  checks: Map<string, HealthCheckResult> = new Map();
  private initialized = false;

  /**
   * Initialize the registry by loading previous health states from DB.
   * Called automatically on first runOne/runAll if not already done.
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    const previousStates = await loadPreviousStatesFromDB();
    for (const [service, result] of previousStates) {
      this.checks.set(service, result);
    }

    this.initialized = true;
  }

  /**
   * Run a health check for a single service.
   * Pings the service endpoint and measures latency, then updates the registry
   * and persists the result to the database.
   */
  async runOne(serviceName: string): Promise<HealthCheckResult> {
    // Ensure previous states are loaded on first call
    if (!this.initialized) {
      await this.initialize();
    }

    const definition = SERVICE_CHECKS.find((s) => s.service === serviceName);

    if (!definition) {
      const unknownResult: HealthCheckResult = {
        service: serviceName,
        status: 'unknown',
        latencyMs: 0,
        lastCheck: new Date(),
        consecutiveFailures: 0,
        consecutiveSuccesses: 0,
        metadata: { error: 'Service not registered in health check definitions' },
      };
      this.checks.set(serviceName, unknownResult);
      // Persist unknown result
      await persistHealthCheck(unknownResult);
      return unknownResult;
    }

    const previous = this.checks.get(serviceName);
    const start = Date.now();

    try {
      const response = await fetchService<Record<string, unknown>>(
        definition.service,
        definition.path,
        { signal: AbortSignal.timeout(8000) },
      );

      const latencyMs = Date.now() - start;
      const hasError = response.error !== null;

      // Update consecutive counters
      let consecutiveFailures = hasError ? (previous?.consecutiveFailures ?? 0) + 1 : 0;
      let consecutiveSuccesses = hasError ? 0 : (previous?.consecutiveSuccesses ?? 0) + 1;

      const status = determineStatus(latencyMs, hasError, consecutiveFailures);

      const result: HealthCheckResult = {
        service: serviceName,
        status,
        latencyMs,
        lastCheck: new Date(),
        consecutiveFailures,
        consecutiveSuccesses,
        metadata: hasError
          ? { error: response.error, description: definition.description }
          : { description: definition.description, responseOk: true },
      };

      this.checks.set(serviceName, result);
      // Persist to DB
      await persistHealthCheck(result);
      return result;
    } catch (err) {
      const latencyMs = Date.now() - start;
      const consecutiveFailures = (previous?.consecutiveFailures ?? 0) + 1;
      const consecutiveSuccesses = 0;
      const status = determineStatus(latencyMs, true, consecutiveFailures);

      const result: HealthCheckResult = {
        service: serviceName,
        status,
        latencyMs,
        lastCheck: new Date(),
        consecutiveFailures,
        consecutiveSuccesses,
        metadata: {
          error: err instanceof Error ? err.message : 'Unknown error',
          description: definition.description,
        },
      };

      this.checks.set(serviceName, result);
      // Persist to DB
      await persistHealthCheck(result);
      return result;
    }
  }

  /**
   * Run all registered health checks in parallel.
   */
  async runAll(): Promise<HealthCheckResult[]> {
    // Ensure previous states are loaded on first call
    if (!this.initialized) {
      await this.initialize();
    }

    const results = await Promise.all(
      SERVICE_CHECKS.map((def) => this.runOne(def.service)),
    );
    return results;
  }

  /**
   * Get the current status of all services from the registry.
   * Returns a plain object (not Map) for easy serialization.
   */
  getStatus(): Record<string, HealthCheckResult> {
    const status: Record<string, HealthCheckResult> = {};
    for (const [key, value] of this.checks) {
      status[key] = value;
    }
    return status;
  }

  /**
   * Get the last N health check results for a service from the database.
   * Useful for historical analysis, trend charts, and debugging.
   *
   * @param serviceName - The service name (e.g., 'whatsapp', 'hermes')
   * @param limit - Maximum number of results to return (default: 20)
   * @returns Array of HealthCheckResult ordered by most recent first
   */
  async getHistory(serviceName: string, limit: number = 20): Promise<HealthCheckResult[]> {
    const aggregateId = `health:${serviceName}`;

    try {
      const events = await db.intelligenceEvent.findMany({
        where: {
          eventType: 'health_check.result',
          aggregateId,
        },
        orderBy: { timestamp: 'desc' },
        take: limit,
      });

      const results: HealthCheckResult[] = [];
      for (const event of events) {
        try {
          const parsed = JSON.parse(event.payload) as HealthCheckResult;
          results.push(parsed);
        } catch {
          // Skip malformed payloads
        }
      }

      return results;
    } catch (err) {
      console.error(`[health-check] Failed to load history for ${serviceName}:`, err);
      return [];
    }
  }
}

// ===== Singleton Export =====

export const healthRegistry: HealthCheckRegistry = new HealthCheckRegistryImpl();
