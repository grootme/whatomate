/**
 * Tools Registry — Reactive tools that auto-execute on stream events.
 * Tools listen to Redis Streams and react to specific event types.
 */

import { EventBusBridge } from '../services/eventbus-bridge.js'

export interface Tool {
  id: string
  name: string
  description: string
  eventType: string // The event type this tool reacts to
  execute: (event: any) => Promise<any>
}

export class ToolsRegistry {
  private tools: Map<string, Tool> = new Map()
  private eventBus: EventBusBridge | null = null

  constructor() {
    this.registerBuiltins()
  }

  private registerBuiltins(): void {
    // ─── Alert Dispatcher Tool ──────────────────────────────────────────────
    this.register({
      id: 'alert-dispatcher',
      name: 'Alert Dispatcher',
      description: 'Envía alertas críticas por Telegram',
      eventType: 'system.alert',
      execute: async (event) => {
        const chatId = process.env.TELEGRAM_CHAT_ID
        if (!chatId) return { sent: false, reason: 'No chat ID' }

        try {
          const resp = await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chat_id: chatId,
              text: `⚠️ ALERTA [${event.severity?.toUpperCase() || 'UNKNOWN'}]\n\n${event.title || 'Alert'}\n${event.message || ''}`,
              parse_mode: 'Markdown',
            }),
            signal: AbortSignal.timeout(5000),
          })
          return { sent: true }
        } catch (err: any) {
          return { sent: false, error: err.message }
        }
      },
    })

    // ─── Threat Notifier Tool ───────────────────────────────────────────────
    this.register({
      id: 'threat-notifier',
      name: 'Threat Notifier',
      description: 'Notifica cambios en el nivel de amenaza',
      eventType: 'shadowbroker.threat',
      execute: async (event) => {
        const chatId = process.env.TELEGRAM_CHAT_ID
        if (!chatId) return { sent: false }

        try {
          const resp = await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chat_id: chatId,
              text: `🛡 Nivel de Amenaza: ${event.threatLevel?.toUpperCase() || 'UNKNOWN'}\n\n${event.description || ''}\n\nConfianza: ${event.confidence || 'N/A'}`,
              parse_mode: 'Markdown',
            }),
            signal: AbortSignal.timeout(5000),
          })
          return { sent: true }
        } catch (err: any) {
          return { sent: false, error: err.message }
        }
      },
    })

    // ─── Intel Event Processor Tool ─────────────────────────────────────────
    this.register({
      id: 'intel-processor',
      name: 'Intel Event Processor',
      description: 'Procesa eventos de inteligencia y los almacena en Cognitive API',
      eventType: 'shadowbroker.intel',
      execute: async (event) => {
        try {
          const cognitiveUrl = process.env.COGNITIVE_URL || 'http://localhost:8645'
          await fetch(`${cognitiveUrl}/entities`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              name: `SB-${event.eventType}-${Date.now()}`,
              type: 'osint_event',
              attributes: event,
            }),
            signal: AbortSignal.timeout(5000),
          })
          return { stored: true }
        } catch (err: any) {
          return { stored: false, error: err.message }
        }
      },
    })

    // ─── WhatsApp Message Processor Tool ────────────────────────────────────
    this.register({
      id: 'whatsapp-processor',
      name: 'WhatsApp Message Processor',
      description: 'Procesa mensajes de WhatsApp y los analiza',
      eventType: 'whatsapp.message',
      execute: async (event) => {
        // For now, just log and publish analyzed event
        console.log(`[hermes:tool] WhatsApp message from ${event.senderName}: ${event.body?.substring(0, 50)}`)

        // Could trigger AI analysis here
        return { processed: true }
      },
    })

    // ─── Cognitive Pattern Detector Tool ────────────────────────────────────
    this.register({
      id: 'pattern-detector',
      name: 'Pattern Detector',
      description: 'Detecta patrones en eventos y genera alertas',
      eventType: 'cognitive.pattern',
      execute: async (event) => {
        if (event.confidence > 0.8 && event.occurrences > 3) {
          // High-confidence recurring pattern — alert
          const chatId = process.env.TELEGRAM_CHAT_ID
          if (chatId) {
            try {
              await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  chat_id: chatId,
                  text: `🔄 Patrón Detectado: ${event.patternName}\n\n${event.description}\n\nOcurrencias: ${event.occurrences} | Confianza: ${(event.confidence * 100).toFixed(0)}%`,
                  parse_mode: 'Markdown',
                }),
                signal: AbortSignal.timeout(5000),
              })
            } catch { /* ignore */ }
          }
        }
        return { processed: true }
      },
    })
  }

  register(tool: Tool): void {
    this.tools.set(tool.id, tool)
  }

  setEventBus(eventBus: EventBusBridge): void {
    this.eventBus = eventBus

    // Register all tools as event handlers
    for (const tool of this.tools.values()) {
      this.eventBus.on(tool.eventType, async (event) => {
        try {
          await tool.execute(event)
        } catch (err: any) {
          console.error(`[hermes:tool] Tool ${tool.id} error: ${err.message}`)
        }
      })
    }
  }

  async executeByName(name: string, args: any): Promise<any> {
    // Find tool by name or id
    const tool = Array.from(this.tools.values()).find(
      t => t.id === name || t.name.toLowerCase() === name.toLowerCase()
    )
    if (!tool) throw new Error(`Tool not found: ${name}`)
    return await tool.execute(args)
  }

  list(): Array<{ id: string; name: string; description: string; eventType: string }> {
    return Array.from(this.tools.values()).map(t => ({
      id: t.id,
      name: t.name,
      description: t.description,
      eventType: t.eventType,
    }))
  }
}
