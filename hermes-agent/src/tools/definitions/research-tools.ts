/**
 * Research Tools
 * 1 tool for deep research via the DeerFlow service.
 */

import { ToolDefinition } from '../registry.js'

const DEERFLOW_URL = process.env.DEERFLOW_URL || 'http://localhost:8000'

async function fetchJSON(url: string, method: string = 'GET', body: any = null, timeout: number = 120000): Promise<any> {
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

export const researchTools: ToolDefinition[] = [
  {
    name: 'deerflow_research',
    description: 'Realiza una investigación profunda sobre un tema usando DeerFlow. Genera un reporte detallado con múltiples fuentes, análisis y conclusiones. Útil cuando el usuario pide investigar un tema en profundidad, generar un reporte de investigación, o necesita información detallada.',
    category: 'research',
    parameters: {
      type: 'object',
      properties: {
        topic: {
          type: 'string',
          description: 'Tema a investigar en profundidad',
        },
        depth: {
          type: 'string',
          enum: ['standard', 'deep'],
          description: 'Profundidad de la investigación: standard (rápido) o deep (exhaustivo)',
          default: 'standard',
        },
      },
      required: ['topic'],
    },
    execute: async (params) => {
      return await fetchJSON(`${DEERFLOW_URL}/api/research`, 'POST', {
        topic: params.topic,
        depth: params.depth || 'standard',
      })
    },
  },
]
