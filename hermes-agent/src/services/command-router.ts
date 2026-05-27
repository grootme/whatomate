/**
 * Command Router — Routes user commands to the appropriate ecosystem service.
 *
 * Commands:
 *   "analiza mis grupos"    → Telethon → AI Analysis
 *   "lista mis grupos"      → Telethon → List groups
 *   "busca [término]"       → Telethon → Search
 *   "reporte shadowbroker"  → Shadowbroker → AI Report
 *   "reporte [tema]"        → DeerFlow/Shadowbroker → Research Report
 *   "estado"                → Ecosystem health check
 *   Any other text          → OpenRouter AI Chat
 */

import { SkillsRegistry } from '../skills/index.js'
import { ToolsRegistry } from '../tools/index.js'
import { EventBusBridge } from './eventbus-bridge.js'

// ─── Configuration ────────────────────────────────────────────────────────────

const TELETHON_URL = process.env.TELETHON_URL || 'http://localhost:8700'
const SHADOWBROKER_URL = process.env.SHADOWBROKER_URL || 'http://localhost:8660'
const COGNITIVE_URL = process.env.COGNITIVE_URL || 'http://localhost:8645'
const DEERFLOW_URL = process.env.DEERFLOW_URL || 'http://localhost:8000'
const WHATSAPP_BRIDGE_URL = process.env.WHATSAPP_BRIDGE_URL || 'http://localhost:3001'
const OPENROUTER_KEY = process.env.OPENROUTER_API_KEY || ''
const OPENROUTER_MODEL = process.env.OPENROUTER_MODEL || 'deepseek/deepseek-chat-v3-0324'

export interface CommandResult {
  success: boolean
  command?: string
  response?: string
  data?: any
  error?: string
}

export class CommandRouter {
  private skills: SkillsRegistry
  private tools: ToolsRegistry
  private eventBus: EventBusBridge

  constructor(skills: SkillsRegistry, tools: ToolsRegistry, eventBus: EventBusBridge) {
    this.skills = skills
    this.tools = tools
    this.eventBus = eventBus
  }

  async processCommand(text: string, chatId?: string, args?: string): Promise<CommandResult> {
    const command = text.toLowerCase().trim()

    // Publish event to Redis
    this.eventBus.publish('hermes:command_received', {
      type: 'hermes.command',
      source: 'hermes-agent',
      timestamp: Date.now(),
      command: text,
      chatId,
    })

    try {
      // ─── Command: Analyze Groups ─────────────────────────────────────────
      if (this.matchKeywords(command, ['analiza grupo', 'analizar grupo', 'analiza mis grupo', 'analiza todos los grupo', 'analiza los grupo'])) {
        return await this.handleAnalyzeGroups(chatId)
      }

      // ─── Command: List Groups ────────────────────────────────────────────
      if (this.matchKeywords(command, ['lista grupo', 'listar grupo', 'lista mis grupo', 'mis grupo', 'show grupo', 'grupos'])) {
        return await this.handleListGroups(chatId)
      }

      // ─── Command: Search ─────────────────────────────────────────────────
      if (this.matchKeywords(command, ['busca', 'buscar', 'search'])) {
        const query = args || command.replace(/^(busca|buscar|search)\s*/i, '').trim()
        return await this.handleSearch(query, chatId)
      }

      // ─── Command: Shadowbroker Report ────────────────────────────────────
      if (this.matchKeywords(command, ['reporte shadowbroker', 'shadowbroker report', 'reporte osint', 'reporte inteligencia'])) {
        return await this.handleShadowbrokerReport(chatId)
      }

      // ─── Command: General Report ─────────────────────────────────────────
      if (this.matchKeywords(command, ['reporte', 'report', 'informe'])) {
        const topic = args || command.replace(/^(reporte|report|informe)\s*/i, '').trim()
        return await this.handleReport(topic || 'general', chatId)
      }

      // ─── Command: Ecosystem Status ───────────────────────────────────────
      if (this.matchKeywords(command, ['estado', 'status', 'ecosistema', 'sistema'])) {
        return await this.handleStatus(chatId)
      }

      // ─── Command: WhatsApp ───────────────────────────────────────────────
      if (this.matchKeywords(command, ['whatsapp', 'wa ', 'bridge'])) {
        return await this.handleWhatsApp(command, chatId)
      }

      // ─── Command: Help ───────────────────────────────────────────────────
      if (this.matchKeywords(command, ['ayuda', 'help', 'comandos', 'commands', '/start', '/help'])) {
        return this.handleHelp(chatId)
      }

      // ─── Default: AI Chat ────────────────────────────────────────────────
      return await this.handleChat(text, chatId)

    } catch (error: any) {
      console.error(`[hermes:router] Error: ${error.message}`)
      return {
        success: false,
        error: error.message,
        response: `Error procesando tu solicitud: ${error.message}`,
      }
    }
  }

  // ─── Command Handlers ────────────────────────────────────────────────────────

  private async handleAnalyzeGroups(chatId?: string): Promise<CommandResult> {
    console.log('[hermes:router] Command: Analyze groups')

    try {
      // Step 1: Gather data from Telethon
      const analysisData = await this.fetchJSON(`${TELETHON_URL}/analyze`, 'POST', { deep: true })

      // Step 2: If Telethon returned data, use AI to analyze
      if (analysisData && analysisData.total_groups > 0) {
        let response = `*Análisis de Grupos de Telegram*\n\n`
        response += `Total de grupos: ${analysisData.total_groups}\n`
        response += `Canales: ${analysisData.total_channels}\n`
        response += `Supergrupos: ${analysisData.total_supergroups}\n`
        response += `Grupos pequeños: ${analysisData.total_small_groups}\n`
        response += `Mensajes sin leer: ${analysisData.total_unread_messages} en ${analysisData.groups_with_unread} grupos\n\n`

        if (analysisData.ai_analysis?.answer) {
          response += `*Análisis IA:*\n${analysisData.ai_analysis.answer}`
        }

        // Publish event
        this.eventBus.publish('whatomate:analyzed_messages', {
          type: 'hermes.groups_analyzed',
          source: 'hermes-agent',
          timestamp: Date.now(),
          data: { total_groups: analysisData.total_groups, chatId },
        })

        return { success: true, command: 'analyze_groups', response, data: analysisData }
      }

      // If Telethon is not connected
      if (analysisData?.error) {
        return {
          success: false,
          command: 'analyze_groups',
          response: `No pude conectar con tu cuenta de Telegram. El servicio Telethon reporta: ${analysisData.error}\n\nNecesitas autenticar primero. Usa el endpoint /auth/send_code del servicio Telethon.`,
        }
      }

      return { success: false, command: 'analyze_groups', response: 'No se pudieron obtener datos de grupos.' }
    } catch (error: any) {
      // Telethon service not reachable
      return {
        success: false,
        command: 'analyze_groups',
        response: `El servicio Telethon no está disponible (${error.message}). Verifica que esté corriendo en el puerto 8700.`,
      }
    }
  }

  private async handleListGroups(chatId?: string): Promise<CommandResult> {
    console.log('[hermes:router] Command: List groups')

    try {
      const data = await this.fetchJSON(`${TELETHON_URL}/groups`)

      if (data && data.groups) {
        const groups = data.groups
        let response = `*Tus Grupos de Telegram* (${groups.length} total)\n\n`

        for (let i = 0; i < Math.min(groups.length, 30); i++) {
          const g = groups[i]
          const icon = g.chat_type === 'channel' ? '📢' : '👥'
          const unread = g.unread_count > 0 ? ` 🔴${g.unread_count}` : ''
          const participants = g.participants_count ? ` (${g.participants_count} participantes)` : ''
          response += `${i + 1}. ${icon} ${g.name}${participants}${unread}\n`
        }

        if (groups.length > 30) {
          response += `\n_...y ${groups.length - 30} más_`
        }

        return { success: true, command: 'list_groups', response, data }
      }

      return { success: false, command: 'list_groups', response: 'No se pudieron obtener los grupos.' }
    } catch (error: any) {
      return {
        success: false,
        command: 'list_groups',
        response: `Error obteniendo grupos: ${error.message}`,
      }
    }
  }

  private async handleSearch(query: string, chatId?: string): Promise<CommandResult> {
    if (!query) {
      return { success: false, response: 'Debes especificar qué buscar. Ejemplo: busca tecnología' }
    }

    console.log(`[hermes:router] Command: Search - ${query}`)

    try {
      const data = await this.fetchJSON(`${TELETHON_URL}/search`, 'POST', { query, limit_per_group: 5 })

      if (data) {
        let response = `*Búsqueda: "${query}"*\n\n`
        response += `Grupos buscados: ${data.groups_searched}\n`
        response += `Resultados: ${data.total_matches}\n\n`

        if (data.matches_by_group) {
          for (const group of data.matches_by_group.slice(0, 10)) {
            response += `*${group.group_name}* (${group.match_count} resultados)\n`
            for (const msg of (group.messages || []).slice(0, 3)) {
              const text = (msg.text || '').substring(0, 80)
              if (text) response += `  → ${text}...\n`
            }
            response += '\n'
          }
        }

        return { success: true, command: 'search', response, data }
      }

      return { success: false, command: 'search', response: 'No se pudo completar la búsqueda.' }
    } catch (error: any) {
      return {
        success: false,
        command: 'search',
        response: `Error en búsqueda: ${error.message}`,
      }
    }
  }

  private async handleShadowbrokerReport(chatId?: string): Promise<CommandResult> {
    console.log('[hermes:router] Command: Shadowbroker report')

    try {
      // Get threat assessment
      const threats = await this.fetchJSON(`${SHADOWBROKER_URL}/api/threats/latest`)
      const report = await this.fetchJSON(`${SHADOWBROKER_URL}/api/ai/report`)

      let response = `*Reporte de Shadowbroker OSINT*\n\n`

      if (report?.analysis) {
        response += report.analysis
      } else if (threats) {
        response += `Nivel de amenaza: ${threats.threat_level || 'unknown'}\n`
        response += `Confianza: ${threats.confidence || 'N/A'}\n\n`
        if (threats.analysis) response += threats.analysis
      } else {
        response += 'No hay datos de Shadowbroker disponibles. Verifica que el servicio esté corriendo en el puerto 8660.'
      }

      return { success: true, command: 'shadowbroker_report', response }
    } catch (error: any) {
      return {
        success: false,
        command: 'shadowbroker_report',
        response: `Error obteniendo reporte Shadowbroker: ${error.message}`,
      }
    }
  }

  private async handleReport(topic: string, chatId?: string): Promise<CommandResult> {
    console.log(`[hermes:router] Command: Report - ${topic}`)

    // Try DeerFlow first
    try {
      const deerflowResult = await this.fetchJSON(`${DEERFLOW_URL}/api/research`, 'POST', {
        topic,
        depth: 'standard',
      })

      if (deerflowResult?.report) {
        return {
          success: true,
          command: 'report',
          response: `*Reporte: ${topic}*\n\n${deerflowResult.report}`,
          data: deerflowResult,
        }
      }
    } catch { /* DeerFlow not available */ }

    // Fallback to AI analysis
    try {
      const aiResponse = await this.callAI([
        {
          role: 'system',
          content: 'Eres un analista experto. Genera un reporte detallado sobre el tema solicitado. Incluye: 1) Resumen ejecutivo 2) Análisis 3) Datos clave 4) Conclusiones 5) Recomendaciones. Responde en español.',
        },
        {
          role: 'user',
          content: `Genera un reporte sobre: ${topic}`,
        },
      ])

      return {
        success: true,
        command: 'report',
        response: `*Reporte: ${topic}*\n\n${aiResponse}`,
      }
    } catch (error: any) {
      return {
        success: false,
        command: 'report',
        response: `Error generando reporte: ${error.message}`,
      }
    }
  }

  private async handleStatus(chatId?: string): Promise<CommandResult> {
    const ecosystem = await this.checkEcosystem()

    let response = `*Estado del Ecosistema Whatomate*\n\n`
    for (const [name, status] of Object.entries(ecosystem)) {
      const icon = status.reachable ? '✅' : '❌'
      response += `${icon} ${name}: ${status.reachable ? 'OK' : 'No disponible'}${status.version ? ` (v${status.version})` : ''}\n`
    }

    const redis = await this.eventBus.getStatus()
    response += `\n${redis.connected ? '✅' : '❌'} Redis: ${redis.connected ? 'OK' : 'No disponible'}\n`
    response += `\n_Skills: ${this.skills.list().length} | Tools: ${this.tools.list().length}_`

    return { success: true, command: 'status', response, data: { ecosystem, redis } }
  }

  private async handleWhatsApp(command: string, chatId?: string): Promise<CommandResult> {
    try {
      const health = await this.fetchJSON(`${WHATSAPP_BRIDGE_URL}/health`)
      return {
        success: true,
        command: 'whatsapp',
        response: `*WhatsApp Bridge*\n\nEstado: ${health?.status || 'unknown'}\nConectado: ${health?.connected ? 'Sí' : 'No'}`,
      }
    } catch {
      return {
        success: false,
        command: 'whatsapp',
        response: 'WhatsApp Bridge no disponible. Verifica que esté corriendo en el puerto 3001.',
      }
    }
  }

  private handleHelp(chatId?: string): CommandResult {
    const response = `*Hermes Agent - Comandos Disponibles*\n
📊 _analiza mis grupos_ — Análisis completo de grupos de Telegram con IA
📋 _lista mis grupos_ — Lista todos los grupos con participantes
🔍 _busca [término]_ — Busca mensajes en todos los grupos
🛡 _reporte shadowbroker_ — Reporte OSINT de Shadowbroker
📝 _reporte [tema]_ — Genera un reporte sobre cualquier tema
📡 _estado_ — Estado del ecosistema
💬 _Cualquier otro texto_ — Chat IA con Hermes
🆘 _ayuda_ — Muestra esta ayuda

_Hermes puede analizar datos de Telegram, WhatsApp, Shadowbroker y más._`

    return { success: true, command: 'help', response }
  }

  private async handleChat(text: string, chatId?: string): Promise<CommandResult> {
    console.log(`[hermes:router] Chat: ${text.substring(0, 50)}...`)

    try {
      // Try skills first
      const skillMatch = this.skills.findMatch(text)
      if (skillMatch) {
        const result = await this.skills.execute(skillMatch.id, { query: text, chatId })
        if (result?.response) {
          return { success: true, command: `skill:${skillMatch.id}`, response: result.response, data: result }
        }
      }

      // Fallback to AI chat
      const aiResponse = await this.callAI([
        {
          role: 'system',
          content: `Eres Hermes, un asistente de inteligencia integrado con la plataforma Whatomate. Puedes analizar grupos de Telegram, buscar mensajes, generar reportes OSINT, y proporcionar insights. Tienes acceso a: Telethon (Telegram user API), Shadowbroker (OSINT), Cognitive API (conocimiento), DeerFlow (investigación profunda). Responde en español de forma concisa y útil. Si te piden algo que requiere datos específicos, sugiere usar los comandos disponibles.`,
        },
        { role: 'user', content: text },
      ])

      // Publish chat event
      this.eventBus.publish('whatomate:cognitive_updates', {
        type: 'hermes.chat',
        source: 'hermes-agent',
        timestamp: Date.now(),
        data: { query: text.substring(0, 200), chatId },
      })

      return { success: true, command: 'chat', response: aiResponse }
    } catch (error: any) {
      return {
        success: false,
        command: 'chat',
        error: error.message,
        response: `Lo siento, no pude procesar tu mensaje: ${error.message}`,
      }
    }
  }

  // ─── Ecosystem Health Check ──────────────────────────────────────────────

  async checkEcosystem(): Promise<Record<string, any>> {
    const services: Record<string, { url: string }> = {
      telethon: { url: TELETHON_URL },
      shadowbroker: { url: SHADOWBROKER_URL },
      cognitive: { url: COGNITIVE_URL },
      deerflow: { url: DEERFLOW_URL },
      whatsapp_bridge: { url: WHATSAPP_BRIDGE_URL },
    }

    const results: Record<string, any> = {}

    for (const [name, config] of Object.entries(services)) {
      try {
        const data = await this.fetchJSON(`${config.url}/health`, 'GET', null, 3000)
        results[name] = { reachable: true, status: data?.status || 'ok', version: data?.version }
      } catch {
        results[name] = { reachable: false }
      }
    }

    return results
  }

  // ─── OpenAI-compatible Chat Completions ──────────────────────────────────

  async chatCompletion(messages: any[], options: any = {}): Promise<any> {
    const response = await this.callAI(messages, options)
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

  // ─── MCP Tool Execution ─────────────────────────────────────────────────

  async executeMCPTool(tool: string, args: any): Promise<any> {
    return await this.tools.executeByName(tool, args)
  }

  // ─── Utility Methods ────────────────────────────────────────────────────

  private matchKeywords(text: string, keywords: string[]): boolean {
    return keywords.some(kw => text.includes(kw))
  }

  private async callAI(messages: any[], options: any = {}): Promise<string> {
    if (!OPENROUTER_KEY) {
      throw new Error('OPENROUTER_API_KEY not configured')
    }

    const resp = await fetch('https://openrouter.ai/api/v1/chat/completions', {
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

    if (!resp.ok) {
      const errBody = await resp.text().catch(() => '')
      throw new Error(`OpenRouter HTTP ${resp.status}: ${errBody.substring(0, 200)}`)
    }

    const result = await resp.json() as any
    return result?.choices?.[0]?.message?.content || 'Sin respuesta'
  }

  private async fetchJSON(url: string, method: string = 'GET', body: any = null, timeout: number = 30000): Promise<any> {
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
        throw new Error(`HTTP ${resp.status}: ${text.substring(0, 200)}`)
      }
      return await resp.json()
    } finally {
      clearTimeout(timer)
    }
  }
}
