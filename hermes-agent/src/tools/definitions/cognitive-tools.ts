/**
 * Cognitive API Tools
 * 3 tools for knowledge base access via the Cognitive API.
 */

import { ToolDefinition } from '../registry.js'

const COGNITIVE_URL = process.env.COGNITIVE_URL || 'http://localhost:8645'

async function fetchJSON(url: string, method: string = 'GET', body: any = null, timeout: number = 15000): Promise<any> {
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

export const cognitiveTools: ToolDefinition[] = [
  {
    name: 'cognitive_search',
    description: 'Busca en la base de conocimiento cognitiva (memoria del sistema). Incluye entidades, decisiones, patrones y mensajes previamente analizados.',
    category: 'cognitive',
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
    execute: async (params) => {
      return await fetchJSON(`${COGNITIVE_URL}/search?q=${encodeURIComponent(params.query)}`, 'GET')
    },
  },
  {
    name: 'cognitive_entities',
    description: 'Lista las entidades almacenadas en la base de conocimiento cognitiva. Se puede filtrar por tipo (persona, organización, evento, etc).',
    category: 'cognitive',
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
    execute: async (params) => {
      const searchParams = new URLSearchParams()
      if (params.type) searchParams.set('type', params.type)
      if (params.limit) searchParams.set('limit', String(params.limit))
      const qs = searchParams.toString()
      return await fetchJSON(`${COGNITIVE_URL}/entities${qs ? '?' + qs : ''}`, 'GET')
    },
  },
  {
    name: 'cognitive_decisions',
    description: 'Lista las decisiones registradas en la base de conocimiento cognitiva. Útil para revisar decisiones previas del sistema o del usuario.',
    category: 'cognitive',
    parameters: {
      type: 'object',
      properties: {
        limit: {
          type: 'number',
          description: 'Cantidad máxima de decisiones',
          default: 20,
        },
      },
    },
    execute: async (params) => {
      const searchParams = new URLSearchParams()
      if (params.limit) searchParams.set('limit', String(params.limit))
      const qs = searchParams.toString()
      return await fetchJSON(`${COGNITIVE_URL}/decisions${qs ? '?' + qs : ''}`, 'GET')
    },
  },
]
