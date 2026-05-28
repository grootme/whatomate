/**
 * Integration tests for rate-limiter.ts
 *
 * Tests the rate limiter (sliding window counter) and circuit breaker
 * (closed → open → half-open → closed state machine) logic.
 *
 * Since these functions are factory functions that return closures,
 * we test them directly without needing DB — the in-memory fallback
 * path is used by providing a factory that forces the in-memory path.
 */

import {
  createRateLimiter,
  createCircuitBreaker,
  type CircuitBreakerState,
} from '../rate-limiter';

// ===== RATE LIMITER =====

describe('createRateLimiter', () => {
  it('allows requests under the limit', async () => {
    const checkRateLimit = createRateLimiter({ maxRequests: 5, windowMs: 60000 });

    // First request should be allowed
    const result = await checkRateLimit('test-key');
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBeGreaterThanOrEqual(0);
    expect(result.resetAt).toBeInstanceOf(Date);
  });

  it('decrements remaining count on each allowed request', async () => {
    const checkRateLimit = createRateLimiter({ maxRequests: 3, windowMs: 60000 });

    const r1 = await checkRateLimit('test-key-2');
    const r2 = await checkRateLimit('test-key-2');
    expect(r1.allowed).toBe(true);
    expect(r2.allowed).toBe(true);
    // Remaining should decrease
    expect(r2.remaining).toBeLessThan(r1.remaining);
  });

  it('blocks requests over the limit', async () => {
    const checkRateLimit = createRateLimiter({ maxRequests: 2, windowMs: 60000 });

    const r1 = await checkRateLimit('test-key-3');
    const r2 = await checkRateLimit('test-key-3');
    const r3 = await checkRateLimit('test-key-3');

    expect(r1.allowed).toBe(true);
    expect(r2.allowed).toBe(true);
    // Third request should be blocked
    expect(r3.allowed).toBe(false);
    expect(r3.remaining).toBe(0);
  });

  it('resets the window after the time period elapses', async () => {
    // Very short window for testing
    const checkRateLimit = createRateLimiter({ maxRequests: 1, windowMs: 100 });

    const r1 = await checkRateLimit('test-key-4');
    expect(r1.allowed).toBe(true);

    const r2 = await checkRateLimit('test-key-4');
    expect(r2.allowed).toBe(false);

    // Wait for window to reset
    await new Promise(resolve => setTimeout(resolve, 150));

    const r3 = await checkRateLimit('test-key-4');
    expect(r3.allowed).toBe(true);
  });

  it('tracks different keys independently', async () => {
    const checkRateLimit = createRateLimiter({ maxRequests: 1, windowMs: 60000 });

    const r1 = await checkRateLimit('key-a');
    const r2 = await checkRateLimit('key-b');

    expect(r1.allowed).toBe(true);
    expect(r2.allowed).toBe(true);
  });

  it('returns resetAt as the end of the current window', async () => {
    const checkRateLimit = createRateLimiter({ maxRequests: 5, windowMs: 60000 });
    const before = Date.now();
    const result = await checkRateLimit('test-key-5');
    const after = Date.now();

    // resetAt should be within the window from now
    expect(result.resetAt.getTime()).toBeGreaterThanOrEqual(before + 60000 - 1000);
    expect(result.resetAt.getTime()).toBeLessThanOrEqual(after + 60000 + 1000);
  });
});

// ===== CIRCUIT BREAKER =====

describe('createCircuitBreaker', () => {
  it('starts in closed state', () => {
    const cb = createCircuitBreaker(3, 5000);
    const state = cb.getState('service-a');
    expect(state.state).toBe('closed');
    expect(state.failures).toBe(0);
    expect(state.lastFailure).toBeNull();
    expect(state.nextRetry).toBeNull();
  });

  it('allows requests in closed state', () => {
    const cb = createCircuitBreaker(3, 5000);
    const result = cb.check('service-a');
    expect(result.allowed).toBe(true);
    expect(result.state.state).toBe('closed');
  });

  it('transitions from closed to open after reaching failure threshold', () => {
    const cb = createCircuitBreaker(3, 5000);

    cb.recordFailure('service-a');
    cb.recordFailure('service-a');
    expect(cb.getState('service-a').state).toBe('closed');
    expect(cb.getState('service-a').failures).toBe(2);

    cb.recordFailure('service-a');
    expect(cb.getState('service-a').state).toBe('open');
    expect(cb.getState('service-a').failures).toBe(3);
    expect(cb.getState('service-a').nextRetry).not.toBeNull();
  });

  it('blocks requests in open state', () => {
    const cb = createCircuitBreaker(3, 60000); // Long timeout

    // Trigger open state
    cb.recordFailure('service-b');
    cb.recordFailure('service-b');
    cb.recordFailure('service-b');

    const result = cb.check('service-b');
    expect(result.allowed).toBe(false);
    expect(result.state.state).toBe('open');
  });

  it('transitions from open to half-open after reset timeout', () => {
    const cb = createCircuitBreaker(3, 50); // Very short timeout for testing

    // Trigger open state
    cb.recordFailure('service-c');
    cb.recordFailure('service-c');
    cb.recordFailure('service-c');
    expect(cb.getState('service-c').state).toBe('open');

    // Wait for reset timeout
    const before = Date.now();
    return new Promise<void>((resolve) => {
      setTimeout(() => {
        const result = cb.check('service-c');
        expect(result.allowed).toBe(true);
        expect(result.state.state).toBe('half-open');
        resolve();
      }, 100);
    });
  });

  it('allows only one test request in half-open state', () => {
    const cb = createCircuitBreaker(3, 50);

    // Trigger open → wait → half-open
    cb.recordFailure('service-d');
    cb.recordFailure('service-d');
    cb.recordFailure('service-d');

    return new Promise<void>((resolve) => {
      setTimeout(() => {
        const r1 = cb.check('service-d');
        expect(r1.allowed).toBe(true);
        expect(r1.state.state).toBe('half-open');

        // Second request in half-open should be blocked
        const r2 = cb.check('service-d');
        expect(r2.allowed).toBe(false);
        expect(r2.state.state).toBe('half-open');

        resolve();
      }, 100);
    });
  });

  it('transitions from half-open to closed on success', () => {
    const cb = createCircuitBreaker(3, 50);

    // Open the circuit
    cb.recordFailure('service-e');
    cb.recordFailure('service-e');
    cb.recordFailure('service-e');

    return new Promise<void>((resolve) => {
      setTimeout(() => {
        // First check transitions to half-open
        cb.check('service-e');

        // Record success → should close the circuit
        cb.recordSuccess('service-e');
        const state = cb.getState('service-e');
        expect(state.state).toBe('closed');
        expect(state.failures).toBe(0);

        resolve();
      }, 100);
    });
  });

  it('transitions from half-open to open on failure', () => {
    const cb = createCircuitBreaker(3, 50);

    // Open the circuit
    cb.recordFailure('service-f');
    cb.recordFailure('service-f');
    cb.recordFailure('service-f');

    return new Promise<void>((resolve) => {
      setTimeout(() => {
        // First check transitions to half-open
        cb.check('service-f');

        // Record failure in half-open → should re-open
        cb.recordFailure('service-f');
        const state = cb.getState('service-f');
        expect(state.state).toBe('open');
        expect(state.nextRetry).not.toBeNull();

        resolve();
      }, 100);
    });
  });

  it('resets failure count on success in closed state', () => {
    const cb = createCircuitBreaker(3, 5000);

    cb.recordFailure('service-g');
    cb.recordFailure('service-g');
    expect(cb.getState('service-g').failures).toBe(2);

    cb.recordSuccess('service-g');
    expect(cb.getState('service-g').failures).toBe(0);
    expect(cb.getState('service-g').state).toBe('closed');
  });

  it('full state cycle: closed → open → half-open → closed', () => {
    const cb = createCircuitBreaker(2, 50);

    // 1. CLOSED state — allow requests
    let result = cb.check('service-cycle');
    expect(result.allowed).toBe(true);
    expect(result.state.state).toBe('closed');

    // 2. Accumulate failures → transition to OPEN
    cb.recordFailure('service-cycle');
    cb.recordFailure('service-cycle'); // hits threshold of 2
    expect(cb.getState('service-cycle').state).toBe('open');

    // 3. OPEN state — block requests
    result = cb.check('service-cycle');
    expect(result.allowed).toBe(false);

    // 4. Wait for reset → HALF-OPEN
    return new Promise<void>((resolve) => {
      setTimeout(() => {
        result = cb.check('service-cycle');
        expect(result.allowed).toBe(true);
        expect(result.state.state).toBe('half-open');

        // 5. Success → CLOSED
        cb.recordSuccess('service-cycle');
        const finalState = cb.getState('service-cycle');
        expect(finalState.state).toBe('closed');
        expect(finalState.failures).toBe(0);
        expect(finalState.lastFailure).toBeNull();
        expect(finalState.nextRetry).toBeNull();

        resolve();
      }, 100);
    });
  });

  it('tracks different services independently', () => {
    const cb = createCircuitBreaker(2, 5000);

    cb.recordFailure('svc-x');
    cb.recordFailure('svc-x');
    expect(cb.getState('svc-x').state).toBe('open');

    expect(cb.getState('svc-y').state).toBe('closed');
    expect(cb.getState('svc-y').failures).toBe(0);
  });

  it('incremental failure count tracking in closed state', () => {
    const cb = createCircuitBreaker(5, 5000);

    for (let i = 0; i < 4; i++) {
      cb.recordFailure('service-incr');
      expect(cb.getState('service-incr').failures).toBe(i + 1);
      expect(cb.getState('service-incr').state).toBe('closed');
    }
  });
});
