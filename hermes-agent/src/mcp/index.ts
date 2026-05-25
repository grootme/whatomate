/**
 * MCP Bridge — Model Context Protocol integration for Hermes Agent.
 *
 * Exposes all ecosystem services as MCP tools that can be called
 * by any MCP-compatible AI assistant or external application.
 *
 * Two categories:
 *   1. Ecosystem tools — direct HTTP calls to services
 *   2. Agent tools — route through the AgentExecutor for AI-driven decomposition
 */

// MCP Tool definitions for the ecosystem
export const mcpTools = [
  // ─── Telegram / Telethon Tools ──────────────────────────────────────────
  {
    type: 'function' as const,
    function: {
      name: 'telegram_analyze_groups',
      description: 'Analiza todos los grupos de Telegram del usuario con IA',
      parameters: {
        type: 'object',
        properties: {
          deep: { type: 'boolean', description: 'Análisis profundo con IA' },
        },
      },
    },
    service: 'telethon',
    endpoint: 'POST /analyze',
  },
  {
    type: 'function' as const,
    function: {
      name: 'telegram_list_groups',
      description: 'Lista todos los grupos de Telegram con participantes',
      parameters: {
        type: 'object',
        properties: {
          include_channels: { type: 'boolean', description: 'Incluir canales' },
        },
      },
    },
    service: 'telethon',
    endpoint: 'GET /groups',
  },
  {
    type: 'function' as const,
    function: {
      name: 'telegram_search',
      description: 'Busca mensajes en todos los grupos de Telegram',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Término de búsqueda' },
          limit_per_group: { type: 'number', description: 'Resultados por grupo' },
        },
        required: ['query'],
      },
    },
    service: 'telethon',
    endpoint: 'POST /search',
  },
  {
    type: 'function' as const,
    function: {
      name: 'telegram_get_messages',
      description: 'Obtiene mensajes de un grupo específico',
      parameters: {
        type: 'object',
        properties: {
          chat_id: { type: 'number', description: 'ID del chat/grupo' },
          limit: { type: 'number', description: 'Cantidad de mensajes' },
        },
        required: ['chat_id'],
      },
    },
    service: 'telethon',
    endpoint: 'GET /groups/{chat_id}/messages',
  },
  {
    type: 'function' as const,
    function: {
      name: 'telegram_send_message',
      description: 'Envía un mensaje como usuario de Telegram',
      parameters: {
        type: 'object',
        properties: {
          chat_id: { type: 'number', description: 'ID del chat' },
          message: { type: 'string', description: 'Mensaje a enviar' },
        },
        required: ['chat_id', 'message'],
      },
    },
    service: 'telethon',
    endpoint: 'POST /send',
  },

  // ─── Shadowbroker Tools ─────────────────────────────────────────────────
  {
    type: 'function' as const,
    function: {
      name: 'shadowbroker_report',
      description: 'Genera un reporte de inteligencia OSINT completo',
      parameters: {
        type: 'object',
        properties: {
          type: { type: 'string', enum: ['threat', 'geospatial', 'anomaly', 'correlation', 'full'] },
        },
      },
    },
    service: 'shadowbroker',
    endpoint: 'POST /report',
  },
  {
    type: 'function' as const,
    function: {
      name: 'shadowbroker_threat',
      description: 'Obtiene la evaluación de amenazas actual',
      parameters: { type: 'object', properties: {} },
    },
    service: 'shadowbroker',
    endpoint: 'GET /threat-level',
  },
  {
    type: 'function' as const,
    function: {
      name: 'shadowbroker_events',
      description: 'Obtiene eventos de inteligencia recientes',
      parameters: {
        type: 'object',
        properties: {
          limit: { type: 'number', description: 'Cantidad de eventos' },
          severity: { type: 'string', enum: ['low', 'medium', 'high', 'critical'] },
        },
      },
    },
    service: 'shadowbroker',
    endpoint: 'GET /events',
  },
  {
    type: 'function' as const,
    function: {
      name: 'shadowbroker_analyze',
      description: 'Ejecuta análisis específico (threat/geospatial/anomaly/correlation)',
      parameters: {
        type: 'object',
        properties: {
          analysis_type: { type: 'string', enum: ['threat', 'geospatial', 'anomaly', 'correlation'] },
        },
        required: ['analysis_type'],
      },
    },
    service: 'shadowbroker',
    endpoint: 'POST /analyze',
  },
  {
    type: 'function' as const,
    function: {
      name: 'shadowbroker_dashboard',
      description: 'Dashboard completo: amenazas, alertas, eventos, estadísticas',
      parameters: { type: 'object', properties: {} },
    },
    service: 'shadowbroker',
    endpoint: 'GET /dashboard',
  },

  // ─── Cognitive API Tools ────────────────────────────────────────────────
  {
    type: 'function' as const,
    function: {
      name: 'cognitive_search',
      description: 'Busca en la base de conocimiento cognitiva',
      parameters: {
        type: 'object',
        properties: {
          q: { type: 'string', description: 'Consulta de búsqueda' },
        },
        required: ['q'],
      },
    },
    service: 'cognitive',
    endpoint: 'GET /search',
  },
  {
    type: 'function' as const,
    function: {
      name: 'cognitive_entities',
      description: 'Lista entidades en la base de conocimiento',
      parameters: {
        type: 'object',
        properties: {
          type: { type: 'string', description: 'Filtrar por tipo' },
          limit: { type: 'number', description: 'Cantidad' },
        },
      },
    },
    service: 'cognitive',
    endpoint: 'GET /entities',
  },
  {
    type: 'function' as const,
    function: {
      name: 'cognitive_decisions',
      description: 'Lista decisiones registradas',
      parameters: {
        type: 'object',
        properties: {
          limit: { type: 'number' },
        },
      },
    },
    service: 'cognitive',
    endpoint: 'GET /decisions',
  },

  // ─── WhatsApp Bridge Tools ──────────────────────────────────────────────
  {
    type: 'function' as const,
    function: {
      name: 'whatsapp_status',
      description: 'Obtiene el estado de la conexión WhatsApp',
      parameters: { type: 'object', properties: {} },
    },
    service: 'whatsapp_bridge',
    endpoint: 'GET /health',
  },
  {
    type: 'function' as const,
    function: {
      name: 'whatsapp_qr',
      description: 'Obtiene el código QR para vincular WhatsApp',
      parameters: { type: 'object', properties: {} },
    },
    service: 'whatsapp_bridge',
    endpoint: 'GET /qr',
  },

  // ─── Agent-Level Tools ──────────────────────────────────────────────────
  {
    type: 'function' as const,
    function: {
      name: 'agent_execute',
      description: 'Envía un prompt al agente Hermes para procesamiento inteligente. El agente descompone la solicitud y usa las herramientas necesarias.',
      parameters: {
        type: 'object',
        properties: {
          message: { type: 'string', description: 'Mensaje/prompt para el agente' },
        },
        required: ['message'],
      },
    },
    service: 'hermes',
    endpoint: 'POST /api/agent/execute',
  },
  {
    type: 'function' as const,
    function: {
      name: 'ecosystem_status',
      description: 'Obtiene el estado de todos los servicios del ecosistema',
      parameters: { type: 'object', properties: {} },
    },
    service: 'hermes',
    endpoint: 'GET /health',
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
  const tool = mcpTools.find(t => t.function.name === toolName)
  if (!tool) throw new Error(`MCP tool not found: ${toolName}`)

  const baseUrl = serviceUrls[tool.service]
  if (!baseUrl) throw new Error(`Unknown service: ${tool.service}`)

  // Build URL with path params
  let endpoint = (tool as any).endpoint || ''
  for (const [key, value] of Object.entries(args)) {
    endpoint = endpoint.replace(`{${key}}`, String(value))
  }

  // Determine method from endpoint prefix
  const method = endpoint.startsWith('POST') ? 'POST' : 'GET'
  // Clean the endpoint to just the path
  const path = endpoint.replace(/^(GET|POST)\s+/, '')

  const url = `${baseUrl}${path}`

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
