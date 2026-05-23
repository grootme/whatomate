import axios, { type AxiosInstance } from 'axios'

// Cognitive Capital / Knowledge Base API
// Backed by SQLite + FTS5 at ~/.hermes/whatomate_knowledge.db
// Exposed via a lightweight Express API on the Hermes bridge or dedicated port

const COGNITIVE_BASE = import.meta.env.VITE_COGNITIVE_URL || '/cognitive-api'

const cognitiveClient: AxiosInstance = axios.create({
  baseURL: COGNITIVE_BASE,
  timeout: 15000,
})

cognitiveClient.interceptors.request.use((config) => {
  const token = localStorage.getItem('auth_token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// ─── Types ───────────────────────────────────────────────────────────────────

export interface CognitiveMessage {
  id: number
  jid: string
  sender: string
  content: string
  timestamp: string
  chat_type: 'individual' | 'group'
  direction: 'inbound' | 'outbound'
  metadata?: Record<string, any>
}

export interface CognitiveEntity {
  id: number
  name: string
  type: 'person' | 'organization' | 'topic' | 'project' | 'location' | 'event'
  attributes: Record<string, any>
  first_seen: string
  last_seen: string
  mention_count: number
}

export interface CognitiveDecision {
  id: number
  title: string
  description: string
  context: string
  decision_maker: string
  outcome?: string
  status: 'pending' | 'made' | 'reversed'
  confidence: number
  created_at: string
  updated_at: string
}

export interface CognitivePattern {
  id: number
  name: string
  pattern_type: 'communication' | 'behavioral' | 'temporal' | 'topic'
  description: string
  frequency: number
  confidence: number
  first_observed: string
  last_observed: string
  data: Record<string, any>
}

export interface CognitiveSummary {
  id: number
  period: 'daily' | 'weekly' | 'monthly'
  start_date: string
  end_date: string
  summary: string
  key_topics: string[]
  key_entities: string[]
  action_items: string[]
  sentiment_score: number
  created_at: string
}

export interface CognitiveSearchResult {
  results: {
    type: 'message' | 'entity' | 'decision' | 'pattern' | 'summary'
    id: number
    content: string
    rank: number
    metadata: Record<string, any>
  }[]
  total: number
  query: string
}

export interface CognitiveStats {
  messages: { total: number; today: number; this_week: number }
  entities: { total: number; by_type: Record<string, number> }
  decisions: { total: number; pending: number; made: number }
  patterns: { total: number; by_type: Record<string, number> }
  summaries: { total: number; latest: string | null }
  last_updated: string
}

export interface CognitiveDashboard {
  stats: CognitiveStats
  top_entities: CognitiveEntity[]
  recent_decisions: CognitiveDecision[]
  active_patterns: CognitivePattern[]
  latest_summary: CognitiveSummary | null
  sentiment_trend: { date: string; score: number }[]
  topic_distribution: { topic: string; count: number }[]
}

// ─── Service ─────────────────────────────────────────────────────────────────

export const cognitiveService = {
  // ─── Dashboard ─────────────────────────────────────────────────────────
  getDashboard: () => cognitiveClient.get<CognitiveDashboard>('/dashboard'),
  getStats: () => cognitiveClient.get<CognitiveStats>('/stats'),

  // ─── Messages ──────────────────────────────────────────────────────────
  listMessages: (limit = 50, offset = 0, jid?: string) =>
    cognitiveClient.get<{ messages: CognitiveMessage[]; total: number }>('/messages', {
      params: { limit, offset, jid },
    }),
  getMessage: (id: number) =>
    cognitiveClient.get<CognitiveMessage>(`/messages/${id}`),

  // ─── Entities ──────────────────────────────────────────────────────────
  listEntities: (type?: string, limit = 50, offset = 0) =>
    cognitiveClient.get<{ entities: CognitiveEntity[]; total: number }>('/entities', {
      params: { type, limit, offset },
    }),
  getEntity: (id: number) =>
    cognitiveClient.get<CognitiveEntity>(`/entities/${id}`),
  createEntity: (entity: Partial<CognitiveEntity>) =>
    cognitiveClient.post<CognitiveEntity>('/entities', entity),
  updateEntity: (id: number, entity: Partial<CognitiveEntity>) =>
    cognitiveClient.put<CognitiveEntity>(`/entities/${id}`, entity),
  deleteEntity: (id: number) =>
    cognitiveClient.delete(`/entities/${id}`),

  // ─── Decisions ─────────────────────────────────────────────────────────
  listDecisions: (status?: string, limit = 50, offset = 0) =>
    cognitiveClient.get<{ decisions: CognitiveDecision[]; total: number }>('/decisions', {
      params: { status, limit, offset },
    }),
  getDecision: (id: number) =>
    cognitiveClient.get<CognitiveDecision>(`/decisions/${id}`),
  createDecision: (decision: Partial<CognitiveDecision>) =>
    cognitiveClient.post<CognitiveDecision>('/decisions', decision),
  updateDecision: (id: number, decision: Partial<CognitiveDecision>) =>
    cognitiveClient.put<CognitiveDecision>(`/decisions/${id}`, decision),

  // ─── Patterns ──────────────────────────────────────────────────────────
  listPatterns: (patternType?: string, limit = 50, offset = 0) =>
    cognitiveClient.get<{ patterns: CognitivePattern[]; total: number }>('/patterns', {
      params: { pattern_type: patternType, limit, offset },
    }),
  getPattern: (id: number) =>
    cognitiveClient.get<CognitivePattern>(`/patterns/${id}`),

  // ─── Summaries ─────────────────────────────────────────────────────────
  listSummaries: (period?: string, limit = 10, offset = 0) =>
    cognitiveClient.get<{ summaries: CognitiveSummary[]; total: number }>('/summaries', {
      params: { period, limit, offset },
    }),
  getSummary: (id: number) =>
    cognitiveClient.get<CognitiveSummary>(`/summaries/${id}`),

  // ─── Search (FTS5) ────────────────────────────────────────────────────
  search: (query: string, type?: string, limit = 20) =>
    cognitiveClient.get<CognitiveSearchResult>('/search', {
      params: { q: query, type, limit },
    }),

  // ─── Analysis ──────────────────────────────────────────────────────────
  generateSummary: (period: 'daily' | 'weekly' | 'monthly') =>
    cognitiveClient.post<CognitiveSummary>('/analysis/summarize', { period }),
  extractEntities: (jid?: string) =>
    cognitiveClient.post('/analysis/extract-entities', { jid }),
  detectPatterns: () =>
    cognitiveClient.post('/analysis/detect-patterns'),
  analyzeSentiment: (jid?: string) =>
    cognitiveClient.post('/analysis/sentiment', { jid }),
}

export default cognitiveService
