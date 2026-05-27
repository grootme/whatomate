/**
 * Event Store — RICCO ADN: Event-Driven Consistency
 * 
 * Implements Event Sourcing pattern where all state changes are captured
 * as events in Redis Streams. Provides append-only log, event replay,
 * and consumer group management.
 */

import type { IntelligenceEvent, IntelligenceEventType, EventStream } from './types';

// Redis client for Streams
let redis: any = null;

async function getRedis() {
  if (!redis) {
    const Redis = (await import('ioredis')).default;
    redis = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      maxRetriesPerRequest: 3,
      retryStrategy(times) {
        const delay = Math.min(times * 200, 5000);
        return delay;
      },
    });
  }
  return redis;
}

// ===== EVENT STORE =====

export class EventStore {
  /**
   * Append an event to the event store (Redis Stream)
   * Event Sourcing: all state mutations are events
   */
  async append(stream: EventStream, event: Omit<IntelligenceEvent, 'id' | 'timestamp' | 'processed' | 'stream'>): Promise<string> {
    const r = await getRedis();
    const id = `evt_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    
    const eventData = {
      id,
      eventType: event.eventType,
      aggregateId: event.aggregateId,
      aggregateType: event.aggregateType,
      stream,
      payload: JSON.stringify(event.payload),
      metadata: event.metadata ? JSON.stringify(event.metadata) : '',
      timestamp: new Date().toISOString(),
      processed: '0',
    };

    await r.xadd(stream, '*', eventData);
    return id;
  }

  /**
   * Load events for an aggregate from the store
   */
  async load(aggregateId: string, stream?: EventStream): Promise<IntelligenceEvent[]> {
    const r = await getRedis();
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

    const events: IntelligenceEvent[] = [];
    
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

    return events.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  }

  /**
   * Read new events from a stream using consumer group
   */
  async readNew(stream: EventStream, consumerGroup: string, consumerName: string, count: number = 10): Promise<IntelligenceEvent[]> {
    const r = await getRedis();
    
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
    await r.xack(stream, consumerGroup, eventId);
  }

  /**
   * Get recent events from a stream
   */
  async getRecent(stream: EventStream, count: number = 20): Promise<IntelligenceEvent[]> {
    const r = await getRedis();
    try {
      const result = await r.xrevrange(stream, '+', '-', 'COUNT', count);
      if (!result) return [];
      return result.map(([_, fields]: [string, Record<string, string>]) => 
        this.deserializeEvent(fields)
      );
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
    
    for (const stream of streams) {
      try {
        const streamInfo = await r.xinfo('STREAM', stream);
        info[stream] = {
          length: streamInfo[1] ?? 0,
          firstEntry: streamInfo[7]?.[1]?.timestamp,
          lastEntry: streamInfo[9]?.[1]?.timestamp,
        };
      } catch {
        info[stream] = { length: 0 };
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
