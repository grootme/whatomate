/**
 * Event Store — RICCO ADN: Event-Driven Consistency
 * 
 * Implements Event Sourcing pattern where all state changes are captured
 * as events in Redis Streams AND the SQLite IntelligenceEvent table.
 * 
 * Dual-write strategy:
 * 1. Write to Redis Streams (fast, ephemeral, for real-time consumers)
 * 2. Write to SQLite IntelligenceEvent table (durable, persistent)
 * 
 * If Redis is unavailable, events are still persisted to SQLite.
 * Reads fall back to SQLite when Redis is not available.
 */

import { db } from '@/lib/db';
import type { IntelligenceEvent, IntelligenceEventType, EventStream } from './types';

// Redis client for Streams
let redis: any = null;
let redisConnectionAttempted = false;
let redisAvailable = false;

const REDIS_CONNECT_TIMEOUT = 3000; // 3s connection timeout

function isRedisEnabled(): boolean {
  // Skip Redis if explicitly disabled or if host is not set to a real value
  const host = process.env.REDIS_HOST;
  if (!host || host === 'undefined' || host === '') return false;
  return true;
}

async function getRedis(): Promise<any> {
  if (redisConnectionAttempted && !redisAvailable) return null;
  if (!redisConnectionAttempted) {
    redisConnectionAttempted = true;

    if (!isRedisEnabled()) {
      return null;
    }

    try {
      const Redis = (await import('ioredis')).default;
      redis = new Redis({
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379'),
        maxRetriesPerRequest: 1,
        connectTimeout: REDIS_CONNECT_TIMEOUT,
        commandTimeout: 3000,
        lazyConnect: true,
        retryStrategy(times) {
          if (times > 1) return null; // Stop retrying after 1 attempt
          return 200;
        },
      });

      // Suppress unhandled error events from ioredis
      redis.on('error', () => {
        // Silently ignore Redis connection errors
      });

      // Attempt connection with timeout
      await Promise.race([
        redis.connect(),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Redis connection timeout')), REDIS_CONNECT_TIMEOUT)
        ),
      ]);

      redisAvailable = true;
    } catch {
      // Connection failed — mark as unavailable
      redisAvailable = false;
      if (redis) {
        try { redis.disconnect(); } catch { /* ignore */ }
        redis = null;
      }
      return null;
    }
  }
  return redisAvailable ? redis : null;
}

// ===== EVENT STORE =====

export class EventStore {
  /**
   * Append an event to the event store.
   * Dual-write: Redis Stream + SQLite IntelligenceEvent table.
   * Redis is optional; SQLite write is always attempted for durability.
   */
  async append(stream: EventStream, event: Omit<IntelligenceEvent, 'id' | 'timestamp' | 'processed' | 'stream'>): Promise<string> {
    const id = `evt_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    const payloadStr = JSON.stringify(event.payload);
    const metadataStr = event.metadata ? JSON.stringify(event.metadata) : null;

    // 1. Try to write to Redis Stream (fast, ephemeral)
    const r = await getRedis();
    if (r) {
      const eventData = {
        id,
        eventType: event.eventType,
        aggregateId: event.aggregateId,
        aggregateType: event.aggregateType,
        stream,
        payload: payloadStr,
        metadata: metadataStr || '',
        timestamp: new Date().toISOString(),
        processed: '0',
      };

      try {
        await r.xadd(stream, '*', eventData);
      } catch {
        // Redis command failed — continue to SQLite fallback
      }
    }

    // 2. Always persist to SQLite IntelligenceEvent table for durability
    try {
      await db.intelligenceEvent.create({
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
    } catch (err) {
      console.error('[EventStore] Failed to persist event to SQLite:', err);
    }

    return id;
  }

  /**
   * Load events for an aggregate from the store.
   * Checks Redis first, then falls back to SQLite.
   */
  async load(aggregateId: string, stream?: EventStream): Promise<IntelligenceEvent[]> {
    const events: IntelligenceEvent[] = [];

    // 1. Try Redis first
    const r = await getRedis();
    if (r) {
      const streams = stream ? [stream] : [
        'whatomate:whatsapp_messages',
        'whatomate:telegram_messages',
        'whatomate:osint_events',
        'whatomate:analyzed_messages',
        'whatomate:intel_events',
        'whatomate:threat_assessments',
        'whatomate:alerts',
        'whatomate:decisions',
        'whatomate:patterns',
        'whatomate:cognitive_updates',
        'whatomate:predictions',
        'whatomate:reports',
      ] as EventStream[];

      for (const s of streams) {
        try {
          const result = await r.xrange(s, '-', '+', 'COUNT', 500);
          if (result) {
            for (const [_, fields] of result) {
              if (fields.aggregateId === aggregateId) {
                events.push(this.deserializeEvent(fields));
              }
            }
          }
        } catch {
          // Stream may not exist yet
        }
      }
    }

    // 2. Also check SQLite (either as primary if Redis unavailable, or as supplement)
    try {
      const dbEvents = await db.intelligenceEvent.findMany({
        where: { aggregateId },
        orderBy: { timestamp: 'asc' },
        take: 500,
      });

      // Merge: add DB events that aren't already in the Redis results
      const existingIds = new Set(events.map(e => e.aggregateId + e.eventType + e.timestamp?.getTime()));
      for (const dbe of dbEvents) {
        const key = dbe.aggregateId + dbe.eventType + dbe.timestamp.getTime();
        if (!existingIds.has(key)) {
          events.push({
            id: dbe.id,
            eventType: dbe.eventType as IntelligenceEventType,
            aggregateId: dbe.aggregateId,
            aggregateType: dbe.aggregateType as IntelligenceEvent['aggregateType'],
            stream: dbe.stream as EventStream,
            payload: dbe.payload ? JSON.parse(dbe.payload) : {},
            metadata: dbe.metadata ? JSON.parse(dbe.metadata) : undefined,
            timestamp: dbe.timestamp,
            processed: dbe.processed,
          });
        }
      }
    } catch (err) {
      console.error('[EventStore] Failed to load events from SQLite:', err);
    }

    return events.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  }

  /**
   * Read new events from a stream using consumer group
   */
  async readNew(stream: EventStream, consumerGroup: string, consumerName: string, count: number = 10): Promise<IntelligenceEvent[]> {
    const r = await getRedis();
    if (!r) {
      // Fallback: read unprocessed events from SQLite
      try {
        const dbEvents = await db.intelligenceEvent.findMany({
          where: { stream, processed: false },
          orderBy: { timestamp: 'asc' },
          take: count,
        });
        return dbEvents.map(dbe => ({
          id: dbe.id,
          eventType: dbe.eventType as IntelligenceEventType,
          aggregateId: dbe.aggregateId,
          aggregateType: dbe.aggregateType as IntelligenceEvent['aggregateType'],
          stream: dbe.stream as EventStream,
          payload: dbe.payload ? JSON.parse(dbe.payload) : {},
          metadata: dbe.metadata ? JSON.parse(dbe.metadata) : undefined,
          timestamp: dbe.timestamp,
          processed: dbe.processed,
        }));
      } catch {
        return [];
      }
    }
    
    // Ensure consumer group exists
    try {
      await r.xgroup('CREATE', stream, consumerGroup, '0', 'MKSTREAM');
    } catch {
      // Group may already exist
    }

    const result = await r.xreadgroup(
      'GROUP', consumerGroup, consumerName,
      'COUNT', count,
      'BLOCK', 0,
      'STREAMS', stream, '>'
    );

    if (!result || !result[0]?.[1]) return [];

    return result[0][1].map(([_, fields]: [string, Record<string, string>]) => 
      this.deserializeEvent(fields)
    );
  }

  /**
   * Acknowledge event processing in consumer group
   */
  async ack(stream: EventStream, consumerGroup: string, eventId: string): Promise<void> {
    const r = await getRedis();
    if (r) {
      try {
        await r.xack(stream, consumerGroup, eventId);
      } catch {
        // Ignore Redis errors
      }
    }

    // Also mark as processed in SQLite
    try {
      await db.intelligenceEvent.updateMany({
        where: { id: eventId, processed: false },
        data: { processed: true },
      });
    } catch {
      // Ignore DB errors
    }
  }

  /**
   * Get recent events from a stream.
   * Checks Redis first; falls back to SQLite if Redis unavailable.
   */
  async getRecent(stream: EventStream, count: number = 20): Promise<IntelligenceEvent[]> {
    const r = await getRedis();
    if (r) {
      try {
        const result = await r.xrevrange(stream, '+', '-', 'COUNT', count);
        if (result && result.length > 0) {
          return result.map(([_, fields]: [string, Record<string, string>]) => 
            this.deserializeEvent(fields)
          );
        }
      } catch {
        // Fall through to SQLite
      }
    }

    // Fallback: read from SQLite
    try {
      const dbEvents = await db.intelligenceEvent.findMany({
        where: { stream },
        orderBy: { timestamp: 'desc' },
        take: count,
      });
      return dbEvents.map(dbe => ({
        id: dbe.id,
        eventType: dbe.eventType as IntelligenceEventType,
        aggregateId: dbe.aggregateId,
        aggregateType: dbe.aggregateType as IntelligenceEvent['aggregateType'],
        stream: dbe.stream as EventStream,
        payload: dbe.payload ? JSON.parse(dbe.payload) : {},
        metadata: dbe.metadata ? JSON.parse(dbe.metadata) : undefined,
        timestamp: dbe.timestamp,
        processed: dbe.processed,
      }));
    } catch {
      return [];
    }
  }

  /**
   * Get event counts per stream
   */
  async getStreamInfo(): Promise<Record<string, { length: number; firstEntry?: string; lastEntry?: string }>> {
    const r = await getRedis();
    const streams: EventStream[] = [
      'whatomate:whatsapp_messages',
      'whatomate:telegram_messages',
      'whatomate:osint_events',
      'whatomate:analyzed_messages',
      'whatomate:intel_events',
      'whatomate:threat_assessments',
      'whatomate:alerts',
      'whatomate:decisions',
      'whatomate:patterns',
      'whatomate:cognitive_updates',
    ];
    
    const info: Record<string, { length: number; firstEntry?: string; lastEntry?: string }> = {};

    if (r) {
      for (const stream of streams) {
        try {
          const streamInfo = await r.xinfo('STREAM', stream);
          info[stream] = {
            length: streamInfo[1] ?? 0,
            firstEntry: streamInfo[7]?.[1]?.timestamp,
            lastEntry: streamInfo[9]?.[1]?.timestamp,
          };
        } catch {
          // Stream may not exist in Redis; try SQLite
          try {
            const count = await db.intelligenceEvent.count({ where: { stream } });
            info[stream] = { length: count };
          } catch {
            info[stream] = { length: 0 };
          }
        }
      }
    } else {
      // No Redis — get counts from SQLite
      for (const stream of streams) {
        try {
          const count = await db.intelligenceEvent.count({ where: { stream } });
          info[stream] = { length: count };
        } catch {
          info[stream] = { length: 0 };
        }
      }
    }
    
    return info;
  }

  private deserializeEvent(fields: Record<string, string>): IntelligenceEvent {
    return {
      id: fields.id,
      eventType: fields.eventType as IntelligenceEventType,
      aggregateId: fields.aggregateId,
      aggregateType: fields.aggregateType as IntelligenceEvent['aggregateType'],
      stream: fields.stream as EventStream,
      payload: fields.payload ? JSON.parse(fields.payload) : {},
      metadata: fields.metadata ? JSON.parse(fields.metadata) : undefined,
      timestamp: new Date(fields.timestamp),
      processed: fields.processed === '1',
    };
  }
}

// Singleton
export const eventStore = new EventStore();
