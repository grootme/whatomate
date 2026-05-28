/**
 * System Tools
 * 2 tools for ecosystem monitoring and agent delegation.
 */

import { ToolDefinition } from '../registry.js'

const TELETHON_URL = process.env.TELETHON_URL || 'http://localhost:8700'
const SHADOWBROKER_URL = process.env.SHADOWBROKER_URL || 'http://localhost:8660'
const COGNITIVE_URL = process.env.COGNITIVE_URL || 'http://localhost:8645'
const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:8080'
const OSINT_URL = process.env.OSINT_URL || 'http://localhost:8000'
const WHATSAPP_BRIDGE_URL = process.env.WHATSAPP_BRIDGE_URL || 'http://localhost:3001'

async function fetchJSON(url: string, method: string = 'GET', body: any = null, timeout: number = 5000): Promise<any> {
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

export const systemTools: ToolDefinition[] = [
  {
    name: 'ecosystem_status',
    description: 'Obtiene el estado de todos los servicios del ecosistema Whatomate: Telethon, Shadowbroker, Cognitive API, WhatsApp Bridge, Go Backend, Go Intelligence Engine, OSINT Direct. Útil para diagnosticar problemas o verificar que todo está funcionando.',
    category: 'system',
    parameters: {
      type: 'object',
      properties: {},
    },
    execute: async () => {
      const services = [
        { name: 'Telethon', url: `${TELETHON_URL}/health` },
        { name: 'Shadowbroker', url: `${SHADOWBROKER_URL}/health` },
        { name: 'Cognitive API', url: `${COGNITIVE_URL}/health` },
        { name: 'WhatsApp Bridge', url: `${WHATSAPP_BRIDGE_URL}/health` },
        { name: 'Go Backend', url: `${BACKEND_URL}/health` },
        { name: 'Go Intelligence Engine', url: `${BACKEND_URL}/api/intel/dashboard` },
        { name: 'OSINT Direct', url: `${OSINT_URL}/health` },
      ]

      const results: Record<string, any> = {}
      const checks = await Promise.allSettled(
        services.map(async (svc) => {
          try {
            const data = await fetchJSON(svc.url, 'GET', null, 3000)
            return { name: svc.name, reachable: true, status: data?.status || 'ok', version: data?.version }
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
  },
  {
    name: 'agent_execute',
    description: 'Envía un prompt al agente Hermes para procesamiento inteligente con IA. El agente descompone la solicitud y usa las herramientas necesarias automáticamente. Útil como meta-herramienta para delegar tareas complejas al agente.',
    category: 'system',
    parameters: {
      type: 'object',
      properties: {
        message: {
          type: 'string',
          description: 'Mensaje/prompt para el agente',
        },
      },
      required: ['message'],
    },
    execute: async (params) => {
      // This is a meta-tool — it delegates back to the agent executor.
      // The actual execution is handled in agent-executor.ts which checks for this tool name.
      // When called via MCP or API, it will route through the agent.
      const hermesUrl = `http://localhost:${process.env.HERMES_PORT || '8642'}`
      return await fetchJSON(`${hermesUrl}/api/agent/execute`, 'POST', {
        message: params.message,
      })
    },
  },
]
