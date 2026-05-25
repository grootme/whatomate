/**
 * Shadowbroker OSINT Tools
 * 5 tools for intelligence analysis via the Shadowbroker service.
 */

import { ToolDefinition } from '../registry.js'

const SHADOWBROKER_URL = process.env.SHADOWBROKER_URL || 'http://localhost:8660'

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

export const shadowbrokerTools: ToolDefinition[] = [
  {
    name: 'shadowbroker_report',
    description: 'Genera un reporte de inteligencia OSINT completo usando Shadowbroker. Incluye evaluación de amenazas, análisis geoespacial, eventos recientes y recomendaciones. Útil cuando el usuario pide un reporte de inteligencia, situación OSINT, o estado de amenazas.',
    category: 'osint',
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
    execute: async (params) => {
      const reportType = params.report_type || 'threat'
      try {
        return await fetchJSON(`${SHADOWBROKER_URL}/report`, 'POST', {})
      } catch (e1) {
        try {
          return await fetchJSON(`${SHADOWBROKER_URL}/analyze`, 'POST', {
            type: reportType === 'full' ? 'report' : reportType,
          })
        } catch (e2) {
          try {
            // Try getting data directly from OSINT backend
            return await fetchJSON('http://localhost:8000/api/ai/report', 'GET')
          } catch (e3) {
            throw new Error(`Shadowbroker report failed: ${e1 instanceof Error ? e1.message : String(e1)}`)
          }
        }
      }
    },
  },
  {
    name: 'shadowbroker_threat',
    description: 'Obtiene la evaluación actual de amenazas OSINT de Shadowbroker. Retorna el nivel de amenaza, detalles y recomendaciones. Útil para consultas rápidas sobre la situación de amenazas.',
    category: 'osint',
    parameters: {
      type: 'object',
      properties: {},
    },
    execute: async () => {
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
  },
  {
    name: 'shadowbroker_events',
    description: 'Obtiene eventos de inteligencia OSINT recientes de Shadowbroker. Se puede filtrar por severidad.',
    category: 'osint',
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
    execute: async (params) => {
      const searchParams = new URLSearchParams()
      if (params.limit) searchParams.set('limit', String(params.limit))
      if (params.severity) searchParams.set('severity', params.severity)
      const qs = searchParams.toString()
      try {
        return await fetchJSON(`${SHADOWBROKER_URL}/events${qs ? '?' + qs : ''}`, 'GET')
      } catch {
        return await fetchJSON(`${SHADOWBROKER_URL}/api/events${qs ? '?' + qs : ''}`, 'GET')
      }
    },
  },
  {
    name: 'shadowbroker_analyze',
    description: 'Ejecuta un análisis específico en los datos OSINT de Shadowbroker: panorama de amenazas, anomalías, correlaciones, o eventos geoespaciales.',
    category: 'osint',
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
    execute: async (params) => {
      return await fetchJSON(`${SHADOWBROKER_URL}/analyze`, 'POST', {
        type: params.analysis_type,
      })
    },
  },
  {
    name: 'shadowbroker_dashboard',
    description: 'Obtiene el dashboard completo de Shadowbroker: amenazas, alertas, estadísticas, eventos recientes. Útil para dar un resumen rápido del estado de inteligencia.',
    category: 'osint',
    parameters: {
      type: 'object',
      properties: {},
    },
    execute: async () => {
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
  },
]
