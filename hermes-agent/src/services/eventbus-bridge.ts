/**
 * Event Bus Bridge — Redis Streams integration for Hermes Agent.
 * Publishes events to the Whatomate event bus and subscribes to relevant streams.
 */

import Redis from 'ioredis'

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379'

export class EventBusBridge {
  private publisher: Redis | null = null
  private consumer: Redis | null = null
  private connected: boolean = false
  private handlers: Map<string, (event: any) => Promise<void>> = new Map()
  private running: boolean = false

  async connect(): Promise<void> {
    try {
      this.publisher = new Redis(REDIS_URL, {
        maxRetriesPerRequest: 3,
        retryStrategy: (times) => Math.min(times * 200, 5000),
        lazyConnect: true,
      })

      await this.publisher.connect()
      this.connected = true
      console.log('[hermes:eventbus] Connected to Redis')

      // Start consumer for hermes-agent group
      this.startConsumer()
    } catch (err: any) {
      console.warn(`[hermes:eventbus] Redis not available: ${err.message}`)
      this.connected = false
    }
  }

  async publish(stream: string, event: Record<string, any>): Promise<void> {
    if (!this.connected || !this.publisher) return

    try {
      // Flatten event into key-value pairs for Redis XADD
      // ioredis xadd requires: xadd(stream, id, key1, val1, key2, val2, ...)
      const flatFields: (string | Buffer)[] = []
      const serializedEvent: Record<string, string> = {}

      for (const [key, value] of Object.entries(event)) {
        if (value !== undefined && value !== null) {
          const strValue = typeof value === 'string' ? value : JSON.stringify(value)
          // Truncate very long values to avoid Redis buffer issues
          serializedEvent[key] = strValue.substring(0, 8000)
        }
      }

      // Always include core fields
      if (!serializedEvent.id) serializedEvent.id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
      if (!serializedEvent.type) serializedEvent.type = 'unknown'
      if (!serializedEvent.source) serializedEvent.source = 'hermes-agent'
      if (!serializedEvent.timestamp) serializedEvent.timestamp = String(Date.now())
      if (!serializedEvent.data) serializedEvent.data = JSON.stringify(event).substring(0, 8000)

      // Build flat array for ioredis
      for (const [key, value] of Object.entries(serializedEvent)) {
        flatFields.push(key, value)
      }

      await this.publisher.xadd(stream, '*', ...flatFields)
    } catch (err: any) {
      console.warn(`[hermes:eventbus] Publish failed: ${err.message}`)
    }
  }

  on(eventType: string, handler: (event: any) => Promise<void>): void {
    this.handlers.set(eventType, handler)
  }

  private async startConsumer(): Promise<void> {
    if (!this.connected || !this.publisher) return

    const streams = [
      'whatomate:alerts',
      'whatomate:intel_events',
      'whatomate:threat_assessments',
      'whatomate:analyzed_messages',
      'whatomate:decisions',
      'whatomate:patterns',
      'whatomate:cognitive_updates',
      'whatomate:whatsapp_messages',
    ]

    // Create consumer group
    for (const stream of streams) {
      try {
        await this.publisher.xgroup('CREATE', stream, 'hermes-workers', '0', 'MKSTREAM')
      } catch { /* group exists */ }
    }

    this.consumer = new Redis(REDIS_URL, {
      maxRetriesPerRequest: null,
      retryStrategy: (times) => Math.min(times * 200, 5000),
      lazyConnect: true,
    })

    await this.consumer.connect()
    this.running = true

    // Consumer loop
    const streamKeys = streams.map(s => ({ key: s, id: '>' }))

    const consume = async () => {
      while (this.running) {
        try {
          const results = await this.consumer!.xreadgroup(
            'GROUP', 'hermes-workers', `hermes-${process.pid}`,
            'COUNT', '10',
            'BLOCK', '5000',
            'STREAMS',
            ...streamKeys.map(s => s.key),
            ...streamKeys.map(s => s.id),
          )

          if (!results) continue

          for (const [stream, messages] of results) {
            for (const [entryId, fields] of messages) {
              try {
                const fieldMap = Object.fromEntries(fields)
                const data = fieldMap.data ? JSON.parse(fieldMap.data) : fieldMap
                const handler = this.handlers.get(data.type) || this.handlers.get('*')
                if (handler) await handler(data)
                await this.publisher!.xack(stream, 'hermes-workers', entryId)
              } catch (err: any) {
                console.warn(`[hermes:eventbus] Error processing event: ${err.message}`)
              }
            }
          }
        } catch (err: any) {
          if (!this.running) break
          await new Promise(r => setTimeout(r, 1000))
        }
      }
    }

    consume() // Fire and forget
    console.log('[hermes:eventbus] Consumer started')
  }

  async getStatus(): Promise<{ connected: boolean; streams?: any }> {
    if (!this.connected || !this.publisher) {
      return { connected: false }
    }

    try {
      const streams: Record<string, any> = {}
      const streamNames = [
        'whatomate:whatsapp_messages',
        'whatomate:analyzed_messages',
        'whatomate:intel_events',
        'whatomate:alerts',
        'whatomate:decisions',
        'whatomate:patterns',
      ]

      for (const name of streamNames) {
        try {
          const len = await this.publisher.xlen(name)
          streams[name] = { length: len }
        } catch {
          streams[name] = { length: 0 }
        }
      }

      return { connected: true, streams }
    } catch {
      return { connected: false }
    }
  }

  async disconnect(): Promise<void> {
    this.running = false
    if (this.consumer) {
      this.consumer.disconnect()
      this.consumer = null
    }
    if (this.publisher) {
      this.publisher.disconnect()
      this.publisher = null
    }
    this.connected = false
  }
}
