/**
 * Safe Event Emitter — wraps eventStore calls so Redis unavailability
 * doesn't block API responses.
 *
 * Strategy: Fire-and-forget with internal timeout. The caller should
 * also persist events to the IntelligenceEvent SQLite table as the
 * durable fallback.
 */

import { eventStore } from '@/lib/intelligence/event-store';
import type { EventStream, IntelligenceEvent } from '@/lib/intelligence/types';

const REDIS_TIMEOUT_MS = 2000;

/**
 * Safely append an event to the Redis event store (fire-and-forget).
 * If Redis is unavailable or slow, this silently fails.
 * The event MUST also be persisted to the IntelligenceEvent SQLite table
 * by the caller as the durable fallback.
 */
export function safeEventAppend(
  stream: EventStream,
  event: Omit<IntelligenceEvent, 'id' | 'timestamp' | 'processed' | 'stream'>
): void {
  // Fire and forget — do not await
  const timeout = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error('Redis timeout')), REDIS_TIMEOUT_MS)
  );

  Promise.race([eventStore.append(stream, event), timeout]).catch(() => {
    // Redis unavailable or timed out — silently fail
    // Event should be persisted to SQLite by the caller
  });
}
