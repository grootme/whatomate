/**
 * Go Backend Intelligence Tools
 * 10 tools for interacting with the Go backend intelligence API.
 *
 * These tools connect the Hermes agent to the core Go backend,
 * enabling intelligence operations, message ingestion, and report generation.
 */

import { ToolDefinition } from '../registry.js'

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:8080'

async function fetchJSON(url: string, method: string = 'GET', body: any = null, timeout: number = 8000): Promise<any> {
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

export const backendTools: ToolDefinition[] = [
  {
    name: 'intel_dashboard',
    description: 'Obtiene los datos del dashboard de inteligencia: nivel de amenaza, alertas activas, entidades monitoreadas, patrones detectados, estados de agentes. Vista general del sistema de inteligencia.',
    category: 'intelligence',
    parameters: {
      type: 'object',
      properties: {},
    },
    execute: async () => {
      return await fetchJSON(`${BACKEND_URL}/api/intel/dashboard`)
    },
  },
  {
    name: 'intel_threat_level',
    description: 'Obtiene la evaluación actual del nivel de amenaza: score, nivel (LOW/BAJA/MEDIA/ALTA/CRÍTICA), alertas activas, patrones activos, entidades de alto riesgo.',
    category: 'intelligence',
    parameters: {
      type: 'object',
      properties: {},
    },
    execute: async () => {
      return await fetchJSON(`${BACKEND_URL}/api/intel/threat-level`)
    },
  },
  {
    name: 'intel_ingest_message',
    description: 'Ingresa un mensaje al pipeline de inteligencia desde cualquier fuente (whatsapp, telegram, osint). El mensaje será analizado automáticamente por el motor de inteligencia.',
    category: 'intelligence',
    parameters: {
      type: 'object',
      properties: {
        source: {
          type: 'string',
          description: 'Origen del mensaje: whatsapp, telegram, osint',
          enum: ['whatsapp', 'telegram', 'osint'],
        },
        sourceId: {
          type: 'string',
          description: 'ID único del mensaje en su fuente original',
        },
        channelName: {
          type: 'string',
          description: 'Nombre del canal/grupo de origen',
        },
        channelId: {
          type: 'string',
          description: 'ID del canal/grupo de origen',
        },
        senderName: {
          type: 'string',
          description: 'Nombre del remitente',
        },
        content: {
          type: 'string',
          description: 'Contenido del mensaje',
        },
      },
      required: ['source', 'content'],
    },
    execute: async (params) => {
      const endpoint = params.source === 'whatsapp'
        ? '/api/intel/ingestion/whatsapp'
        : params.source === 'telegram'
        ? '/api/intel/ingestion/telegram'
        : '/api/intel/ingestion/osint'
      return await fetchJSON(`${BACKEND_URL}${endpoint}`, 'POST', params)
    },
  },
  {
    name: 'intel_alerts',
    description: 'Obtiene las alertas recientes del sistema de inteligencia. Incluye alertas por umbrales, patrones, riesgo, consenso y predicción.',
    category: 'intelligence',
    parameters: {
      type: 'object',
      properties: {
        limit: {
          type: 'number',
          description: 'Número máximo de alertas a retornar (default: 20)',
        },
      },
    },
    execute: async (params) => {
      const limit = params.limit || 20
      return await fetchJSON(`${BACKEND_URL}/api/intel/alerts?limit=${limit}`)
    },
  },
  {
    name: 'intel_strategies',
    description: 'Obtiene el estado de las 6 estrategias de decisión: Umbrales (Reactiva), Patrones (Deductiva), Scoring de Riesgo (Cuantitativa), Consenso Multi-Agente, Predictiva (Proactiva), Adaptativa (Evolución).',
    category: 'intelligence',
    parameters: {
      type: 'object',
      properties: {},
    },
    execute: async () => {
      return await fetchJSON(`${BACKEND_URL}/api/intel/strategies`)
    },
  },
  {
    name: 'intel_generate_report',
    description: 'Genera un reporte de inteligencia del tipo especificado. Tipos: threat_summary (resumen de amenazas), risk_analysis (análisis de riesgo), pattern_report (reporte de patrones), full_intelligence (reporte completo).',
    category: 'intelligence',
    parameters: {
      type: 'object',
      properties: {
        type: {
          type: 'string',
          description: 'Tipo de reporte: threat_summary, risk_analysis, pattern_report, full_intelligence',
          enum: ['threat_summary', 'risk_analysis', 'pattern_report', 'full_intelligence'],
        },
      },
      required: ['type'],
    },
    execute: async (params) => {
      return await fetchJSON(`${BACKEND_URL}/api/intel/reports/generate`, 'POST', {
        type: params.type || 'threat_summary',
      })
    },
  },
  {
    name: 'intel_entities',
    description: 'Obtiene las entidades rastreadas por el motor de inteligencia: personas, organizaciones, ubicaciones, wallets crypto. Incluye scores de riesgo y menciones.',
    category: 'intelligence',
    parameters: {
      type: 'object',
      properties: {},
    },
    execute: async () => {
      return await fetchJSON(`${BACKEND_URL}/api/intel/entities`)
    },
  },
  {
    name: 'intel_osint_feed',
    description: 'Obtiene el feed de datos OSINT en tiempo real: terremotos, vuelos militares, incendios, clima, noticias, GPS jamming, UAVs, conflictos, SIGINT.',
    category: 'intelligence',
    parameters: {
      type: 'object',
      properties: {},
    },
    execute: async () => {
      return await fetchJSON(`${BACKEND_URL}/api/intel/threat-feed`)
    },
  },
  {
    name: 'intel_run_scheduler',
    description: 'Ejecuta manualmente el pipeline de inteligencia: ingesta OSINT, análisis de mensajes, evaluación de estrategias. Útil para forzar una actualización.',
    category: 'intelligence',
    parameters: {
      type: 'object',
      properties: {},
    },
    execute: async () => {
      return await fetchJSON(`${BACKEND_URL}/api/intel/scheduler/run`, 'POST', {})
    },
  },
  {
    name: 'intel_anomalies',
    description: 'Obtiene las anomalías detectadas: breaches de umbrales, patrones activos, spikes de actividad.',
    category: 'intelligence',
    parameters: {
      type: 'object',
      properties: {},
    },
    execute: async () => {
      return await fetchJSON(`${BACKEND_URL}/api/intel/anomalies`)
    },
  },
]
