import axios, { type AxiosInstance } from 'axios'

// DeerFlow Gateway — default port 8001 (or 2026 via Nginx)
const DEERFLOW_BASE = import.meta.env.VITE_DEERFLOW_URL || '/deerflow-api'

const deerflowClient: AxiosInstance = axios.create({
  baseURL: DEERFLOW_BASE,
  timeout: 60000,
  withCredentials: true,
})

// CSRF token handling for DeerFlow
deerflowClient.interceptors.request.use((config) => {
  // Read CSRF token from cookie for state-changing requests
  const csrfCookie = document.cookie
    .split('; ')
    .find((row) => row.startsWith('csrf_token='))
  if (csrfCookie) {
    const csrfToken = csrfCookie.split('=')[1]
    config.headers['X-CSRF-Token'] = csrfToken
  }
  return config
})

// ─── Types ───────────────────────────────────────────────────────────────────

export interface DeerFlowThread {
  thread_id: string
  title?: string
  status: 'idle' | 'busy' | 'error'
  metadata: Record<string, any>
  created_at: string
  updated_at: string
}

export interface DeerFlowRun {
  run_id: string
  thread_id: string
  status: 'pending' | 'running' | 'completed' | 'error' | 'interrupted'
  assistant_id: string
  created_at: string
  updated_at?: string
  token_usage?: {
    prompt_tokens: number
    completion_tokens: number
    total_tokens: number
  }
}

export interface DeerFlowMessage {
  id: string
  role: 'user' | 'assistant' | 'system' | 'tool'
  content: string
  name?: string
  tool_calls?: any[]
  tool_call_id?: string
  response_metadata?: Record<string, any>
  created_at?: string
}

export interface DeerFlowModel {
  id: string
  name: string
  provider: string
  context_length: number
  capabilities: string[]
}

export interface DeerFlowSkill {
  name: string
  description: string
  enabled: boolean
  type: 'public' | 'custom'
}

export interface DeerFlowMemoryFact {
  id: string
  content: string
  created_at: string
  updated_at: string
}

export interface DeerFlowMemory {
  facts: DeerFlowMemoryFact[]
  config: Record<string, any>
}

export interface DeerFlowAgent {
  name: string
  description: string
  soul_path: string
  created_at: string
}

export interface DeerFlowResearchRequest {
  thread_id?: string
  message: string
  model_name?: string
  subagent_enabled?: boolean
  thinking_enabled?: boolean
  is_plan_mode?: boolean
  max_concurrent_subagents?: number
  stream_mode?: string[]
}

export interface DeerFlowAuthStatus {
  initialized: boolean
  user?: { id: string; email: string; role: string }
}

// ─── Service ─────────────────────────────────────────────────────────────────

export const deerflowService = {
  // ─── Auth ──────────────────────────────────────────────────────────────
  getSetupStatus: () => deerflowClient.get<DeerFlowAuthStatus>('/api/v1/auth/setup-status'),
  initializeAdmin: (email: string, password: string) =>
    deerflowClient.post('/api/v1/auth/initialize', { email, password }),
  login: (username: string, password: string) =>
    deerflowClient.post('/api/v1/auth/login/local', { username, password }, {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    }),
  getMe: () => deerflowClient.get('/api/v1/auth/me'),

  // ─── Threads ───────────────────────────────────────────────────────────
  createThread: (metadata?: Record<string, any>) =>
    deerflowClient.post<DeerFlowThread>('/api/threads', { metadata }),
  getThread: (threadId: string) =>
    deerflowClient.get<DeerFlowThread>(`/api/threads/${threadId}`),
  listThreads: (limit = 20, offset = 0) =>
    deerflowClient.post<DeerFlowThread[]>('/api/threads/search', { limit, offset }),
  deleteThread: (threadId: string) =>
    deerflowClient.delete(`/api/threads/${threadId}`),
  getThreadState: (threadId: string) =>
    deerflowClient.get(`/api/threads/${threadId}/state`),
  getThreadMessages: (threadId: string, limit = 50, offset = 0) =>
    deerflowClient.get<{ messages: DeerFlowMessage[]; total: number }>(
      `/api/threads/${threadId}/messages`,
      { params: { limit, offset } }
    ),

  // ─── Runs (Research) ───────────────────────────────────────────────────
  createRun: (threadId: string, input: { messages: DeerFlowMessage[] }, config?: Record<string, any>) =>
    deerflowClient.post<DeerFlowRun>(`/api/threads/${threadId}/runs`, {
      assistant_id: 'lead_agent',
      input,
      config: { configurable: config || {} },
      stream_mode: ['values', 'messages-tuple', 'custom'],
    }),
  streamRun: (threadId: string, input: { messages: DeerFlowMessage[] }, config?: Record<string, any>) =>
    deerflowClient.post(`/api/threads/${threadId}/runs/stream`, {
      assistant_id: 'lead_agent',
      input,
      config: { configurable: config || {} },
      stream_mode: ['values', 'messages-tuple', 'custom'],
    }, {
      headers: { Accept: 'text/event-stream' },
      responseType: 'stream',
    }),
  waitRun: (threadId: string, input: { messages: DeerFlowMessage[] }, config?: Record<string, any>) =>
    deerflowClient.post(`/api/threads/${threadId}/runs/wait`, {
      assistant_id: 'lead_agent',
      input,
      config: { configurable: config || {} },
    }),
  getRun: (threadId: string, runId: string) =>
    deerflowClient.get<DeerFlowRun>(`/api/threads/${threadId}/runs/${runId}`),
  cancelRun: (threadId: string, runId: string) =>
    deerflowClient.post(`/api/threads/${threadId}/runs/${runId}/cancel`),
  getRunMessages: (threadId: string, runId: string) =>
    deerflowClient.get<{ messages: DeerFlowMessage[] }>(
      `/api/threads/${threadId}/runs/${runId}/messages`
    ),
  getTokenUsage: (threadId: string) =>
    deerflowClient.get(`/api/threads/${threadId}/token-usage`),

  // ─── Models ────────────────────────────────────────────────────────────
  listModels: () => deerflowClient.get<DeerFlowModel[]>('/api/models'),

  // ─── Skills ────────────────────────────────────────────────────────────
  listSkills: () => deerflowClient.get<DeerFlowSkill[]>('/api/skills'),
  getSkill: (name: string) => deerflowClient.get<DeerFlowSkill>(`/api/skills/${name}`),
  toggleSkill: (name: string, enabled: boolean) =>
    deerflowClient.put(`/api/skills/${name}`, { enabled }),

  // ─── Memory ────────────────────────────────────────────────────────────
  getMemory: () => deerflowClient.get<DeerFlowMemory>('/api/memory'),
  createFact: (content: string) =>
    deerflowClient.post('/api/memory/facts', { content }),
  deleteFact: (factId: string) =>
    deerflowClient.delete(`/api/memory/facts/${factId}`),
  exportMemory: () => deerflowClient.get('/api/memory/export'),

  // ─── Agents ────────────────────────────────────────────────────────────
  listAgents: () => deerflowClient.get<DeerFlowAgent[]>('/api/agents'),
  getAgent: (name: string) => deerflowClient.get<DeerFlowAgent>(`/api/agents/${name}`),
  createAgent: (agent: Partial<DeerFlowAgent>) =>
    deerflowClient.post('/api/agents', agent),
  deleteAgent: (name: string) =>
    deerflowClient.delete(`/api/agents/${name}`),

  // ─── Health ────────────────────────────────────────────────────────────
  health: () => deerflowClient.get('/health'),

  // ─── MCP ───────────────────────────────────────────────────────────────
  getMcpConfig: () => deerflowClient.get('/api/mcp/config'),
  updateMcpConfig: (config: any) =>
    deerflowClient.put('/api/mcp/config', config),
}

export default deerflowService
