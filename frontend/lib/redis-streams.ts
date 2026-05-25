/**
 * Whatomate Redis Streams Event Bus
 *
 * Event Sourcing con Redis Streams para comunicación en tiempo real
 * entre todos los micro-servicios del ecosistema Whatomate.
 *
 * Arquitectura:
 *   ┌──────────────┐   XADD    ┌──────────────────┐   XREADGROUP   ┌──────────────┐
 *   │  Producer    │ ────────► │  Redis Stream     │ ──────────────►│  Consumer    │
 *   │  (cualquier  │           │  (event store)    │                │  (cualquier  │
 *   │   servicio)  │           │                   │                │   servicio)  │
 *   └──────────────┘           └──────────────────┘                └──────────────┘
 *
 * Streams:
 *   whatomate:whatsapp_messages    — Mensajes raw de WhatsApp (producer: Bridge)
 *   whatomate:analyzed_messages    — Mensajes con análisis NLP (producer: Bundle)
 *   whatomate:decisions            — Decisiones automáticas (producer: Bundle)
 *   whatomate:intel_events         — Eventos OSINT de Shadowbroker (producer: SB Bridge)
 *   whatomate:threat_assessments   — Evaluaciones de amenazas AI (producer: SB Bridge)
 *   whatomate:alerts               — Alertas cross-sistema (producer: cualquiera)
 *   whatomate:patterns             — Patrones detectados (producer: Bundle/Cognitive)
 *   whatomate:cognitive_updates    — Actualizaciones de conocimiento (producer: Cognitive)
 *
 * Consumer Groups:
 *   bundle-workers      — Pipeline de monitoreo
 *   cognitive-workers   — Ingesta a base de conocimiento
 *   shadowbroker-workers— Integración OSINT
 *   alert-workers       — Despacho de alertas WhatsApp
 *   frontend-workers    — Actualizaciones UI en tiempo real
 */

import Redis from 'ioredis'

// ─── Configuration ────────────────────────────────────────────────────────────

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379'
const REDIS_DB = parseInt(process.env.REDIS_DB || '0')

// Stream names
export const Streams = {
  WHATSAPP_MESSAGES: 'whatomate:whatsapp_messages',
  ANALYZED_MESSAGES: 'whatomate:analyzed_messages',
  DECISIONS: 'whatomate:decisions',
  INTEL_EVENTS: 'whatomate:intel_events',
  THREAT_ASSESSMENTS: 'whatomate:threat_assessments',
  ALERTS: 'whatomate:alerts',
  PATTERNS: 'whatomate:patterns',
  COGNITIVE_UPDATES: 'whatomate:cognitive_updates',
} as const

export type StreamName = typeof Streams[keyof typeof Streams]

// Consumer group names
export const ConsumerGroups = {
  BUNDLE_WORKERS: 'bundle-workers',
  COGNITIVE_WORKERS: 'cognitive-workers',
  SHADOWBROKER_WORKERS: 'shadowbroker-workers',
  ALERT_WORKERS: 'alert-workers',
  FRONTEND_WORKERS: 'frontend-workers',
} as const

// ─── Event Types ──────────────────────────────────────────────────────────────

export interface BaseEvent {
  id: string
  type: string
  source: string
  timestamp: number
  correlationId?: string
  causationId?: string
}

export interface WhatsAppMessageEvent extends BaseEvent {
  type: 'whatsapp.message'
  source: 'whatsapp-bridge'
  messageId: string
  chatId: string
  senderId: string
  senderName: string
  body: string
  isGroup: boolean
  hasMedia: boolean
  timestamp: number
}

export interface AnalyzedMessageEvent extends BaseEvent {
  type: 'whatsapp.analyzed'
  source: 'realtime-bundle'
  messageId: string
  chatId: string
  senderId: string
  senderName: string
  body: string
  isGroup: boolean
  sentimentScore: number
  sentimentLabel: 'positive' | 'negative' | 'neutral'
  urgency: number
  entities: { name: string; type: string; context: string }[]
  keywords: string[]
  hasActionItems: boolean
  hasDecisionKeywords: boolean
}

export interface DecisionEvent extends BaseEvent {
  type: 'bundle.decision'
  source: 'realtime-bundle'
  title: string
  description: string
  context: string
  triggerPattern: string
  triggerEntity: string
  priority: 'low' | 'medium' | 'high' | 'critical'
  confidence: number
}

export interface IntelEvent extends BaseEvent {
  type: 'shadowbroker.intel'
  source: 'shadowbroker-ai-bridge'
  eventType: string
  severity: 'low' | 'medium' | 'high' | 'critical'
  title: string
  description: string
  lat: number | null
  lng: number | null
  dataJson: string
}

export interface ThreatAssessmentEvent extends BaseEvent {
  type: 'shadowbroker.threat'
  source: 'shadowbroker-ai-bridge'
  threatLevel: 'low' | 'medium' | 'high' | 'critical'
  category: string
  description: string
  confidence: number
  recommendations: string[]
}

export interface AlertEvent extends BaseEvent {
  type: 'system.alert'
  source: string
  severity: 'low' | 'medium' | 'high' | 'critical'
  title: string
  message: string
  sendWhatsApp: boolean
  sendBundle: boolean
}

export interface PatternEvent extends BaseEvent {
  type: 'cognitive.pattern'
  source: string
  patternName: string
  patternType: string
  description: string
  confidence: number
  occurrences: number
}

export interface CognitiveUpdateEvent extends BaseEvent {
  type: 'cognitive.update'
  source: 'cognitive-api'
  entityType: 'message' | 'entity' | 'decision' | 'pattern' | 'summary'
  action: 'created' | 'updated' | 'deleted'
  entityId: number | string
  data: string
}

export type WhatomateEvent =
  | WhatsAppMessageEvent
  | AnalyzedMessageEvent
  | DecisionEvent
  | IntelEvent
  | ThreatAssessmentEvent
  | AlertEvent
  | PatternEvent
  | CognitiveUpdateEvent

// ─── Redis Streams Client ─────────────────────────────────────────────────────

export class EventBus {
  private publisher: Redis
  private consumer: Redis | null = null
  private consumerName: string
  private groupName: string
  private running: boolean = false
  private handlers: Map<string, (event: any, stream: string) => Promise<void>> = new Map()

  constructor(groupName: string, consumerName?: string) {
    this.groupName = groupName
    this.consumerName = consumerName || `${groupName}-${process.pid}-${Date.now().toString(36)}`

    this.publisher = new Redis(REDIS_URL, {
      db: REDIS_DB,
      maxRetriesPerRequest: 3,
      retryStrategy: (times) => Math.min(times * 200, 5000),
      lazyConnect: true,
    })
  }

  async connect(): Promise<void> {
    await this.publisher.connect()
    console.log(`[event-bus] Connected to Redis at ${REDIS_URL}`)

    // Ensure all streams have consumer groups created
    await this.ensureConsumerGroups()
  }

  private async ensureConsumerGroups(): Promise<void> {
    for (const stream of Object.values(Streams)) {
      try {
        await this.publisher.xgroup('CREATE', stream, this.groupName, '0', 'MKSTREAM')
        console.log(`[event-bus] Created consumer group ${this.groupName} on ${stream}`)
      } catch (err: any) {
        if (err.message?.includes('BUSYGROUP')) {
          // Group already exists — that's fine
        } else {
          console.warn(`[event-bus] Could not create group ${this.groupName} on ${stream}: ${err.message}`)
        }
      }
    }
  }

  // ─── Producer ───────────────────────────────────────────────────────────────

  async publish(stream: StreamName, event: Record<string, any>): Promise<string> {
    // Flatten the event for Redis Streams (only string values allowed)
    const fields: Record<string, string> = {
      id: event.id || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      type: event.type || 'unknown',
      source: event.source || 'unknown',
      timestamp: String(event.timestamp || Date.now()),
      data: JSON.stringify(event),
    }

    if (event.correlationId) fields.correlationId = event.correlationId
    if (event.causationId) fields.causationId = event.causationId

    try {
      const entryId = await this.publisher.xadd(stream, '*', fields)
      return entryId || ''
    } catch (err: any) {
      console.error(`[event-bus] Failed to publish to ${stream}: ${err.message}`)
      throw err
    }
  }

  // Batch publish for high-throughput scenarios
  async publishBatch(stream: StreamName, events: Record<string, any>[]): Promise<string[]> {
    const pipeline = this.publisher.pipeline()
    const ids: string[] = []

    for (const event of events) {
      const fields: Record<string, string> = {
        id: event.id || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        type: event.type || 'unknown',
        source: event.source || 'unknown',
        timestamp: String(event.timestamp || Date.now()),
        data: JSON.stringify(event),
      }

      if (event.correlationId) fields.correlationId = event.correlationId
      if (event.causationId) fields.causationId = event.causationId

      pipeline.xadd(stream, '*', fields)
    }

    const results = await pipeline.exec()
    if (results) {
      for (const [err, id] of results) {
        if (err) {
          ids.push('')
        } else {
          ids.push(id as string || '')
        }
      }
    }

    return ids
  }

  // ─── Consumer ───────────────────────────────────────────────────────────────

  on(eventType: string, handler: (event: any, stream: string) => Promise<void>): void {
    this.handlers.set(eventType, handler)
  }

  async startConsuming(streams: StreamName[], options: {
    count?: number
    block?: number
    onUnprocessed?: boolean
  } = {}): Promise<void> {
    const { count = 10, block = 5000, onUnprocessed = true } = options

    this.consumer = new Redis(REDIS_URL, {
      db: REDIS_DB,
      maxRetriesPerRequest: null, // Required for blocking XREADGROUP
      retryStrategy: (times) => Math.min(times * 200, 5000),
      lazyConnect: true,
    })

    await this.consumer.connect()
    this.running = true

    console.log(`[event-bus] Consumer ${this.consumerName} started on group ${this.groupName}`)

    // Claim stale messages first (idle > 5 minutes)
    if (onUnprocessed) {
      await this.claimStaleMessages(streams)
    }

    // Main consume loop
    const streamKeys = streams.map(s => ({ key: s, id: '>' }))

    while (this.running) {
      try {
        const results = await this.consumer.xreadgroup(
          'GROUP', this.groupName, this.consumerName,
          'COUNT', String(count),
          'BLOCK', String(block),
          'STREAMS',
          ...streamKeys.map(s => s.key),
          ...streamKeys.map(s => s.id),
        )

        if (!results) continue

        for (const [stream, messages] of results) {
          for (const [entryId, fields] of messages) {
            try {
              await this.processMessage(stream, entryId, fields)
              // ACK after successful processing
              await this.publisher.xack(stream, this.groupName, entryId)
            } catch (err: any) {
              console.error(`[event-bus] Error processing ${entryId} from ${stream}: ${err.message}`)
              // Don't ACK — message will be reclaimed later
            }
          }
        }
      } catch (err: any) {
        if (!this.running) break
        console.error(`[event-bus] Consumer error: ${err.message}`)
        await new Promise(r => setTimeout(r, 1000))
      }
    }

    console.log(`[event-bus] Consumer ${this.consumerName} stopped`)
  }

  private async processMessage(stream: string, entryId: string, fields: [string, string][]): Promise<void> {
    const fieldMap = Object.fromEntries(fields)
    const eventType = fieldMap.type
    const data = fieldMap.data ? JSON.parse(fieldMap.data) : fieldMap

    // Add metadata
    data._meta = {
      stream,
      entryId,
      consumerGroup: this.groupName,
      consumerName: this.consumerName,
      processedAt: Date.now(),
    }

    // Find handler
    const handler = this.handlers.get(eventType)
    if (handler) {
      await handler(data, stream)
    } else {
      // Try wildcard handler
      const wildcardHandler = this.handlers.get('*')
      if (wildcardHandler) {
        await wildcardHandler(data, stream)
      }
    }
  }

  private async claimStaleMessages(streams: StreamName[]): Promise<void> {
    const IDLE_THRESHOLD_MS = 5 * 60 * 1000 // 5 minutes

    for (const stream of streams) {
      try {
        const pending = await this.publisher.xpending(stream, this.groupName)
        if (!pending || pending.pending === 0) continue

        // Get pending entries using XPENDING with RANGE
        // ioredis v5+ uses camelCase: xpendingRange
        let pendingEntries: any[] = []
        try {
          pendingEntries = await (this.publisher as any).xpendingRange(
            stream, this.groupName, '-', '+', 100,
          )
        } catch {
          // Fallback: try snake_case for older ioredis
          try {
            pendingEntries = await (this.publisher as any).xpending_range(
              stream, this.groupName, '-', '+', 100,
            )
          } catch {
            // If neither works, skip stale claiming for this stream
            continue
          }
        }

        if (!pendingEntries || pendingEntries.length === 0) continue

        const staleIds: string[] = []
        for (const entry of pendingEntries) {
          // Handle both object and array formats from different ioredis versions
          const idleTime = entry.idleTime ?? entry.idle_time ?? (Array.isArray(entry) ? entry[2] : 0)
          const id = entry.id ?? (Array.isArray(entry) ? entry[0] : null)
          if (idleTime > IDLE_THRESHOLD_MS && id) {
            staleIds.push(String(id))
          }
        }

        if (staleIds.length > 0) {
          const claimed = await this.publisher.xclaim(
            stream, this.groupName, this.consumerName,
            IDLE_THRESHOLD_MS, ...staleIds,
          )

          if (claimed && claimed.length > 0) {
            console.log(`[event-bus] Claimed ${claimed.length} stale messages from ${stream}`)
            for (const [entryId, fields] of claimed) {
              try {
                await this.processMessage(stream, entryId, fields)
                await this.publisher.xack(stream, this.groupName, entryId)
              } catch (err: any) {
                console.error(`[event-bus] Error processing claimed message: ${err.message}`)
              }
            }
          }
        }
      } catch (err: any) {
        if (!err.message?.includes('NOGROUP')) {
          console.warn(`[event-bus] Error claiming stale from ${stream}: ${err.message}`)
        }
      }
    }
  }

  // ─── Event Replay ───────────────────────────────────────────────────────────

  async replay(stream: StreamName, options: {
    from?: string  // entry ID or timestamp
    to?: string
    count?: number
    handler?: (event: any) => Promise<void>
  } = {}): Promise<number> {
    const { from = '-', to = '+', count = 100, handler } = options

    const messages = await this.publisher.xrange(stream, from, to, 'COUNT', count)
    if (!messages) return 0

    let processed = 0
    for (const [entryId, fields] of messages) {
      try {
        if (handler) {
          const data = Object.fromEntries(fields)
          const event = data.data ? JSON.parse(data.data) : data
          event._meta = { stream, entryId, replayed: true }
          await handler(event)
        }
        processed++
      } catch (err: any) {
        console.error(`[event-bus] Replay error for ${entryId}: ${err.message}`)
      }
    }

    return processed
  }

  // ─── Stream Info ────────────────────────────────────────────────────────────

  async getStreamInfo(stream: StreamName): Promise<{
    length: number
    groups: number
    firstEntry: string | null
    lastEntry: string | null
  }> {
    try {
      const info = await this.publisher.xinfo('STREAM', stream) as any
      return {
        length: info.length || 0,
        groups: info.groups || 0,
        firstEntry: info.first_entry?.[0] || null,
        lastEntry: info.last_entry?.[0] || null,
      }
    } catch {
      return { length: 0, groups: 0, firstEntry: null, lastEntry: null }
    }
  }

  async getAllStreamInfo(): Promise<Record<string, any>> {
    const result: Record<string, any> = {}
    for (const [name, stream] of Object.entries(Streams)) {
      result[name] = await this.getStreamInfo(stream)
    }
    return result
  }

  // ─── Lifecycle ──────────────────────────────────────────────────────────────

  async stop(): Promise<void> {
    this.running = false
    if (this.consumer) {
      this.consumer.disconnect()
      this.consumer = null
    }
  }

  async disconnect(): Promise<void> {
    await this.stop()
    this.publisher.disconnect()
  }

  get isRunning(): boolean {
    return this.running
  }
}

// ─── Singleton Factory ────────────────────────────────────────────────────────

const busInstances = new Map<string, EventBus>()

export function createEventBus(groupName: string, consumerName?: string): EventBus {
  const key = `${groupName}:${consumerName || 'default'}`
  if (!busInstances.has(key)) {
    busInstances.set(key, new EventBus(groupName, consumerName))
  }
  return busInstances.get(key)!
}

// ─── Utility Functions ────────────────────────────────────────────────────────

export function generateEventId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

export function createCorrelationContext() {
  const correlationId = generateEventId()
  return {
    correlationId,
    child: (causationId: string) => ({
      correlationId,
      causationId,
    }),
  }
}

// ─── Redis Health Check ───────────────────────────────────────────────────────

export async function checkRedisHealth(): Promise<{
  connected: boolean
  version: string | null
  memory: string | null
  uptime: number | null
  streams: Record<string, any>
}> {
  try {
    const redis = new Redis(REDIS_URL, { db: REDIS_DB, lazyConnect: true })
    await redis.connect()

    const info = await redis.info('server')
    const memoryInfo = await redis.info('memory')

    const versionMatch = info.match(/redis_version:([^\r\n]+)/)
    const uptimeMatch = info.match(/uptime_in_seconds:(\d+)/)
    const memoryMatch = memoryInfo.match(/used_memory_human:([^\r\n]+)/)

    // Get stream stats
    const streams: Record<string, any> = {}
    for (const [name, stream] of Object.entries(Streams)) {
      try {
        const len = await redis.xlen(stream)
        streams[name] = { stream, length: len }
      } catch {
        streams[name] = { stream, length: 0 }
      }
    }

    await redis.disconnect()

    return {
      connected: true,
      version: versionMatch?.[1] || null,
      memory: memoryMatch?.[1] || null,
      uptime: uptimeMatch ? parseInt(uptimeMatch[1]) : null,
      streams,
    }
  } catch (err: any) {
    return {
      connected: false,
      version: null,
      memory: null,
      uptime: null,
      streams: {},
    }
  }
}
