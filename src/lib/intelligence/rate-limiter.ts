/**
 * Rate Limiter & Circuit Breaker — Resilience Patterns for Microservice Calls
 *
 * In-memory rate limiter using sliding window counters and a circuit breaker
 * with closed → open → half-open state machine.
 */

// ===== Rate Limiter =====

export interface RateLimiterOptions {
  maxRequests: number; // max requests per window
  windowMs: number; // time window in milliseconds
}

interface RateLimiterEntry {
  count: number;
  windowStart: number; // timestamp in ms
}

/**
 * Creates an in-memory rate limiter.
 *
 * Uses a Map of key → { count, windowStart }.
 * When the current time is past windowStart + windowMs, the counter resets.
 *
 * @returns A function that checks if a request is allowed for a given key.
 */
export function createRateLimiter(options: RateLimiterOptions) {
  const { maxRequests, windowMs } = options;
  const entries = new Map<string, RateLimiterEntry>();

  // Periodic cleanup of stale entries to prevent memory leaks
  const CLEANUP_INTERVAL_MS = 60_000; // 1 minute
  let lastCleanup = Date.now();

  function cleanup(now: number): void {
    if (now - lastCleanup < CLEANUP_INTERVAL_MS) return;
    lastCleanup = now;

    for (const [key, entry] of entries) {
      if (now - entry.windowStart > windowMs * 2) {
        entries.delete(key);
      }
    }
  }

  return function checkRateLimit(key: string): {
    allowed: boolean;
    remaining: number;
    resetAt: Date;
  } {
    const now = Date.now();
    cleanup(now);

    let entry = entries.get(key);

    // If window expired or no entry exists, start a new window
    if (!entry || now - entry.windowStart >= windowMs) {
      entry = { count: 0, windowStart: now };
      entries.set(key, entry);
    }

    const remaining = Math.max(0, maxRequests - entry.count);
    const resetAt = new Date(entry.windowStart + windowMs);

    if (entry.count >= maxRequests) {
      return { allowed: false, remaining: 0, resetAt };
    }

    entry.count += 1;
    return { allowed: true, remaining: remaining - 1, resetAt };
  };
}

// ===== Circuit Breaker =====

export interface CircuitBreakerState {
  state: 'closed' | 'open' | 'half-open';
  failures: number;
  lastFailure: Date | null;
  nextRetry: Date | null;
}

interface CircuitBreakerEntry {
  state: 'closed' | 'open' | 'half-open';
  failures: number;
  lastFailure: Date | null;
  nextRetry: Date | null;
  halfOpenAttempts: number;
}

/**
 * Creates a circuit breaker instance.
 *
 * State machine:
 *  - `closed` → Normal operation. Requests pass through.
 *  - When failures >= threshold → `open` (blocks all requests).
 *  - After resetTimeoutMs → `half-open` (allows 1 test request).
 *  - If test succeeds → `closed`, if fails → `open` again.
 *
 * @param failureThreshold Number of failures before opening the circuit.
 * @param resetTimeoutMs Time in ms before attempting half-open.
 */
export function createCircuitBreaker(failureThreshold: number, resetTimeoutMs: number) {
  const entries = new Map<string, CircuitBreakerEntry>();

  function getOrCreate(service: string): CircuitBreakerEntry {
    let entry = entries.get(service);
    if (!entry) {
      entry = {
        state: 'closed',
        failures: 0,
        lastFailure: null,
        nextRetry: null,
        halfOpenAttempts: 0,
      };
      entries.set(service, entry);
    }
    return entry;
  }

  function toPublicState(entry: CircuitBreakerEntry): CircuitBreakerState {
    return {
      state: entry.state,
      failures: entry.failures,
      lastFailure: entry.lastFailure,
      nextRetry: entry.nextRetry,
    };
  }

  /**
   * Check if a request is allowed through the circuit breaker.
   *
   * - In `closed` state: always allowed.
   * - In `open` state: blocked unless resetTimeoutMs has elapsed,
   *   in which case it transitions to `half-open`.
   * - In `half-open` state: allowed for one test request.
   */
  function check(service: string): { allowed: boolean; state: CircuitBreakerState } {
    const entry = getOrCreate(service);
    const now = new Date();

    switch (entry.state) {
      case 'closed':
        return { allowed: true, state: toPublicState(entry) };

      case 'open': {
        // Check if we should transition to half-open
        if (entry.nextRetry && now >= entry.nextRetry) {
          entry.state = 'half-open';
          entry.halfOpenAttempts = 0;
          return { allowed: true, state: toPublicState(entry) };
        }
        return { allowed: false, state: toPublicState(entry) };
      }

      case 'half-open': {
        // Allow only one test request at a time
        if (entry.halfOpenAttempts === 0) {
          entry.halfOpenAttempts = 1;
          return { allowed: true, state: toPublicState(entry) };
        }
        // Additional requests while half-open are blocked (waiting for test result)
        return { allowed: false, state: toPublicState(entry) };
      }
    }
  }

  /**
   * Record a successful request. If the circuit is in half-open,
   * this transitions it back to closed.
   */
  function recordSuccess(service: string): void {
    const entry = getOrCreate(service);

    switch (entry.state) {
      case 'half-open':
        // Test request succeeded → close the circuit
        entry.state = 'closed';
        entry.failures = 0;
        entry.lastFailure = null;
        entry.nextRetry = null;
        entry.halfOpenAttempts = 0;
        break;

      case 'closed':
        // Reset consecutive failure count on success
        entry.failures = 0;
        break;

      case 'open':
        // Should not happen, but if it does, don't change state
        break;
    }
  }

  /**
   * Record a failed request. Increments failure count and potentially
   * opens the circuit.
   */
  function recordFailure(service: string): void {
    const entry = getOrCreate(service);
    const now = new Date();

    entry.failures += 1;
    entry.lastFailure = now;

    switch (entry.state) {
      case 'half-open':
        // Test request failed → re-open the circuit
        entry.state = 'open';
        entry.nextRetry = new Date(now.getTime() + resetTimeoutMs);
        entry.halfOpenAttempts = 0;
        break;

      case 'closed':
        // If failures reach threshold, open the circuit
        if (entry.failures >= failureThreshold) {
          entry.state = 'open';
          entry.nextRetry = new Date(now.getTime() + resetTimeoutMs);
        }
        break;

      case 'open':
        // Already open, update next retry
        entry.nextRetry = new Date(now.getTime() + resetTimeoutMs);
        break;
    }
  }

  /**
   * Get the current circuit breaker state for a service.
   */
  function getState(service: string): CircuitBreakerState {
    const entry = getOrCreate(service);
    return toPublicState(entry);
  }

  return { check, recordSuccess, recordFailure, getState };
}
