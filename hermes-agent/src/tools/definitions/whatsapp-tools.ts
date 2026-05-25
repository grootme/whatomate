/**
 * WhatsApp Bridge Tools
 * 3 tools for WhatsApp interaction via the WhatsApp Bridge service.
 */

import { ToolDefinition } from '../registry.js'

const WHATSAPP_BRIDGE_URL = process.env.WHATSAPP_BRIDGE_URL || 'http://localhost:3001'

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

export const whatsappTools: ToolDefinition[] = [
  {
    name: 'whatsapp_status',
    description: 'Obtiene el estado de la conexión de WhatsApp Bridge. Muestra si WhatsApp está conectado, el número vinculado y estado general.',
    category: 'whatsapp',
    parameters: {
      type: 'object',
      properties: {},
    },
    execute: async () => {
      return await fetchJSON(`${WHATSAPP_BRIDGE_URL}/health`, 'GET')
    },
  },
  {
    name: 'whatsapp_qr',
    description: 'Obtiene el código QR para vincular WhatsApp al bridge. Útil cuando el usuario necesita conectar su WhatsApp o el bridge no está vinculado.',
    category: 'whatsapp',
    parameters: {
      type: 'object',
      properties: {},
    },
    execute: async () => {
      return await fetchJSON(`${WHATSAPP_BRIDGE_URL}/qr`, 'GET')
    },
  },
  {
    name: 'whatsapp_send_message',
    description: 'Envía un mensaje de WhatsApp a un contacto o grupo. Requiere el JID del destino (número@s.whatsapp.net o grupo@g.us).',
    category: 'whatsapp',
    parameters: {
      type: 'object',
      properties: {
        jid: {
          type: 'string',
          description: 'JID del destino (número@s.whatsapp.net para contacto, grupo@g.us para grupo)',
        },
        message: {
          type: 'string',
          description: 'Texto del mensaje a enviar',
        },
      },
      required: ['jid', 'message'],
    },
    execute: async (params) => {
      return await fetchJSON(`${WHATSAPP_BRIDGE_URL}/api/send`, 'POST', {
        jid: params.jid,
        message: params.message,
      })
    },
  },
]
