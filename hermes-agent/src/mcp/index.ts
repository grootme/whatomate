/**
 * MCP Bridge — Model Context Protocol integration for Hermes Agent.
 * Allows external AI models to interact with the Whatomate ecosystem
 * through the MCP protocol.
 *
 * Exposes all ecosystem services as MCP tools that can be called
 * by any MCP-compatible AI assistant.
 */

// MCP Tool definitions for the ecosystem
export const mcpTools = [
  // ─── Telegram / Telethon Tools ──────────────────────────────────────────
  {
    name: 'telegram_analyze_groups',
    description: 'Analiza todos los grupos de Telegram del usuario con IA',
    inputSchema: {
      type: 'object',
      properties: {
        deep: { type: 'boolean', description: 'Análisis profundo con IA' },
      },
    },
    endpoint: 'POST /analyze',
    service: 'telethon',
  },
  {
    name: 'telegram_list_groups',
    description: 'Lista todos los grupos de Telegram',
    inputSchema: {
      type: 'object',
      properties: {
        include_channels: { type: 'boolean', description: 'Incluir canales' },
      },
    },
    endpoint: 'GET /groups',
    service: 'telethon',
  },
  {
    name: 'telegram_search',
    description: 'Busca mensajes en todos los grupos de Telegram',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Término de búsqueda' },
        limit_per_group: { type: 'number', description: 'Resultados por grupo' },
      },
      required: ['query'],
    },
    endpoint: 'POST /search',
    service: 'telethon',
  },
  {
    name: 'telegram_get_messages',
    description: 'Obtiene mensajes de un grupo específico',
    inputSchema: {
      type: 'object',
      properties: {
        chat_id: { type: 'number', description: 'ID del chat/grupo' },
        limit: { type: 'number', description: 'Cantidad de mensajes' },
      },
      required: ['chat_id'],
    },
    endpoint: 'GET /groups/{chat_id}/messages',
    service: 'telethon',
  },
  {
    name: 'telegram_send_message',
    description: 'Envía un mensaje como usuario de Telegram',
    inputSchema: {
      type: 'object',
      properties: {
        chat_id: { type: 'number', description: 'ID del chat' },
        message: { type: 'string', description: 'Mensaje a enviar' },
      },
      required: ['chat_id', 'message'],
    },
    endpoint: 'POST /send',
    service: 'telethon',
  },

  // ─── Shadowbroker Tools ─────────────────────────────────────────────────
  {
    name: 'shadowbroker_threat_report',
    description: 'Obtiene la evaluación de amenazas actual de Shadowbroker',
    inputSchema: { type: 'object', properties: {} },
    endpoint: 'GET /api/threats/latest',
    service: 'shadowbroker',
  },
  {
    name: 'shadowbroker_intel_report',
    description: 'Genera un reporte de inteligencia OSINT',
    inputSchema: {
      type: 'object',
      properties: {
        type: { type: 'string', enum: ['threat', 'geospatial', 'anomaly', 'correlation', 'full'] },
      },
    },
    endpoint: 'GET /api/ai/report',
    service: 'shadowbroker',
  },
  {
    name: 'shadowbroker_events',
    description: 'Obtiene eventos de inteligencia recientes',
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'number', description: 'Cantidad de eventos' },
        severity: { type: 'string', enum: ['low', 'medium', 'high', 'critical'] },
      },
    },
    endpoint: 'GET /api/events',
    service: 'shadowbroker',
  },

  // ─── Cognitive API Tools ────────────────────────────────────────────────
  {
    name: 'cognitive_search',
    description: 'Busca en la base de conocimiento cognitiva',
    inputSchema: {
      type: 'object',
      properties: {
        q: { type: 'string', description: 'Consulta de búsqueda' },
      },
      required: ['q'],
    },
    endpoint: 'GET /search',
    service: 'cognitive',
  },
  {
    name: 'cognitive_entities',
    description: 'Lista entidades en la base de conocimiento',
    inputSchema: {
      type: 'object',
      properties: {
        type: { type: 'string', description: 'Filtrar por tipo' },
        limit: { type: 'number', description: 'Cantidad' },
      },
    },
    endpoint: 'GET /entities',
    service: 'cognitive',
  },
  {
    name: 'cognitive_decisions',
    description: 'Lista decisiones registradas',
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'number' },
      },
    },
    endpoint: 'GET /decisions',
    service: 'cognitive',
  },

  // ─── DeerFlow Tools ─────────────────────────────────────────────────────
  {
    name: 'deerflow_research',
    description: 'Inicia una investigación profunda sobre un tema',
    inputSchema: {
      type: 'object',
      properties: {
        topic: { type: 'string', description: 'Tema a investigar' },
        depth: { type: 'string', enum: ['quick', 'standard', 'deep'] },
      },
      required: ['topic'],
    },
    endpoint: 'POST /api/research',
    service: 'deerflow',
  },

  // ─── WhatsApp Bridge Tools ──────────────────────────────────────────────
  {
    name: 'whatsapp_status',
    description: 'Obtiene el estado de la conexión WhatsApp',
    inputSchema: { type: 'object', properties: {} },
    endpoint: 'GET /health',
    service: 'whatsapp_bridge',
  },
  {
    name: 'whatsapp_qr',
    description: 'Obtiene el código QR para vincular WhatsApp',
    inputSchema: { type: 'object', properties: {} },
    endpoint: 'GET /qr',
    service: 'whatsapp_bridge',
  },

  // ─── System Tools ───────────────────────────────────────────────────────
  {
    name: 'ecosystem_status',
    description: 'Obtiene el estado de todos los servicios del ecosistema',
    inputSchema: { type: 'object', properties: {} },
    endpoint: 'GET /health',
    service: 'hermes',
  },
  {
    name: 'hermes_chat',
    description: 'Chat con la IA de Hermes',
    inputSchema: {
      type: 'object',
      properties: {
        message: { type: 'string', description: 'Mensaje para Hermes' },
      },
      required: ['message'],
    },
    endpoint: 'POST /api/command',
    service: 'hermes',
  },
]

// Service URL mapping
const serviceUrls: Record<string, string> = {
  telethon: process.env.TELETHON_URL || 'http://localhost:8700',
  shadowbroker: process.env.SHADOWBROKER_URL || 'http://localhost:8660',
  cognitive: process.env.COGNITIVE_URL || 'http://localhost:8645',
  deerflow: process.env.DEERFLOW_URL || 'http://localhost:8000',
  whatsapp_bridge: process.env.WHATSAPP_BRIDGE_URL || 'http://localhost:3001',
  hermes: `http://localhost:${process.env.HERMES_PORT || '8642'}`,
}

/**
 * Execute an MCP tool by name
 */
export async function executeMCPTool(toolName: string, args: Record<string, any> = {}): Promise<any> {
  const tool = mcpTools.find(t => t.name === toolName)
  if (!tool) throw new Error(`MCP tool not found: ${toolName}`)

  const baseUrl = serviceUrls[tool.service]
  if (!baseUrl) throw new Error(`Unknown service: ${tool.service}`)

  // Build URL with path params
  let endpoint = tool.endpoint
  for (const [key, value] of Object.entries(args)) {
    endpoint = endpoint.replace(`{${key}}`, String(value))
  }

  const url = `${baseUrl}${endpoint}`

  // Determine method
  const method = tool.endpoint.startsWith('POST') ? 'POST' : 'GET'

  try {
    const options: RequestInit = {
      method,
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(30000),
    }

    if (method === 'POST' && Object.keys(args).length > 0) {
      options.body = JSON.stringify(args)
    }

    const resp = await fetch(url, options)
    if (!resp.ok) {
      const text = await resp.text().catch(() => '')
      throw new Error(`HTTP ${resp.status}: ${text.substring(0, 200)}`)
    }

    return await resp.json()
  } catch (error: any) {
    throw new Error(`MCP tool ${toolName} failed: ${error.message}`)
  }
}
