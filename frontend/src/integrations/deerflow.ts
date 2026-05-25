/**
 * Whatomate Integration Layer — DeerFlow + Hermes Agent
 *
 * This module provides the integration between Whatomate (WhatsApp service)
 * and the shared DeerFlow + Hermes Agent platform.
 *
 * Architecture:
 *   Whatomate <-> Hermes Agent <-> Shadowbroker
 *   Whatomate <-> DeerFlow      <-> Shadowbroker
 *
 * Whatomate NEVER directly communicates with Shadowbroker.
 * All cross-service communication goes through DeerFlow or Hermes Agent.
 */

import axios, { type AxiosInstance } from 'axios'

// ─── Configuration ───────────────────────────────────────────────────────────

const DEERFLOW_BASE = import.meta.env.VITE_DEERFLOW_URL || '/deerflow-api'
const HERMES_API_BASE = import.meta.env.VITE_HERMES_API_URL || '/hermes-api'
const HERMES_BRIDGE_BASE = import.meta.env.VITE_HERMES_BRIDGE_URL || '/hermes-bridge'
const SHADOWBROKER_BASE = import.meta.env.VITE_SHADOWBROKER_URL || '/sb-api'

// ─── HTTP Clients ────────────────────────────────────────────────────────────

function createClient(baseURL: string): AxiosInstance {
  return axios.create({ baseURL, timeout: 30000 })
}

const deerflowClient = createClient(DEERFLOW_BASE)
const hermesApiClient = createClient(HERMES_API_BASE)
const hermesBridgeClient = createClient(HERMES_BRIDGE_BASE)
const sbClient = createClient(SHADOWBROKER_BASE)

// ─── Types ───────────────────────────────────────────────────────────────────

export interface IntegrationHealth {
  deerflow: { reachable: boolean; url: string }
  hermes_api: { reachable: boolean; url: string }
  hermes_bridge: { reachable: boolean; url: string }
  shadowbroker: { reachable: boolean; url: string }
}

export interface DeerFlowThread {
  thread_id: string
  title?: string
  status: 'idle' | 'busy' | 'error'
  metadata: Record<string, any>
  created_at: string
}

export interface DeerFlowMessage {
  id: string
  role: 'user' | 'assistant' | 'system' | 'tool'
  content: string
  created_at?: string
}

export interface HermesChatRequest {
  messages: { role: string; content: string }[]
  model?: string
  temperature?: number
  max_tokens?: number
  session_id?: string
}

export interface ShadowbrokerAlert {
  id: number
  severity: 'critical' | 'high' | 'medium' | 'low'
  title: string
  message: string
  hermes_dispatched: boolean
  created_at: string
}

export interface ShadowbrokerThreatLevel {
  level: string
  category: string
  confidence: number
  assessed_at: string
}

// ─── Integration Health Check ────────────────────────────────────────────────

export async function checkIntegrationHealth(): Promise<IntegrationHealth> {
  const results = await Promise.allSettled([
    deerflowClient.get('/health'),
    hermesApiClient.get('/health'),
    hermesBridgeClient.get('/health'),
    sbClient.get('/health'),
  ])

  return {
    deerflow: { reachable: results[0].status === 'fulfilled', url: DEERFLOW_BASE },
    hermes_api: { reachable: results[1].status === 'fulfilled', url: HERMES_API_BASE },
    hermes_bridge: { reachable: results[2].status === 'fulfilled', url: HERMES_BRIDGE_BASE },
    shadowbroker: { reachable: results[3].status === 'fulfilled', url: SHADOWBROKER_BASE },
  }
}

// ─── DeerFlow Integration ────────────────────────────────────────────────────

export const deerflowIntegration = {
  /**
   * Check DeerFlow health
   */
  health: () => deerflowClient.get('/health'),

  /**
   * Create a research thread for analysis
   */
  createThread: (metadata?: Record<string, any>) =>
    deerflowClient.post<DeerFlowThread>('/api/threads', {
      metadata: { source: 'whatomate', ...metadata },
    }),

  /**
   * Run a research analysis on a thread
   */
  runResearch: (threadId: string, message: string, options?: {
    subagent_enabled?: boolean
    thinking_enabled?: boolean
  }) =>
    deerflowClient.post(`/api/threads/${threadId}/runs`, {
      assistant_id: 'lead_agent',
      input: {
        messages: [{ id: crypto.randomUUID(), role: 'user', content: message }],
      },
      config: {
        configurable: {
          subagent_enabled: options?.subagent_enabled ?? true,
          thinking_enabled: options?.thinking_enabled ?? false,
        },
      },
      stream_mode: ['values', 'messages-tuple', 'custom'],
    }),

  /**
   * List research threads
   */
  listThreads: (limit = 20) =>
    deerflowClient.post<DeerFlowThread[]>('/api/threads/search', { limit, offset: 0 }),

  /**
   * Get thread messages
   */
  getThreadMessages: (threadId: string) =>
    deerflowClient.get<{ messages: DeerFlowMessage[] }>(`/api/threads/${threadId}/messages`),

  /**
   * Store a fact in DeerFlow's memory (shared across all services)
   */
  createFact: (content: string) =>
    deerflowClient.post('/api/memory/facts', { content }),

  /**
   * Get DeerFlow memory
   */
  getMemory: () => deerflowClient.get('/api/memory'),

  /**
   * List available DeerFlow skills
   */
  listSkills: () => deerflowClient.get('/api/skills'),
}

// ─── Hermes Agent Integration ────────────────────────────────────────────────

export const hermesIntegration = {
  /**
   * Check Hermes API health
   */
  apiHealth: () => hermesApiClient.get('/health'),

  /**
   * Check Hermes Bridge health
   */
  bridgeHealth: () => hermesBridgeClient.get('/health'),

  /**
   * Chat completion via Hermes (OpenAI-compatible)
   */
  chatCompletion: (request: HermesChatRequest) =>
    hermesApiClient.post('/v1/chat/completions', request),

  /**
   * Get QR code for WhatsApp pairing
   */
  getQR: () => hermesBridgeClient.get('/qr', { responseType: 'arraybuffer' }),

  /**
   * Send a WhatsApp message via the bridge
   */
  sendMessage: (chatId: string, message: string) =>
    hermesBridgeClient.post('/send', { chatId, message }),

  /**
   * List Hermes cron jobs
   */
  listCronJobs: () => hermesApiClient.get('/api/jobs'),

  /**
   * Create a Hermes cron job (for scheduled WhatsApp notifications)
   */
  createCronJob: (job: { name: string; schedule: string; prompt: string }) =>
    hermesApiClient.post('/api/jobs', { ...job, platform: 'whatomate', enabled: true }),

  /**
   * Get Hermes sessions
   */
  listSessions: () => hermesApiClient.get('/api/sessions'),
}

// ─── Shadowbroker Integration (via API, not direct WA) ──────────────────────

export const shadowbrokerIntegration = {
  /**
   * Check Shadowbroker health
   */
  health: () => sbClient.get('/health'),

  /**
   * Get Shadowbroker dashboard
   */
  dashboard: () => sbClient.get('/api/dashboard'),

  /**
   * Get current threat level
   */
  threatLevel: () => sbClient.get('/api/threat-level'),

  /**
   * Get intelligence alerts
   */
  alerts: (severity?: string) =>
    sbClient.get('/api/alerts', { params: { severity } }),

  /**
   * Get intel events
   */
  events: (params?: { type?: string; severity?: string; limit?: number }) =>
    sbClient.get('/api/events', { params }),

  /**
   * Trigger an AI analysis
   */
  analyze: (type: 'threat' | 'anomaly' | 'deep' | 'custom', prompt?: string) =>
    sbClient.post('/api/analyze', { type, prompt }),

  /**
   * Natural language query
   */
  query: (question: string) =>
    sbClient.post('/api/query', { question }),

  /**
   * Dispatch an alert through Hermes (Shadowbroker -> Hermes -> WhatsApp)
   */
  dispatchAlert: (alert: { severity: string; title: string; message: string }) =>
    sbClient.post('/api/hermes/dispatch', alert),

  /**
   * Auto-pilot control
   */
  startAutopilot: () => sbClient.post('/api/autopilot/start'),
  stopAutopilot: () => sbClient.post('/api/autopilot/stop'),

  /**
   * Delegate deep research to DeerFlow via Shadowbroker
   */
  deepResearch: (query: string, context?: string) =>
    sbClient.post('/api/deerflow/research', { query, context }),

  /**
   * SSE stream for real-time intelligence
   */
  streamUrl: `${SHADOWBROKER_BASE}/stream`,
}

// ─── Default Export ──────────────────────────────────────────────────────────

export default {
  deerflow: deerflowIntegration,
  hermes: hermesIntegration,
  shadowbroker: shadowbrokerIntegration,
  checkHealth: checkIntegrationHealth,
}
