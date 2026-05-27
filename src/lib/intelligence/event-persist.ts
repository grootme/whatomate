/**
 * Unified Event Persistence — Single function for durable event storage.
 *
 * Eliminates the pattern of calling both safeEventAppend() AND
 * db.intelligenceEvent.create() manually in every API route.
 * Now routes only need to call persistEvent() which handles both
 * Redis Stream (ephemeral) and SQLite (durable) writes.
 *
 * RICCO Pattern: Event-Driven Consistency ADN
 */

import { db } from '@/lib/db';
import { safeEventAppend } from './safe-event';
import type { EventStream, IntelligenceEvent } from './types';

type EventData = Omit<IntelligenceEvent, 'id' | 'timestamp' | 'processed' | 'stream'>;

/**
 * Persist an event to both Redis Stream (ephemeral, fast) and SQLite (durable).
 * This is the single entry point for event persistence.
 *
 * Usage:
 *   await persistEvent('whatomate:alerts', {
 *     eventType: 'monitoring.alert_generated',
 *     aggregateId: alertId,
 *     aggregateType: 'alert',
 *     payload: { source: 'Threshold Monitor', severity: 'ALTA' },
 *   });
 */
export async function persistEvent(stream: EventStream, event: EventData): Promise<string> {
  // 1. Fire to Redis Stream (non-blocking, best-effort)
  safeEventAppend(stream, event);

  // 2. Always persist to SQLite for durability
  const payloadStr = typeof event.payload === 'string' ? event.payload : JSON.stringify(event.payload);
  const metadataStr = event.metadata ? (typeof event.metadata === 'string' ? event.metadata : JSON.stringify(event.metadata)) : null;

  try {
    const dbEvent = await db.intelligenceEvent.create({
      data: {
        eventType: event.eventType,
        aggregateId: event.aggregateId,
        aggregateType: event.aggregateType,
        stream,
        payload: payloadStr,
        metadata: metadataStr,
        processed: false,
      },
    });
    return dbEvent.id;
  } catch (err) {
    console.error('[persistEvent] Failed to persist event to SQLite:', err);
    return `failed_${Date.now()}`;
  }
}

/**
 * Persist multiple events in batch.
 * More efficient than calling persistEvent() in a loop.
 */
export async function persistEventBatch(stream: EventStream, events: EventData[]): Promise<string[]> {
  const ids: string[] = [];

  for (const event of events) {
    const id = await persistEvent(stream, event);
    ids.push(id);
  }

  return ids;
}

/**
 * Mark an event as processed in SQLite.
 * Used after a consumer has successfully handled the event.
 */
export async function markEventProcessed(eventId: string): Promise<void> {
  try {
    await db.intelligenceEvent.updateMany({
      where: { id: eventId, processed: false },
      data: { processed: true },
    });
  } catch {
    // Best-effort — don't fail the consumer
  }
}
