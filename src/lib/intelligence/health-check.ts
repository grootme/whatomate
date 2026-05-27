/**
 * Health Check Registry — Microservice Health Monitoring
 *
 * Monitors microservice health beyond simple HTTP ping by tracking latency,
 * consecutive failures/successes, and determining status through a
 * multi-signal evaluation.
 */

import { fetchService } from './service-client';
import type { SERVICE_ENDPOINTS } from './types';

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

// ===== Singleton Registry =====

class HealthCheckRegistryImpl implements HealthCheckRegistry {
  checks: Map<string, HealthCheckResult> = new Map();

  /**
   * Run a health check for a single service.
   * Pings the service endpoint and measures latency, then updates the registry.
   */
  async runOne(serviceName: string): Promise<HealthCheckResult> {
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
      return result;
    }
  }

  /**
   * Run all registered health checks in parallel.
   */
  async runAll(): Promise<HealthCheckResult[]> {
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
}

// ===== Singleton Export =====

export const healthRegistry: HealthCheckRegistry = new HealthCheckRegistryImpl();
