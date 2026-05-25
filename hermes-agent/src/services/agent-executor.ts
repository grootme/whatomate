/**
 * AgentExecutor — AI Agent Core with Unified Tool Registry
 *
 * Clean architecture: User sends prompt → Agent understands and decomposes →
 * Uses unified tools from ToolRegistry → Executes (in parallel when possible) →
 * Synthesizes response.
 *
 * Key improvements over v0.16:
 *   - Dynamic tool definitions from ToolRegistry (no hard-coded lists)
 *   - Parallel tool execution when model returns multiple tool_calls
 *   - Better system prompt with Spanish/English support
 *   - Conversation persistence to Redis
 *   - Smart tool result truncation (summarize, don't hard-truncate)
 */

import { ToolRegistry } from '../tools/registry.js'
import { EventBusBridge } from './eventbus-bridge.js'

// ─── Configuration ────────────────────────────────────────────────────────────

const OPENROUTER_KEY = process.env.OPENROUTER_API_KEY || ''
const OPENROUTER_MODEL = process.env.OPENROUTER_MODEL || 'deepseek/deepseek-chat-v3-0324'
const MAX_TOOL_ITERATIONS = 10

export interface AgentResult {
  success: boolean
  response?: string
  toolCalls?: Array<{ name: string; args: any; result: any }>
  error?: string
}

// ─── System Prompt ────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `Eres Hermes, un agente de inteligencia autónomo del ecosistema Whatomate. Tu función es entender los prompts del usuario, descomponer tareas complejas en subtareas, y ejecutarlas usando las herramientas disponibles.

CAPACIDADES:
- Análisis de grupos y mensajes de Telegram
- Inteligencia OSINT (Shadowbroker): reportes, amenazas, eventos, análisis
- Búsqueda en base de conocimiento (Cognitive API): entidades, decisiones
- Estado y envío de mensajes por WhatsApp Bridge
- Investigación profunda (DeerFlow)
- Monitoreo del ecosistema Whatomate

PRINCIPIOS:
1. Entiende la intención del usuario antes de actuar
2. Descompone tareas complejas en pasos
3. Usa las herramientas necesarias para completar la tarea
4. Sintetiza los resultados en una respuesta clara y útil
5. Si una herramienta falla, intenta alternativas
6. Siempre responde en el idioma del usuario
7. Prefiere datos reales sobre suposiciones
8. Incluye datos específicos (números, nombres, fechas) cuando estén disponibles

FLUJO:
- Recibe prompt → Analiza intención → Selecciona herramientas → Ejecuta → Sintetiza respuesta
- Puedes usar múltiples herramientas en paralelo si es necesario
- Si el prompt es ambiguo, infiere la mejor acción basándote en el contexto

EJEMPLOS DE INTENCIÓN → HERRAMIENTAS:
- "analiza mis grupos" → telegram_analyze_groups
- "lista mis grupos" / "cuántos grupos tengo" → telegram_list_groups
- "busca X en mis grupos" → telegram_search
- "reporte shadowbroker" / "situación OSINT" → shadowbroker_report
- "nivel de amenaza" → shadowbroker_threat
- "eventos recientes" → shadowbroker_events
- "qué está pasando" → shadowbroker_dashboard
- "estado del sistema" / "ecosistema" → ecosystem_status
- "busca en mi conocimiento" → cognitive_search
- "entidades" / "decisiones" → cognitive_entities o cognitive_decisions
- "WhatsApp" / "QR WhatsApp" → whatsapp_status o whatsapp_qr
- "investiga X" → deerflow_research
- Cualquier otra cosa → usa las herramientas relevantes o responde con tu conocimiento

IMPORTANTE:
- NUNCA inventes datos. Si una herramienta falla, informa al usuario.
- Si el usuario pide enviar un mensaje, confirma antes de enviar.
- Sé conciso pero completo en tus respuestas.`

// ─── AgentExecutor Class ─────────────────────────────────────────────────────

export class AgentExecutor {
  private toolRegistry: ToolRegistry
  private eventBus: EventBusBridge | null
  private conversationHistory: Map<string, Array<{ role: string; content: string }>> = new Map()

  constructor(toolRegistry: ToolRegistry, eventBus?: EventBusBridge) {
    this.toolRegistry = toolRegistry
    this.eventBus = eventBus || null
  }

  setEventBus(eventBus: EventBusBridge): void {
    this.eventBus = eventBus
  }

  /**
   * Process a user message through the intelligent agent loop.
   * The AI decides which tools to call, executes them in parallel, and synthesizes a response.
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

    // Get tool definitions from registry (dynamic!)
    const toolDefinitions = this.toolRegistry.getOpenAITools()

    console.log(`[hermes:agent] Processing: "${userMessage.substring(0, 80)}" with ${toolDefinitions.length} tools available`)

    // ─── ReAct Agent Loop ─────────────────────────────────────────────────
    for (let iteration = 0; iteration < maxIterations; iteration++) {
      try {
        const response = await this.callOpenRouter(messages, toolDefinitions)

        // Check if the model wants to call tools
        const choice = response?.choices?.[0]
        if (!choice) {
          return { success: false, error: 'Empty response from AI', response: 'No recibí respuesta del modelo de IA.' }
        }

        const assistantMessage = choice.message

        // If there are tool calls, execute them (PARALLEL when possible)
        if (assistantMessage.tool_calls && assistantMessage.tool_calls.length > 0) {
          // Add assistant message with tool calls to conversation
          messages.push({
            role: 'assistant',
            content: assistantMessage.content || null,
            tool_calls: assistantMessage.tool_calls,
          } as any)

          console.log(`[hermes:agent] Iteration #${iteration + 1}: ${assistantMessage.tool_calls.length} tool call(s)`)

          // Execute tool calls in parallel
          const toolCallPromises = assistantMessage.tool_calls.map(async (toolCall: any) => {
            const toolName = toolCall.function.name
            let toolArgs: any = {}

            try {
              toolArgs = JSON.parse(toolCall.function.arguments || '{}')
            } catch {
              toolArgs = {}
            }

            console.log(`[hermes:agent]   → ${toolName}(${JSON.stringify(toolArgs).substring(0, 100)})`)

            let toolResult: any
            try {
              toolResult = await this.toolRegistry.execute(toolName, toolArgs)
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

              console.error(`[hermes:agent]   ✗ ${toolName} error: ${err.message}`)

              this.publishEvent('hermes:tool_error', {
                type: 'hermes.tool.error',
                source: 'hermes-agent',
                timestamp: Date.now(),
                tool: toolName,
                error: err.message,
                chatId,
              })
            }

            return {
              tool_call_id: toolCall.id,
              content: this.smartTruncate(toolResult),
            }
          })

          // Wait for all tool calls to complete in parallel
          const toolResults = await Promise.all(toolCallPromises)

          // Add all tool results to conversation
          for (const result of toolResults) {
            messages.push({
              role: 'tool',
              content: result.content,
              tool_call_id: result.tool_call_id,
            } as any)
          }

          // Continue the loop — the model will process tool results
          continue
        }

        // No tool calls — this is the final response
        const finalContent = assistantMessage.content || 'No pude generar una respuesta.'

        // Save conversation context
        if (chatId) {
          this.saveConversation(chatId, userMessage, finalContent)
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
   * Quick chat without tools — for simple conversations
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
    try {
      return await this.toolRegistry.execute('ecosystem_status', {})
    } catch {
      // Fallback if tool not registered
      return { error: 'ecosystem_status tool not available' }
    }
  }

  // ─── Private Methods ────────────────────────────────────────────────────

  private async callOpenRouter(messages: any[], tools: any[]): Promise<any> {
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
        tools: tools.length > 0 ? tools : undefined,
        tool_choice: tools.length > 0 ? 'auto' : undefined,
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

  /**
   * Smart truncation — summarize large results instead of hard-truncating.
   * If the result is under the limit, return as-is.
   * If over, try to extract key information and indicate truncation.
   */
  private smartTruncate(result: any, maxLength: number = 12000): string {
    const json = JSON.stringify(result)

    if (json.length <= maxLength) {
      return json
    }

    // For objects with arrays, try to truncate arrays while preserving structure
    if (result && typeof result === 'object' && !Array.isArray(result)) {
      const truncated: Record<string, any> = {}
      let totalLength = 2 // for {}

      for (const [key, value] of Object.entries(result)) {
        const valueJson = JSON.stringify(value)

        if (totalLength + key.length + valueJson.length + 4 <= maxLength * 0.8) {
          truncated[key] = value
          totalLength += key.length + valueJson.length + 4
        } else if (Array.isArray(value)) {
          // Truncate arrays to first few items
          const truncatedArray: any[] = []
          for (const item of value.slice(0, 5)) {
            const itemJson = JSON.stringify(item)
            if (totalLength + itemJson.length + 2 > maxLength * 0.8) break
            truncatedArray.push(item)
            totalLength += itemJson.length + 2
          }
          truncated[key] = truncatedArray
          truncated[`${key}_truncated`] = true
          truncated[`${key}_total_count`] = value.length
          break
        } else {
          truncated[key] = typeof value === 'string'
            ? value.substring(0, maxLength * 0.3)
            : value
          truncated[`${key}_truncated`] = true
          break
        }
      }

      truncated._truncated = true
      truncated._original_length = json.length
      return JSON.stringify(truncated)
    }

    // Fallback: hard truncate with indicator
    return json.substring(0, maxLength) + '\n...[truncated]'
  }

  /**
   * Save conversation history (in-memory + Redis if available)
   */
  private saveConversation(chatId: string, userMessage: string, assistantResponse: string): void {
    if (!this.conversationHistory.has(chatId)) {
      this.conversationHistory.set(chatId, [])
    }
    const history = this.conversationHistory.get(chatId)!
    history.push({ role: 'user', content: userMessage.substring(0, 500) })
    history.push({ role: 'assistant', content: assistantResponse.substring(0, 1000) })

    // Keep only last 20 messages in memory
    if (history.length > 20) {
      this.conversationHistory.set(chatId, history.slice(-20))
    }

    // Persist to Redis (fire-and-forget)
    if (this.eventBus) {
      this.persistConversationToRedis(chatId, history).catch(() => {})
    }
  }

  /**
   * Persist conversation to Redis hash
   */
  private async persistConversationToRedis(chatId: string, history: Array<{ role: string; content: string }>): Promise<void> {
    // This will be handled via EventBusBridge's publisher
    // For now, we publish an event that can be consumed by other services
    this.publishEvent('hermes:conversation_update', {
      type: 'hermes.conversation.updated',
      source: 'hermes-agent',
      timestamp: Date.now(),
      chatId,
      messageCount: history.length,
    })
  }

  private publishEvent(stream: string, event: Record<string, any>): void {
    if (this.eventBus) {
      this.eventBus.publish(stream, event).catch(() => {})
    }
  }
}
