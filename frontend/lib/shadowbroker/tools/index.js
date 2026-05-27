/**
 * Shadowbroker Tools System
 *
 * Tools son funciones programáticas que se integran con el EventBus
 * para ejecutar operaciones específicas de Shadowbroker de forma
 * reactiva ante eventos en Redis Streams.
 *
 * A diferencia de Skills (declarativas, invocadas manualmente o por API),
 * Tools son automáticas y reactivas — se activan por eventos en streams.
 */

import { EventBus, Streams, ConsumerGroups, generateEventId, type StreamName } from '../redis-streams.js'

// ─── Tool Definition ──────────────────────────────────────────────────────────

export interface ToolDefinition {
  name: string
  description: string
  subscribeStreams: StreamName[]
  eventTypes: string[]  // event.type patterns to match
  execute: (event: any, stream: string, eventBus: EventBus) => Promise<ToolResult>
}

export interface ToolResult {
  success: boolean
  actionsTaken: string[]
  eventsPublished: number
  error?: string
}

// ─── Tool Registry ────────────────────────────────────────────────────────────

class ToolRegistry {
  private tools: Map<string, ToolDefinition> = new Map()
  private activeBuses: Map<string, EventBus> = new Map()

  register(tool: ToolDefinition): void {
    this.tools.set(tool.name, tool)
    console.log(`[tools] Registered: ${tool.name} (subscribes to: ${tool.subscribeStreams.join(', ')})`)
  }

  async startAll(eventBus: EventBus): Promise<void> {
    for (const [name, tool] of this.tools) {
      await this.startTool(name, eventBus)
    }
  }

  async startTool(name: string, parentBus: EventBus): Promise<void> {
    const tool = this.tools.get(name)
    if (!tool) return

    // Create a dedicated event bus for this tool
    const toolBus = new EventBus(
      ConsumerGroups.SHADOWBROKER_WORKERS,
      `tool-${name}-${process.pid}`,
    )

    await toolBus.connect()

    // Register handlers for each event type
    for (const eventType of tool.eventTypes) {
      toolBus.on(eventType, async (event, stream) => {
        try {
          const result = await tool.execute(event, stream, parentBus)
          if (result.actionsTaken.length > 0) {
            console.log(`[tool:${name}] Actions: ${result.actionsTaken.join(', ')}`)
          }
        } catch (err: any) {
          console.error(`[tool:${name}] Error: ${err.message}`)
        }
      })
    }

    // Also register wildcard for catch-all tools
    if (tool.eventTypes.includes('*')) {
      toolBus.on('*', async (event, stream) => {
        try {
          const result = await tool.execute(event, stream, parentBus)
          if (result.actionsTaken.length > 0) {
            console.log(`[tool:${name}] Actions: ${result.actionsTaken.join(', ')}`)
          }
        } catch (err: any) {
          console.error(`[tool:${name}] Error: ${err.message}`)
        }
      })
    }

    // Start consuming in background
    toolBus.startConsuming(tool.subscribeStreams, { count: 5, block: 3000 }).catch(err => {
      console.error(`[tool:${name}] Consumer error: ${err.message}`)
    })

    this.activeBuses.set(name, toolBus)
    console.log(`[tools] Started: ${name}`)
  }

  async stopAll(): Promise<void> {
    for (const [name, bus] of this.activeBuses) {
      await bus.stop()
      console.log(`[tools] Stopped: ${name}`)
    }
    this.activeBuses.clear()
  }

  listTools(): { name: string; description: string; streams: string[]; eventTypes: string[] }[] {
    return [...this.tools.values()].map(t => ({
      name: t.name,
      description: t.description,
      streams: t.subscribeStreams,
      eventTypes: t.eventTypes,
    }))
  }
}

export const toolRegistry = new ToolRegistry()

// ─── Alert Dispatcher Tool ────────────────────────────────────────────────────

toolRegistry.register({
  name: 'alert_dispatcher',
  description: 'Despacha alertas a WhatsApp y al Bundle cuando se detectan eventos críticos en los streams de Shadowbroker o Bundle.',
  subscribeStreams: [Streams.THREAT_ASSESSMENTS, Streams.ALERTS, Streams.DECISIONS],
  eventTypes: ['shadowbroker.threat', 'system.alert', 'bundle.decision'],
  async execute(event, stream, eventBus) {
    const actions: string[] = []
    let eventsPublished = 0

    // Determine severity
    const severity = event.severity || event.threatLevel || 'medium'

    if (severity === 'critical' || severity === 'high') {
      // Send WhatsApp alert
      const hermesUrl = process.env.HERMES_URL || 'http://localhost:3001'
      try {
        const message = event.title || event.description || 'Alerta del sistema'
        await fetch(`${hermesUrl}/send`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: `\u26a0\ufe0f *ALERTA* [${severity.toUpperCase()}]\n\n${message}\n\n_${new Date().toISOString()}_`,
            priority: severity,
          }),
          signal: AbortSignal.timeout(5000),
        })
        actions.push('whatsapp_alert_sent')
      } catch (err: any) {
        actions.push(`whatsapp_alert_failed: ${err.message}`)
      }

      // Forward to Bundle
      const bundleUrl = process.env.BUNDLE_URL || 'http://localhost:8650'
      try {
        await fetch(`${bundleUrl}/events`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            event_type: `alert_${severity}`,
            source: 'shadowbroker-tool',
            severity,
            title: event.title || 'Alert',
            description: event.description || '',
            data: JSON.stringify(event).substring(0, 1000),
          }),
          signal: AbortSignal.timeout(3000),
        })
        actions.push('bundle_notified')
      } catch {}
    }

    // Store in Cognitive API
    const cognitiveUrl = process.env.COGNITIVE_URL || 'http://localhost:8645'
    try {
      await fetch(`${cognitiveUrl}/decisions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: `Alert: ${event.title || 'System alert'}`,
          description: event.description || event.message || '',
          context: `Source: ${event.source} | Severity: ${severity} | Stream: ${stream}`,
          decision_maker: 'alert-dispatcher-tool',
          status: severity === 'critical' ? 'pending' : 'noted',
          confidence: event.confidence || 0.7,
        }),
        signal: AbortSignal.timeout(3000),
      })
      actions.push('cognitive_stored')
    } catch {}

    return { success: true, actionsTaken: actions, eventsPublished }
  },
})

// ─── Cognitive Sync Tool ──────────────────────────────────────────────────────

toolRegistry.register({
  name: 'cognitive_sync',
  description: 'Sincroniza eventos de inteligencia y patrones detectados al Cognitive API para construcción de conocimiento.',
  subscribeStreams: [Streams.INTEL_EVENTS, Streams.PATTERNS, Streams.ANALYZED_MESSAGES],
  eventTypes: ['shadowbroker.intel', 'cognitive.pattern', 'whatsapp.analyzed'],
  async execute(event, stream, eventBus) {
    const actions: string[] = []
    const cognitiveUrl = process.env.COGNITIVE_URL || 'http://localhost:8645'

    if (event.type === 'shadowbroker.intel' || event.eventType === 'shadowbroker.intel') {
      // Store OSINT event as entity
      try {
        await fetch(`${cognitiveUrl}/entities`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: event.title || 'OSINT Event',
            type: event.eventType || 'osint_event',
            attributes: {
              source: 'shadowbroker',
              severity: event.severity,
              lat: event.lat,
              lng: event.lng,
              data: event.dataJson?.substring(0, 500),
            },
          }),
          signal: AbortSignal.timeout(3000),
        })
        actions.push('osint_entity_stored')
      } catch {}
    }

    if (event.type === 'whatsapp.analyzed') {
      // Store analyzed message entities
      if (event.entities && event.entities.length > 0) {
        for (const entity of event.entities) {
          try {
            await fetch(`${cognitiveUrl}/entities`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                name: entity.name,
                type: entity.type,
                attributes: {
                  context: entity.context,
                  source: 'whatsapp_auto',
                  chat_id: event.chatId,
                },
              }),
              signal: AbortSignal.timeout(2000),
            })
          } catch {}
        }
        actions.push(`entities_synced:${event.entities.length}`)
      }
    }

    if (event.type === 'cognitive.pattern') {
      // Store detected pattern
      try {
        await fetch(`${cognitiveUrl}/patterns`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: event.patternName,
            pattern_type: event.patternType,
            description: event.description,
            confidence: event.confidence,
            data: { occurrences: event.occurrences },
          }),
          signal: AbortSignal.timeout(3000),
        })
        actions.push('pattern_stored')
      } catch {}
    }

    // Publish cognitive update event
    if (actions.length > 0) {
      await eventBus.publish(Streams.COGNITIVE_UPDATES, {
        id: generateEventId(),
        type: 'cognitive.update',
        source: 'cognitive-sync-tool',
        timestamp: Date.now(),
        entityType: event.type?.includes('intel') ? 'entity' : 'pattern',
        action: 'created',
        entityId: event.id || generateEventId(),
        data: JSON.stringify({ actions, originalEvent: event.type }),
      })
    }

    return { success: true, actionsTaken: actions, eventsPublished: actions.length > 0 ? 1 : 0 }
  },
})

// ─── Threat Monitor Tool ──────────────────────────────────────────────────────

toolRegistry.register({
  name: 'threat_monitor',
  description: 'Monitorea cambios en el nivel de amenaza y genera alertas automáticas cuando hay escalación.',
  subscribeStreams: [Streams.THREAT_ASSESSMENTS],
  eventTypes: ['shadowbroker.threat'],
  async execute(event, stream, eventBus) {
    const actions: string[] = []

    const currentLevel = event.threatLevel
    if (!currentLevel) return { success: true, actionsTaken: [], eventsPublished: 0 }

    // Get previous threat level from Cognitive API
    const cognitiveUrl = process.env.COGNITIVE_URL || 'http://localhost:8645'
    let previousLevel: string | null = null
    try {
      const resp = await fetch(
        `${cognitiveUrl}/entities?type=threat_assessment&limit=1`,
        { signal: AbortSignal.timeout(3000) },
      )
      const data = await resp.json()
      if (data.entities && data.entities.length > 0) {
        previousLevel = data.entities[0].attributes?.threat_level || null
      }
    } catch {}

    // Check for escalation
    const levelOrder = ['low', 'medium', 'high', 'critical']
    const currentIdx = levelOrder.indexOf(currentLevel)
    const previousIdx = previousLevel ? levelOrder.indexOf(previousLevel) : -1

    if (currentIdx > previousIdx && previousIdx >= 0) {
      // Threat escalated!
      await eventBus.publish(Streams.ALERTS, {
        id: generateEventId(),
        type: 'system.alert',
        source: 'threat-monitor-tool',
        timestamp: Date.now(),
        severity: currentLevel,
        title: `ESCALACIÓN DE AMENAZA: ${previousLevel} → ${currentLevel}`,
        message: `El nivel de amenaza ha escalado de ${previousLevel} a ${currentLevel}. ${event.description || ''}`,
        sendWhatsApp: currentIdx >= 2, // high or critical
        sendBundle: true,
      })
      actions.push(`threat_escalated:${previousLevel}->${currentLevel}`)
    }

    // Store current level
    try {
      await fetch(`${cognitiveUrl}/entities`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: `ThreatLevel-${new Date().toISOString().split('T')[0]}`,
          type: 'threat_assessment',
          attributes: {
            threat_level: currentLevel,
            confidence: event.confidence,
            category: event.category,
          },
        }),
        signal: AbortSignal.timeout(3000),
      })
      actions.push('level_stored')
    } catch {}

    return { success: true, actionsTaken: actions, eventsPublished: actions.includes('threat_escalated') ? 1 : 0 }
  },
})

// ─── Cross-Source Correlator Tool ─────────────────────────────────────────────

toolRegistry.register({
  name: 'cross_source_correlator',
  description: 'Correlaciona eventos de WhatsApp con eventos OSINT de Shadowbroker para detectar conexiones entre comunicaciones y actividad externa.',
  subscribeStreams: [Streams.ANALYZED_MESSAGES, Streams.INTEL_EVENTS],
  eventTypes: ['whatsapp.analyzed', 'shadowbroker.intel'],
  async execute(event, stream, eventBus) {
    const actions: string[] = []

    // Only correlate high-urgency or negative sentiment WhatsApp messages
    if (event.type === 'whatsapp.analyzed') {
      if (event.urgency < 0.5 && event.sentimentLabel !== 'negative') {
        return { success: true, actionsTaken: [], eventsPublished: 0 }
      }

      // Check if there are recent OSINT events that might be related
      // This is a simplified correlation — in production, would use NLP embeddings
      const keywords = event.keywords || []
      if (keywords.length === 0) return { success: true, actionsTaken: [], eventsPublished: 0 }

      // Search Cognitive API for matching OSINT entities
      const cognitiveUrl = process.env.COGNITIVE_URL || 'http://localhost:8645'
      for (const keyword of keywords.slice(0, 3)) {
        try {
          const resp = await fetch(
            `${cognitiveUrl}/search?q=${encodeURIComponent(keyword)}&type=entity&limit=5`,
            { signal: AbortSignal.timeout(3000) },
          )
          const data = await resp.json()

          if (data.results && data.results.length > 0) {
            // Found a correlation! Publish it
            await eventBus.publish(Streams.PATTERNS, {
              id: generateEventId(),
              type: 'cognitive.pattern',
              source: 'cross-source-correlator-tool',
              timestamp: Date.now(),
              patternName: `whatsapp_osint_correlation:${keyword}`,
              patternType: 'cross_source',
              description: `WhatsApp message from ${event.senderName} mentions "${keyword}" which correlates with ${data.results.length} OSINT entities`,
              confidence: 0.4 + (event.urgency * 0.3),
              occurrences: 1,
            })
            actions.push(`correlation_found:${keyword}`)
          }
        } catch {}
      }
    }

    // For OSINT events, check if any WhatsApp messages mention related topics
    if (event.type === 'shadowbroker.intel' && event.severity === 'high') {
      const title = event.title || ''
      if (title.length < 3) return { success: true, actionsTaken: [], eventsPublished: 0 }

      // Search Cognitive API for matching WhatsApp messages
      const cognitiveUrl = process.env.COGNITIVE_URL || 'http://localhost:8645'
      try {
        const words = title.split(/\s+/).filter(w => w.length > 4).slice(0, 3)
        for (const word of words) {
          const resp = await fetch(
            `${cognitiveUrl}/search?q=${encodeURIComponent(word)}&type=message&limit=5`,
            { signal: AbortSignal.timeout(3000) },
          )
          const data = await resp.json()

          if (data.results && data.results.length > 0) {
            actions.push(`osint_whatsapp_match:${word}`)
          }
        }
      } catch {}
    }

    return { success: true, actionsTaken: actions, eventsPublished: actions.filter(a => a.includes('correlation')).length }
  },
})

// ─── Event Archiver Tool ──────────────────────────────────────────────────────

toolRegistry.register({
  name: 'event_archiver',
  description: 'Archiva eventos importantes en el Cognitive API para construcción de base de conocimiento persistente.',
  subscribeStreams: [Streams.WHATSAPP_MESSAGES, Streams.ANALYZED_MESSAGES, Streams.DECISIONS, Streams.INTEL_EVENTS, Streams.THREAT_ASSESSMENTS, Streams.ALERTS, Streams.PATTERNS],
  eventTypes: ['*'],
  async execute(event, stream, eventBus) {
    const actions: string[] = []
    const cognitiveUrl = process.env.COGNITIVE_URL || 'http://localhost:8645'

    // Only archive high-priority events to avoid flooding
    const severity = event.severity || event.threatLevel || 'info'
    const shouldArchive =
      severity === 'critical' ||
      severity === 'high' ||
      event.type === 'bundle.decision' ||
      event.type === 'shadowbroker.threat' ||
      stream === Streams.DECISIONS

    if (!shouldArchive) return { success: true, actionsTaken: [], eventsPublished: 0 }

    // Store as message in Cognitive API
    try {
      await fetch(`${cognitiveUrl}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jid: event.chatId || stream,
          sender: event.source || 'event-bus',
          content: event.title || event.description || JSON.stringify(event).substring(0, 200),
          chat_type: 'system_event',
          direction: 'inbound',
          metadata: {
            event_type: event.type,
            stream,
            severity,
            confidence: event.confidence,
            archived_at: new Date().toISOString(),
          },
        }),
        signal: AbortSignal.timeout(3000),
      })
      actions.push('archived')
    } catch {}

    return { success: true, actionsTaken: actions, eventsPublished: 0 }
  },
})

export default toolRegistry
