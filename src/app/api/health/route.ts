import { NextResponse } from 'next/server';
import { healthRegistry } from '@/lib/intelligence/health-check';

/**
 * GET /api/health
 *
 * Returns the health status of all registered microservices.
 * Runs health checks first, then returns the results.
 */
export async function GET() {
  try {
    const results = await healthRegistry.runAll();

    // Compute overall system health
    const totalServices = results.length;
    const healthyCount = results.filter((r) => r.status === 'healthy').length;
    const degradedCount = results.filter((r) => r.status === 'degraded').length;
    const unhealthyCount = results.filter((r) => r.status === 'unhealthy').length;
    const unknownCount = results.filter((r) => r.status === 'unknown').length;

    let overallStatus: 'healthy' | 'degraded' | 'unhealthy';
    if (unhealthyCount > 0) {
      overallStatus = 'unhealthy';
    } else if (degradedCount > 0) {
      overallStatus = 'degraded';
    } else {
      overallStatus = 'healthy';
    }

    // Compute average latency across all services
    const avgLatencyMs =
      totalServices > 0
        ? Math.round(results.reduce((sum, r) => sum + r.latencyMs, 0) / totalServices)
        : 0;

    return NextResponse.json({
      status: overallStatus,
      timestamp: new Date().toISOString(),
      summary: {
        total: totalServices,
        healthy: healthyCount,
        degraded: degradedCount,
        unhealthy: unhealthyCount,
        unknown: unknownCount,
        avgLatencyMs,
      },
      services: results.map((r) => ({
        service: r.service,
        status: r.status,
        latencyMs: r.latencyMs,
        lastCheck: r.lastCheck.toISOString(),
        consecutiveFailures: r.consecutiveFailures,
        consecutiveSuccesses: r.consecutiveSuccesses,
        metadata: r.metadata,
      })),
    });
  } catch (error) {
    return NextResponse.json(
      {
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        error: error instanceof Error ? error.message : 'Health check failed',
      },
      { status: 503 },
    );
  }
}
