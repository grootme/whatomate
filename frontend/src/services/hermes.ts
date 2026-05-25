import axios, { type AxiosInstance } from 'axios'

// Hermes Agent API Server (OpenAI-compatible) — default port 8642
// WhatsApp Baileys Bridge — default port 3001
// Hermes Dashboard API — default port 9119

const HERMES_API_BASE = import.meta.env.VITE_HERMES_API_URL || '/hermes-api'
const HERMES_BRIDGE_BASE = import.meta.env.VITE_HERMES_BRIDGE_URL || '/hermes-bridge'
const HERMES_DASHBOARD_BASE = import.meta.env.VITE_HERMES_DASHBOARD_URL || '/hermes-dashboard'

function createHermesClient(baseURL: string): AxiosInstance {
  const client = axios.create({ baseURL, timeout: 30000 })
  // Optional API key auth for Hermes
  client.interceptors.request.use((config) => {
    const apiKey = import.meta.env.VITE_HERMES_API_KEY
    if (apiKey) {
      config.headers.Authorization = `Bearer ${apiKey}`
    }
    return config
  })
  return client
}

// ─── API Server Client (port 8642) ──────────────────────────────────────────
const apiClient = createHermesClient(HERMES_API_BASE)

// ─── WhatsApp Bridge Client (port 3001) ─────────────────────────────────────
const bridgeClient = createHermesClient(HERMES_BRIDGE_BASE)

// ─── Dashboard Client (port 9119) ───────────────────────────────────────────
const dashboardClient = createHermesClient(HERMES_DASHBOARD_BASE)

// ─── Types ───────────────────────────────────────────────────────────────────

export interface HermesHealth {
  status: string
  platform: string
}

export interface HermesDetailedHealth {
  status: string
  platform: string
  gateway_state: string
  platforms: string[]
  pid: number
  uptime: number
}

export interface HermesModel {
  id: string
  object: string
  created: number
  owned_by: string
}

export interface HermesCapabilities {
  auth: { enabled: boolean; type: string }
  features: string[]
  runtime: { platform: string; version: string }
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string | ContentPart[]
}

export interface ContentPart {
  type: 'text' | 'image_url'
  text?: string
  image_url?: { url: string }
}

export interface ChatCompletionRequest {
  messages: ChatMessage[]
  model?: string
  temperature?: number
  max_tokens?: number
  stream?: boolean
  session_id?: string
  session_key?: string
}

export interface ChatCompletionChoice {
  index: number
  message: { role: string; content: string }
  finish_reason: string
}

export interface ChatCompletionResponse {
  id: string
  object: string
  choices: ChatCompletionChoice[]
  usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number }
}

export interface HermesRun {
  run_id: string
  status: 'pending' | 'running' | 'completed' | 'failed' | 'interrupted'
  created_at: string
  updated_at?: string
}

export interface HermesCronJob {
  id: string
  name: string
  schedule: string
  prompt: string
  platform: string
  enabled: boolean
  last_run?: string
  next_run?: string
}

// WhatsApp Bridge Types
export interface WhatsAppBridgeHealth {
  status: 'connected' | 'disconnected' | 'connecting'
  queueLength: number
  uptime: number
}

export interface WhatsAppMessage {
  key: { remoteJid: string; fromMe: boolean; id: string }
  message: { conversation?: string; [key: string]: any }
  pushName?: string
  messageTimestamp: number
}

export interface WhatsAppSendRequest {
  chatId: string
  message: string
  replyTo?: string
}

export interface WhatsAppChatInfo {
  name: string
  isGroup: boolean
  participants?: string[]
}

// Dashboard Types
export interface HermesSession {
  id: string
  session_key: string
  platform: string
  messages_count: number
  created_at: string
  updated_at: string
}

export interface HermesConfig {
  model: string
  provider: string
  base_url: string
  platforms: Record<string, any>
  [key: string]: any
}

// ─── API Server Service ─────────────────────────────────────────────────────

export const hermesApiService = {
  // Health
  health: () => apiClient.get<HermesHealth>('/health'),
  detailedHealth: () => apiClient.get<HermesDetailedHealth>('/health/detailed'),

  // Models
  listModels: () => apiClient.get<{ data: HermesModel[] }>('/v1/models'),
  capabilities: () => apiClient.get<HermesCapabilities>('/v1/capabilities'),

  // Chat Completions (OpenAI-compatible)
  chatCompletion: (req: ChatCompletionRequest) =>
    apiClient.post<ChatCompletionResponse>('/v1/chat/completions', req, {
      headers: {
        'Content-Type': 'application/json',
        ...(req.session_id ? { 'X-Hermes-Session-Id': req.session_id } : {}),
        ...(req.session_key ? { 'X-Hermes-Session-Key': req.session_key } : {}),
      },
    }),

  // Async Runs
  createRun: (req: ChatCompletionRequest) =>
    apiClient.post<HermesRun>('/v1/runs', req),
  getRun: (runId: string) =>
    apiClient.get<HermesRun>(`/v1/runs/${runId}`),
  getRunEvents: (runId: string) =>
    apiClient.get(`/v1/runs/${runId}/events`, { responseType: 'stream' }),
  approveRun: (runId: string, action: string) =>
    apiClient.post(`/v1/runs/${runId}/approval`, { action }),
  stopRun: (runId: string) =>
    apiClient.post(`/v1/runs/${runId}/stop`),

  // Cron Jobs
  listCronJobs: () => apiClient.get<{ jobs: HermesCronJob[] }>('/api/jobs'),
  createCronJob: (job: Partial<HermesCronJob>) =>
    apiClient.post<HermesCronJob>('/api/jobs', job),
  getCronJob: (jobId: string) =>
    apiClient.get<HermesCronJob>(`/api/jobs/${jobId}`),
  updateCronJob: (jobId: string, job: Partial<HermesCronJob>) =>
    apiClient.patch<HermesCronJob>(`/api/jobs/${jobId}`, job),
  deleteCronJob: (jobId: string) =>
    apiClient.delete(`/api/jobs/${jobId}`),
  pauseCronJob: (jobId: string) =>
    apiClient.post(`/api/jobs/${jobId}/pause`),
  resumeCronJob: (jobId: string) =>
    apiClient.post(`/api/jobs/${jobId}/resume`),
  triggerCronJob: (jobId: string) =>
    apiClient.post(`/api/jobs/${jobId}/run`),
}

// ─── WhatsApp Bridge Service ────────────────────────────────────────────────

export const hermesWhatsAppService = {
  // Health / Connection
  health: () => bridgeClient.get<WhatsAppBridgeHealth>('/health'),

  // QR Code — returns raw image
  getQR: () => bridgeClient.get('/qr', { responseType: 'arraybuffer' }),

  // Messages
  getMessages: () => bridgeClient.get<WhatsAppMessage[]>('/messages'),
  sendMessage: (req: WhatsAppSendRequest) =>
    bridgeClient.post('/send', req),
  sendMedia: (data: FormData) =>
    bridgeClient.post('/send-media', data, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }),
  sendTyping: (chatId: string) =>
    bridgeClient.post('/typing', { chatId }),
  editMessage: (chatId: string, messageId: string, message: string) =>
    bridgeClient.post('/edit', { chatId, messageId, message }),

  // Chat Info
  getChatInfo: (chatId: string) =>
    bridgeClient.get<WhatsAppChatInfo>(`/chat/${encodeURIComponent(chatId)}`),
}

// ─── Dashboard Service ──────────────────────────────────────────────────────

export const hermesDashboardService = {
  // Status
  getStatus: () => dashboardClient.get('/api/status'),

  // Sessions
  listSessions: (page = 1, limit = 20) =>
    dashboardClient.get<{ sessions: HermesSession[]; total: number }>('/api/sessions', {
      params: { page, limit },
    }),
  searchSessions: (query: string) =>
    dashboardClient.get<{ results: any[] }>('/api/sessions/search', {
      params: { q: query },
    }),

  // Configuration
  getConfig: () => dashboardClient.get<HermesConfig>('/api/config'),
  getConfigDefaults: () => dashboardClient.get('/api/config/defaults'),
  getConfigSchema: () => dashboardClient.get('/api/config/schema'),

  // Models
  getModelInfo: () => dashboardClient.get('/api/model/info'),
  getModelOptions: () => dashboardClient.get('/api/model/options'),
  setModel: (slot: string, model: string) =>
    dashboardClient.post('/api/model/set', { slot, model }),

  // Gateway
  restartGateway: () => dashboardClient.post('/api/gateway/restart'),
  updateHermes: () => dashboardClient.post('/api/hermes/update'),

  // Actions
  getActionStatus: (name: string) =>
    dashboardClient.get(`/api/actions/${name}/status`),
}

export default {
  api: hermesApiService,
  whatsapp: hermesWhatsAppService,
  dashboard: hermesDashboardService,
}
