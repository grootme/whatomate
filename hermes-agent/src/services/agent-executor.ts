/**
 * AgentExecutor — Intelligent AI Agent with Tool Calling
 *
 * Replaces the hard-coded CommandRouter with an AI-driven approach:
 *   User Prompt → LLM (OpenRouter with tool definitions) → Tool Calls → Execute → Synthesize Response
 *
 * The AI understands the user's intent, decomposes it into tasks,
 * and uses the available tools (Telethon, Shadowbroker, Cognitive, etc.)
 * to execute them. No more hard-coded command patterns.
 *
 * Architecture:
 *   1. User sends any prompt (in any language)
 *   2. Agent sends prompt + tool definitions to OpenRouter
 *   3. If the model requests a tool_call, execute it
 *   4. Return tool result to the model for further reasoning
 *   5. Loop until the model generates a final text response
 *   6. Return the synthesized response to the user
 */

import { EventBusBridge } from './eventbus-bridge.js'

// ─── Configuration ────────────────────────────────────────────────────────────

const OPENROUTER_KEY = process.env.OPENROUTER_API_KEY || ''
const OPENROUTER_MODEL = process.env.OPENROUTER_MODEL || 'deepseek/deepseek-chat-v3-0324'
const TELETHON_URL = process.env.TELETHON_URL || 'http://localhost:8700'
const SHADOWBROKER_URL = process.env.SHADOWBROKER_URL || 'http://localhost:8660'
const COGNITIVE_URL = process.env.COGNITIVE_URL || 'http://localhost:8645'
const DEERFLOW_URL = process.env.DEERFLOW_URL || 'http://localhost:8000'
const WHATSAPP_BRIDGE_URL = process.env.WHATSAPP_BRIDGE_URL || 'http://localhost:3001'

const MAX_TOOL_ITERATIONS = 8

export interface AgentResult {
  success: boolean
  response?: string
  toolCalls?: Array<{ name: string; args: any; result: any }>
  error?: string
}

// ─── Tool Definitions (OpenRouter/OpenAI function calling format) ────────────

const toolDefinitions = [
  // ─── Telegram / Telethon Tools ──────────────────────────────────────────
  {
    type: 'function' as const,
    function: {
      name: 'telegram_list_groups',
      description: 'Lista todos los grupos y canales de Telegram del usuario. Incluye nombre, tipo, participantes y mensajes sin leer. Usa esta herramienta cuando el usuario quiera ver sus grupos.',
      parameters: {
        type: 'object',
        properties: {
          include_channels: {
            type: 'boolean',
            description: 'Incluir canales (broadcast) en la lista',
            default: true,
          },
        },
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'telegram_analyze_groups',
      description: 'Analiza en profundidad todos los grupos de Telegram del usuario. Recopila datos de cada grupo, estadísticas, actividad, y genera un análisis con IA. Útil cuando el usuario pide analizar sus grupos o quiere un resumen de actividad.',
      parameters: {
        type: 'object',
        properties: {
          deep: {
            type: 'boolean',
            description: 'Análisis profundo con IA (más lento pero más detallado)',
            default: true,
          },
          group_ids: {
            type: 'array',
            items: { type: 'number' },
            description: 'IDs de grupos específicos a analizar. Si está vacío, analiza todos.',
            default: [],
          },
        },
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'telegram_search',
      description: 'Busca mensajes en todos los grupos de Telegram del usuario. Retorna los mensajes que contienen el término de búsqueda con contexto del grupo.',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'Término o frase a buscar en los mensajes',
          },
          limit_per_group: {
            type: 'number',
            description: 'Máximo de resultados por grupo',
            default: 5,
          },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'telegram_get_messages',
      description: 'Obtiene los mensajes recientes de un grupo específico de Telegram. Útil para ver la conversación actual de un grupo.',
      parameters: {
        type: 'object',
        properties: {
          chat_id: {
            type: 'number',
            description: 'ID del grupo o chat',
          },
          limit: {
            type: 'number',
            description: 'Cantidad de mensajes a obtener',
            default: 20,
          },
        },
        required: ['chat_id'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'telegram_send_message',
      description: 'Envía un mensaje a un grupo o chat de Telegram como el usuario. Útil cuando el usuario quiere responder o enviar un mensaje.',
      parameters: {
        type: 'object',
        properties: {
          chat_id: {
            type: 'number',
            description: 'ID del grupo o chat destino',
          },
          message: {
            type: 'string',
            description: 'Texto del mensaje a enviar',
          },
        },
        required: ['chat_id', 'message'],
      },
    },
  },

  // ─── Shadowbroker OSINT Tools ───────────────────────────────────────────
  {
    type: 'function' as const,
    function: {
      name: 'shadowbroker_report',
      description: 'Genera un reporte de inteligencia OSINT completo usando Shadowbroker. Incluye evaluación de amenazas, análisis geoespacial, eventos recientes y recomendaciones. Útil cuando el usuario pide un reporte de inteligencia, situación OSINT, o estado de amenazas.',
      parameters: {
        type: 'object',
        properties: {
          report_type: {
            type: 'string',
            enum: ['threat', 'geospatial', 'anomaly', 'correlation', 'full'],
            description: 'Tipo de reporte: threat (amenazas), geospatial (geográfico), anomaly (anomalías), correlation (correlaciones), full (completo)',
            default: 'full',
          },
        },
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'shadowbroker_threat',
      description: 'Obtiene la evaluación actual de amenazas OSINT de Shadowbroker. Retorna el nivel de amenaza, detalles y recomendaciones. Útil para consultas rápidas sobre la situación de amenazas.',
      parameters: {
        type: 'object',
        properties: {},
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'shadowbroker_events',
      description: 'Obtiene eventos de inteligencia OSINT recientes de Shadowbroker. Se puede filtrar por severidad.',
      parameters: {
        type: 'object',
        properties: {
          limit: {
            type: 'number',
            description: 'Cantidad máxima de eventos',
            default: 20,
          },
          severity: {
            type: 'string',
            enum: ['low', 'medium', 'high', 'critical'],
            description: 'Filtrar por severidad de evento',
          },
        },
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'shadowbroker_analyze',
      description: 'Ejecuta un análisis específico en los datos OSINT de Shadowbroker: panorama de amenazas, anomalías, correlaciones, o eventos geoespaciales.',
      parameters: {
        type: 'object',
        properties: {
          analysis_type: {
            type: 'string',
            enum: ['threat', 'geospatial', 'anomaly', 'correlation'],
            description: 'Tipo de análisis: threat (amenazas), geospatial (geográfico), anomaly (anomalías), correlation (correlaciones)',
          },
        },
        required: ['analysis_type'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'shadowbroker_dashboard',
      description: 'Obtiene el dashboard completo de Shadowbroker: amenazas, alertas, estadísticas, eventos recientes. Útil para dar un resumen rápido del estado de inteligencia.',
      parameters: {
        type: 'object',
        properties: {},
      },
    },
  },

  // ─── Cognitive API Tools ────────────────────────────────────────────────
  {
    type: 'function' as const,
    function: {
      name: 'cognitive_search',
      description: 'Busca en la base de conocimiento cognitiva (memoria del sistema). Incluye entidades, decisiones, patrones y mensajes previamente analizados.',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'Término de búsqueda en la base de conocimiento',
          },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'cognitive_entities',
      description: 'Lista las entidades almacenadas en la base de conocimiento cognitiva. Se puede filtrar por tipo (persona, organización, evento, etc).',
      parameters: {
        type: 'object',
        properties: {
          type: {
            type: 'string',
            description: 'Filtrar por tipo de entidad',
          },
          limit: {
            type: 'number',
            description: 'Cantidad máxima de entidades',
            default: 20,
          },
        },
      },
    },
  },

  // ─── Ecosystem Tools ────────────────────────────────────────────────────
  {
    type: 'function' as const,
    function: {
      name: 'ecosystem_status',
      description: 'Obtiene el estado de todos los servicios del ecosistema Whatomate: Telethon, Shadowbroker, Cognitive API, WhatsApp Bridge, etc. Útil para diagnosticar problemas o verificar que todo está funcionando.',
      parameters: {
        type: 'object',
        properties: {},
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'whatsapp_status',
      description: 'Obtiene el estado de la conexión de WhatsApp Bridge.',
      parameters: {
        type: 'object',
        properties: {},
      },
    },
  },
]

// ─── Tool Execution ─────────────────────────────────────────────────────────

async function executeTool(name: string, args: Record<string, any>): Promise<any> {
  const toolExecutors: Record<string, () => Promise<any>> = {
    // ─── Telegram / Telethon ──────────────────────────────────────────
    telegram_list_groups: async () => {
      return await fetchJSON(`${TELETHON_URL}/groups`, 'GET')
    },

    telegram_analyze_groups: async () => {
      return await fetchJSON(`${TELETHON_URL}/analyze`, 'POST', {
        deep: args.deep ?? true,
        group_ids: args.group_ids || [],
      })
    },

    telegram_search: async () => {
      return await fetchJSON(`${TELETHON_URL}/search`, 'POST', {
        query: args.query,
        limit_per_group: args.limit_per_group ?? 5,
      })
    },

    telegram_get_messages: async () => {
      return await fetchJSON(`${TELETHON_URL}/groups/${args.chat_id}/messages?limit=${args.limit || 20}`, 'GET')
    },

    telegram_send_message: async () => {
      return await fetchJSON(`${TELETHON_URL}/send`, 'POST', {
        chat_id: args.chat_id,
        message: args.message,
      })
    },

    // ─── Shadowbroker ─────────────────────────────────────────────────
    shadowbroker_report: async () => {
      try {
        return await fetchJSON(`${SHADOWBROKER_URL}/report`, 'POST', {
          type: args.report_type || 'full',
        })
      } catch {
        // Fallback to different endpoint patterns
        try {
          return await fetchJSON(`${SHADOWBROKER_URL}/api/ai/report`, 'GET')
        } catch {
          return await fetchJSON(`${SHADOWBROKER_URL}/analyze`, 'POST', {
            type: args.report_type || 'threat',
          })
        }
      }
    },

    shadowbroker_threat: async () => {
      try {
        return await fetchJSON(`${SHADOWBROKER_URL}/threat-level`, 'GET')
      } catch {
        try {
          return await fetchJSON(`${SHADOWBROKER_URL}/api/threats/latest`, 'GET')
        } catch {
          return await fetchJSON(`${SHADOWBROKER_URL}/analyze`, 'POST', { type: 'threat' })
        }
      }
    },

    shadowbroker_events: async () => {
      const params = new URLSearchParams()
      if (args.limit) params.set('limit', String(args.limit))
      if (args.severity) params.set('severity', args.severity)
      const qs = params.toString()
      try {
        return await fetchJSON(`${SHADOWBROKER_URL}/events${qs ? '?' + qs : ''}`, 'GET')
      } catch {
        return await fetchJSON(`${SHADOWBROKER_URL}/api/events${qs ? '?' + qs : ''}`, 'GET')
      }
    },

    shadowbroker_analyze: async () => {
      return await fetchJSON(`${SHADOWBROKER_URL}/analyze`, 'POST', {
        type: args.analysis_type,
      })
    },

    shadowbroker_dashboard: async () => {
      try {
        return await fetchJSON(`${SHADOWBROKER_URL}/dashboard`, 'GET')
      } catch {
        // Build dashboard from individual endpoints
        const [threats, events, health] = await Promise.allSettled([
          fetchJSON(`${SHADOWBROKER_URL}/threat-level`, 'GET'),
          fetchJSON(`${SHADOWBROKER_URL}/events?limit=10`, 'GET'),
          fetchJSON(`${SHADOWBROKER_URL}/health`, 'GET'),
        ])
        return {
          threats: threats.status === 'fulfilled' ? threats.value : null,
          recent_events: events.status === 'fulfilled' ? events.value : null,
          health: health.status === 'fulfilled' ? health.value : null,
        }
      }
    },

    // ─── Cognitive ────────────────────────────────────────────────────
    cognitive_search: async () => {
      return await fetchJSON(`${COGNITIVE_URL}/search?q=${encodeURIComponent(args.query)}`, 'GET')
    },

    cognitive_entities: async () => {
      const params = new URLSearchParams()
      if (args.type) params.set('type', args.type)
      if (args.limit) params.set('limit', String(args.limit))
      const qs = params.toString()
      return await fetchJSON(`${COGNITIVE_URL}/entities${qs ? '?' + qs : ''}`, 'GET')
    },

    // ─── Ecosystem ────────────────────────────────────────────────────
    ecosystem_status: async () => {
      const services = [
        { name: 'Telethon', url: `${TELETHON_URL}/health` },
        { name: 'Shadowbroker', url: `${SHADOWBROKER_URL}/health` },
        { name: 'Cognitive API', url: `${COGNITIVE_URL}/health` },
        { name: 'WhatsApp Bridge', url: `${WHATSAPP_BRIDGE_URL}/health` },
      ]

      const results: Record<string, any> = {}
      const checks = await Promise.allSettled(
        services.map(async (svc) => {
          try {
            const data = await fetchJSON(svc.url, 'GET', null, 3000)
            return { name: svc.name, reachable: true, data }
          } catch {
            return { name: svc.name, reachable: false }
          }
        }),
      )

      for (const check of checks) {
        if (check.status === 'fulfilled') {
          results[check.value.name] = check.value
        }
      }

      return results
    },

    whatsapp_status: async () => {
      return await fetchJSON(`${WHATSAPP_BRIDGE_URL}/health`, 'GET')
    },
  }

  const executor = toolExecutors[name]
  if (!executor) {
    throw new Error(`Unknown tool: ${name}`)
  }

  return await executor()
}

// ─── Agent System Prompt ────────────────────────────────────────────────────

const SYSTEM_PROMPT = `Eres Hermes, un agente de inteligencia autónomo integrado en la plataforma Whatomate. Tu trabajo es entender lo que el usuario necesita y usar las herramientas disponibles para cumplir su solicitud.

CAPACIDADES:
- Analizar grupos, canales y mensajes de Telegram (via Telethon)
- Buscar mensajes en todos los grupos de Telegram
- Generar reportes de inteligencia OSINT (via Shadowbroker)
- Evaluar amenazas y analizar anomalías
- Buscar en la base de conocimiento cognitiva
- Verificar el estado del ecosistema

COMPORTAMIENTO:
1. ANALIZA la solicitud del usuario - qué necesita exactamente
2. DESCOMPONE en tareas si es compleja
3. USA las herramientas necesarias - no respondas de memoria si puedes consultar datos reales
4. SINTETIZA la información de las herramientas en una respuesta clara y útil
5. Si algo falla, intenta alternativas y explica qué pasó

REGLAS:
- Siempre prefiere datos reales sobre suposiciones
- Si el usuario pide analizar algo, USA las herramientas para obtener datos reales primero
- Si una herramienta falla, informa al usuario y sugiere alternativas
- Responde en el mismo idioma que el usuario
- Sé conciso pero completo
- Incluye datos específicos (números, nombres, fechas) cuando estén disponibles
- Si el usuario pide algo que no puedes hacer con las herramientas, dilo claramente

EJEMPLOS DE INTENCIÓN → HERRAMIENTAS:
- "analiza mis grupos" → telegram_analyze_groups
- "lista mis grupos" / "cuántos grupos tengo" → telegram_list_groups
- "busca X en mis grupos" → telegram_search
- "reporte shadowbroker" / "situación OSINT" → shadowbroker_report
- "nivel de amenaza" → shadowbroker_threat
- "eventos recientes" → shadowbroker_events
- "qué está pasando" → shadowbroker_dashboard
- "estado del sistema" → ecosystem_status
- "busca en mi conocimiento" → cognitive_search
- Cualquier otra cosa → usa las herramientas relevantes o responde con tu conocimiento`

// ─── AgentExecutor Class ─────────────────────────────────────────────────────

export class AgentExecutor {
  private eventBus: EventBusBridge | null = null
  private conversationHistory: Map<string, Array<{ role: string; content: string }>> = new Map()

  constructor(eventBus?: EventBusBridge) {
    this.eventBus = eventBus || null
  }

  setEventBus(eventBus: EventBusBridge): void {
    this.eventBus = eventBus
  }

  /**
   * Process a user message through the intelligent agent loop.
   * The AI will decide which tools to call, if any.
   */
  async execute(
    userMessage: string,
    chatId?: string,
    options: { maxIterations?: number } = {},
  ): Promise<AgentResult> {
    const maxIterations = options.maxIterations ?? MAX_TOOL_ITERATIONS
    const toolCallsLog: Array<{ name: string; args: any; result: any }> = []

    if (!OPENROUTER_KEY) {
      return {
        success: false,
        error: 'OPENROUTER_API_KEY not configured',
        response: 'Error: La clave de API de OpenRouter no está configurada. No puedo procesar tu solicitud.',
      }
    }

    // Build conversation messages
    const messages: Array<{ role: string; content: string | null; tool_calls?: any; tool_call_id?: string; name?: string }> = []

    // Add conversation context
    const context = chatId ? this.conversationHistory.get(chatId) : null
    if (context && context.length > 0) {
      // Keep last 10 messages for context
      const recentContext = context.slice(-10)
      for (const msg of recentContext) {
        messages.push({ role: msg.role, content: msg.content })
      }
    }

    // Add current user message
    messages.push({ role: 'user', content: userMessage })

    // Publish agent started event
    this.publishEvent('hermes:command_received', {
      type: 'hermes.agent.started',
      source: 'hermes-agent',
      timestamp: Date.now(),
      message: userMessage.substring(0, 200),
      chatId,
    })

    // ─── Agent Loop ──────────────────────────────────────────────────────
    for (let iteration = 0; iteration < maxIterations; iteration++) {
      try {
        const response = await this.callOpenRouter(messages)

        // Check if the model wants to call tools
        const choice = response?.choices?.[0]
        if (!choice) {
          return { success: false, error: 'Empty response from AI', response: 'No recibí respuesta del modelo de IA.' }
        }

        const assistantMessage = choice.message

        // If there are tool calls, execute them
        if (assistantMessage.tool_calls && assistantMessage.tool_calls.length > 0) {
          // Add assistant message with tool calls to conversation
          messages.push({
            role: 'assistant',
            content: assistantMessage.content || null,
            tool_calls: assistantMessage.tool_calls,
          } as any)

          // Execute each tool call
          for (const toolCall of assistantMessage.tool_calls) {
            const toolName = toolCall.function.name
            let toolArgs: any = {}

            try {
              toolArgs = JSON.parse(toolCall.function.arguments || '{}')
            } catch {
              toolArgs = {}
            }

            console.log(`[hermes:agent] Tool call #${iteration + 1}: ${toolName}(${JSON.stringify(toolArgs).substring(0, 100)})`)

            let toolResult: any
            try {
              toolResult = await executeTool(toolName, toolArgs)
              toolCallsLog.push({ name: toolName, args: toolArgs, result: toolResult })

              // Publish tool execution event
              this.publishEvent('hermes:tool_executed', {
                type: 'hermes.tool',
                source: 'hermes-agent',
                timestamp: Date.now(),
                tool: toolName,
                args: toolArgs,
                success: true,
                chatId,
              })
            } catch (err: any) {
              toolResult = { error: err.message, tool: toolName }
              toolCallsLog.push({ name: toolName, args: toolArgs, result: toolResult })

              console.error(`[hermes:agent] Tool ${toolName} error: ${err.message}`)

              this.publishEvent('hermes:tool_error', {
                type: 'hermes.tool.error',
                source: 'hermes-agent',
                timestamp: Date.now(),
                tool: toolName,
                error: err.message,
                chatId,
              })
            }

            // Add tool result to conversation
            messages.push({
              role: 'tool',
              content: JSON.stringify(toolResult).substring(0, 8000),
              tool_call_id: toolCall.id,
            } as any)
          }

          // Continue the loop - the model will process tool results
          continue
        }

        // No tool calls - this is the final response
        const finalContent = assistantMessage.content || 'No pude generar una respuesta.'

        // Save conversation context
        if (chatId) {
          if (!this.conversationHistory.has(chatId)) {
            this.conversationHistory.set(chatId, [])
          }
          const history = this.conversationHistory.get(chatId)!
          history.push({ role: 'user', content: userMessage.substring(0, 500) })
          history.push({ role: 'assistant', content: finalContent.substring(0, 1000) })
          // Keep only last 20 messages
          if (history.length > 20) {
            this.conversationHistory.set(chatId, history.slice(-20))
          }
        }

        // Publish completion event
        this.publishEvent('hermes:agent_completed', {
          type: 'hermes.agent.completed',
          source: 'hermes-agent',
          timestamp: Date.now(),
          toolCallsCount: toolCallsLog.length,
          chatId,
        })

        return {
          success: true,
          response: finalContent,
          toolCalls: toolCallsLog.length > 0 ? toolCallsLog : undefined,
        }

      } catch (err: any) {
        console.error(`[hermes:agent] Iteration ${iteration} error: ${err.message}`)

        // If it's a non-retryable error, return immediately
        if (err.message?.includes('API key') || err.message?.includes('rate limit')) {
          return {
            success: false,
            error: err.message,
            response: `Error del servicio de IA: ${err.message}`,
          }
        }

        // On last iteration, return error
        if (iteration === maxIterations - 1) {
          return {
            success: false,
            error: err.message,
            response: `No pude completar tu solicitud después de ${maxIterations} intentos. Error: ${err.message}`,
          }
        }

        // Wait and retry
        await new Promise(r => setTimeout(r, 1000))
      }
    }

    return {
      success: false,
      error: 'Max iterations reached',
      response: `Alcancé el límite de iteraciones (${maxIterations}) procesando tu solicitud. Intenta simplificar tu pregunta.`,
    }
  }

  /**
   * Quick chat without tools - for simple conversations
   */
  async chat(messages: Array<{ role: string; content: string }>, options: any = {}): Promise<string> {
    if (!OPENROUTER_KEY) {
      throw new Error('OPENROUTER_API_KEY not configured')
    }

    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENROUTER_KEY}`,
        'HTTP-Referer': 'https://whatomate.local',
        'X-Title': 'Hermes-Agent',
      },
      body: JSON.stringify({
        model: options.model || OPENROUTER_MODEL,
        messages,
        temperature: options.temperature ?? 0.7,
        max_tokens: options.max_tokens ?? 2000,
      }),
      signal: AbortSignal.timeout(60000),
    })

    if (!response.ok) {
      const errBody = await response.text().catch(() => '')
      throw new Error(`OpenRouter HTTP ${response.status}: ${errBody.substring(0, 200)}`)
    }

    const result = await response.json() as any
    return result?.choices?.[0]?.message?.content || 'Sin respuesta'
  }

  /**
   * OpenAI-compatible chat completions endpoint
   */
  async chatCompletion(messages: any[], options: any = {}): Promise<any> {
    const response = await this.chat(messages, options)
    return {
      id: `hermes-${Date.now()}`,
      object: 'chat.completion',
      created: Math.floor(Date.now() / 1000),
      model: options.model || OPENROUTER_MODEL,
      choices: [{
        index: 0,
        message: { role: 'assistant', content: response },
        finish_reason: 'stop',
      }],
    }
  }

  /**
   * Check ecosystem health
   */
  async checkEcosystem(): Promise<Record<string, any>> {
    const services: Record<string, { url: string }> = {
      telethon: { url: TELETHON_URL },
      shadowbroker: { url: SHADOWBROKER_URL },
      cognitive: { url: COGNITIVE_URL },
      deerflow: { url: DEERFLOW_URL },
      whatsapp_bridge: { url: WHATSAPP_BRIDGE_URL },
    }

    const results: Record<string, any> = {}

    await Promise.allSettled(
      Object.entries(services).map(async ([name, config]) => {
        try {
          const data = await fetchJSON(`${config.url}/health`, 'GET', null, 3000)
          results[name] = { reachable: true, status: data?.status || 'ok', version: data?.version }
        } catch {
          results[name] = { reachable: false }
        }
      }),
    )

    return results
  }

  // ─── Private Methods ────────────────────────────────────────────────────

  private async callOpenRouter(messages: any[]): Promise<any> {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENROUTER_KEY}`,
        'HTTP-Referer': 'https://whatomate.local',
        'X-Title': 'Hermes-Agent',
      },
      body: JSON.stringify({
        model: OPENROUTER_MODEL,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          ...messages,
        ],
        tools: toolDefinitions,
        tool_choice: 'auto',
        temperature: 0.6,
        max_tokens: 4000,
      }),
      signal: AbortSignal.timeout(90000),
    })

    if (!response.ok) {
      const errBody = await response.text().catch(() => '')
      throw new Error(`OpenRouter HTTP ${response.status}: ${errBody.substring(0, 300)}`)
    }

    return await response.json()
  }

  private publishEvent(stream: string, event: Record<string, any>): void {
    if (this.eventBus) {
      this.eventBus.publish(stream, event).catch(() => {})
    }
  }
}

// ─── Utility ─────────────────────────────────────────────────────────────────

async function fetchJSON(url: string, method: string = 'GET', body: any = null, timeout: number = 30000): Promise<any> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeout)

  try {
    const options: RequestInit = {
      method,
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
    }
    if (body && method !== 'GET') {
      options.body = JSON.stringify(body)
    }

    const resp = await fetch(url, options)
    if (!resp.ok) {
      const text = await resp.text().catch(() => '')
      throw new Error(`HTTP ${resp.status}: ${text.substring(0, 300)}`)
    }
    return await resp.json()
  } finally {
    clearTimeout(timer)
  }
}
