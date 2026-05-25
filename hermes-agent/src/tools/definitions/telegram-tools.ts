/**
 * Telegram / Telethon Tools
 * 5 tools for interacting with Telegram via the Telethon service.
 */

import { ToolDefinition } from '../registry.js'

const TELETHON_URL = process.env.TELETHON_URL || 'http://localhost:8700'

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

export const telegramTools: ToolDefinition[] = [
  {
    name: 'telegram_list_groups',
    description: 'Lista todos los grupos y canales de Telegram del usuario. Incluye nombre, tipo, participantes y mensajes sin leer. Usa esta herramienta cuando el usuario quiera ver sus grupos.',
    category: 'telegram',
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
    execute: async (params) => {
      return await fetchJSON(`${TELETHON_URL}/groups`, 'GET')
    },
  },
  {
    name: 'telegram_analyze_groups',
    description: 'Analiza en profundidad todos los grupos de Telegram del usuario. Recopila datos de cada grupo, estadísticas, actividad, y genera un análisis con IA. Útil cuando el usuario pide analizar sus grupos o quiere un resumen de actividad.',
    category: 'telegram',
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
    execute: async (params) => {
      return await fetchJSON(`${TELETHON_URL}/analyze`, 'POST', {
        deep: params.deep ?? true,
        group_ids: params.group_ids || [],
      })
    },
  },
  {
    name: 'telegram_search',
    description: 'Busca mensajes en todos los grupos de Telegram del usuario. Retorna los mensajes que contienen el término de búsqueda con contexto del grupo.',
    category: 'telegram',
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
    execute: async (params) => {
      return await fetchJSON(`${TELETHON_URL}/search`, 'POST', {
        query: params.query,
        limit_per_group: params.limit_per_group ?? 5,
      })
    },
  },
  {
    name: 'telegram_get_messages',
    description: 'Obtiene los mensajes recientes de un grupo específico de Telegram. Útil para ver la conversación actual de un grupo.',
    category: 'telegram',
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
    execute: async (params) => {
      return await fetchJSON(`${TELETHON_URL}/groups/${params.chat_id}/messages?limit=${params.limit || 20}`, 'GET')
    },
  },
  {
    name: 'telegram_send_message',
    description: 'Envía un mensaje a un grupo o chat de Telegram como el usuario. Útil cuando el usuario quiere responder o enviar un mensaje.',
    category: 'telegram',
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
    execute: async (params) => {
      return await fetchJSON(`${TELETHON_URL}/send`, 'POST', {
        chat_id: params.chat_id,
        message: params.message,
      })
    },
  },
]
