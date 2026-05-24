/**
 * Whatomate Integration Layer — DeerFlow + Hermes Agent + Shadowbroker
 *
 * This module provides the integration between Whatomate (WhatsApp service)
 * and the shared DeerFlow + Hermes Agent platform, as well as the
 * Shadowbroker OSINT service.
 *
 * Architecture:
 *   Whatomate <-> Hermes Agent <-> Shadowbroker
 *   Whatomate <-> DeerFlow      <-> Shadowbroker
 *
 * Whatomate NEVER directly communicates with Shadowbroker's WhatsApp bridge.
 * All cross-service communication goes through DeerFlow or Hermes Agent.
 *
 * Shadowbroker is a SEPARATE project: https://github.com/grootme/shadowbroker
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
  health: () => deerflowClient.get('/health'),
  createThread: (metadata?: Record<string, any>) =>
    deerflowClient.post<DeerFlowThread>('/api/threads', {
      metadata: { source: 'whatomate', ...metadata },
    }),
  runResearch: (threadId: string, message: string, options?: {
    subagent_enabled?: boolean
    thinking_enabled?: boolean
  }) =>
    deerflowClient.post(`/api/threads/${threadId}/runs`, {
      assistant_id: 'lead_agent',
      input: {
        messages: [{ id: crypto.randomUUID(), role: 'user' as const, content: message }],
      },
      config: {
        configurable: {
          subagent_enabled: options?.subagent_enabled ?? true,
          thinking_enabled: options?.thinking_enabled ?? false,
        },
      },
      stream_mode: ['values', 'messages-tuple', 'custom'],
    }),
  listThreads: (limit = 20) =>
    deerflowClient.post<DeerFlowThread[]>('/api/threads/search', { limit, offset: 0 }),
  getThreadMessages: (threadId: string) =>
    deerflowClient.get<{ messages: DeerFlowMessage[] }>(`/api/threads/${threadId}/messages`),
  createFact: (content: string) =>
    deerflowClient.post('/api/memory/facts', { content }),
  getMemory: () => deerflowClient.get('/api/memory'),
  listSkills: () => deerflowClient.get('/api/skills'),
}

// ─── Hermes Agent Integration ────────────────────────────────────────────────

export const hermesIntegration = {
  apiHealth: () => hermesApiClient.get('/health'),
  bridgeHealth: () => hermesBridgeClient.get('/health'),
  chatCompletion: (request: HermesChatRequest) =>
    hermesApiClient.post('/v1/chat/completions', request),
  getQR: () => hermesBridgeClient.get('/qr', { responseType: 'arraybuffer' }),
  sendMessage: (chatId: string, message: string) =>
    hermesBridgeClient.post('/send', { chatId, message }),
  listCronJobs: () => hermesApiClient.get('/api/jobs'),
  createCronJob: (job: { name: string; schedule: string; prompt: string }) =>
    hermesApiClient.post('/api/jobs', { ...job, platform: 'whatomate', enabled: true }),
  listSessions: () => hermesApiClient.get('/api/sessions'),
}

// ─── Shadowbroker Integration (via API, NOT direct WhatsApp) ────────────────
// Shadowbroker is a separate project. Whatomate accesses it through its API.
// Shadowbroker dispatches WhatsApp alerts through Hermes Agent, NOT directly.

export const shadowbrokerIntegration = {
  health: () => sbClient.get('/health'),
  dashboard: () => sbClient.get('/api/dashboard'),
  threatLevel: () => sbClient.get('/api/threat-level'),
  alerts: (severity?: string) =>
    sbClient.get('/api/alerts', { params: { severity } }),
  events: (params?: { type?: string; severity?: string; limit?: number }) =>
    sbClient.get('/api/events', { params }),
  analyze: (type: 'threat' | 'anomaly' | 'deep' | 'custom', prompt?: string) =>
    sbClient.post('/api/analyze', { type, prompt }),
  query: (question: string) =>
    sbClient.post('/api/query', { question }),
  startAutopilot: () => sbClient.post('/api/autopilot/start'),
  stopAutopilot: () => sbClient.post('/api/autopilot/stop'),
  deepResearch: (query: string, context?: string) =>
    sbClient.post('/api/deerflow/research', { query, context }),
  streamUrl: `${SHADOWBROKER_BASE}/stream`,
}

// ─── Default Export ──────────────────────────────────────────────────────────

export default {
  deerflow: deerflowIntegration,
  hermes: hermesIntegration,
  shadowbroker: shadowbrokerIntegration,
  checkHealth: checkIntegrationHealth,
}
