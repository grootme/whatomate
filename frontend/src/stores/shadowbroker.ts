import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import axios, { type AxiosInstance } from 'axios'

// Shadowbroker AI Bridge API (port 8660)
const SB_BASE = import.meta.env.VITE_SHADOWBROKER_URL || '/sb-api'

const sbClient: AxiosInstance = axios.create({
  baseURL: SB_BASE,
  timeout: 30000,
})

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ShadowbrokerHealth {
  status: string
  service: string
  shadowbroker_connected: boolean
  autopilot: boolean
  uptime: number
  stats: {
    totalEvents: number
    totalAnalyses: number
    totalAlerts: number
    threatLevel: string
  }
}

export interface ThreatAssessment {
  threat_level: string
  category: string
  description: string
  recommendations: string[]
  confidence: number
  created_at: string
}

export interface IntelAlert {
  id: number
  severity: 'critical' | 'high' | 'medium' | 'low'
  title: string
  message: string
  whatsapp_sent: boolean
  created_at: string
}

export interface IntelEvent {
  id: number
  event_type: string
  source: string
  severity: string
  title: string
  description: string
  data: Record<string, any>
  lat: number | null
  lng: number | null
  analyzed: boolean
  created_at: string
}

export interface AIAnalysis {
  id: number
  analysis_type: string
  summary: string
  details: Record<string, any>
  confidence: number
  model_used: string
  created_at: string
}

export interface IntelDashboard {
  health: ShadowbrokerHealth
  threatAssessment: ThreatAssessment | null
  recentAlerts: IntelAlert[]
  recentEvents: IntelEvent[]
  recentAnalyses: AIAnalysis[]
  stats: {
    totalEvents: number
    totalAnalyses: number
    totalAlerts: number
    criticalAlerts: number
    threatLevel: string
  }
}

export interface QueryResponse {
  query: string
  answer: string
  sources: string[]
  confidence: number
}

// ─── Store ───────────────────────────────────────────────────────────────────

export const useShadowbrokerStore = defineStore('shadowbroker', () => {
  // State
  const health = ref<ShadowbrokerHealth | null>(null)
  const dashboard = ref<IntelDashboard | null>(null)
  const threatAssessment = ref<ThreatAssessment | null>(null)
  const alerts = ref<IntelAlert[]>([])
  const events = ref<IntelEvent[]>([])
  const analyses = ref<AIAnalysis[]>([])
  const isAutopilot = ref(false)
  const isConnected = ref(false)
  const isLoading = ref(false)
  const error = ref<string | null>(null)
  const queryResult = ref<QueryResponse | null>(null)
  const lastReport = ref<string | null>(null)

  // Computed
  const threatLevel = computed(() => threatAssessment.value?.threat_level || 'unknown')
  const threatLevelColor = computed(() => {
    switch (threatLevel.value) {
      case 'critical': return 'text-red-500'
      case 'high': return 'text-orange-500'
      case 'elevated': return 'text-yellow-500'
      case 'moderate': return 'text-blue-500'
      case 'low': return 'text-green-500'
      default: return 'text-gray-500'
    }
  })
  const threatLevelBg = computed(() => {
    switch (threatLevel.value) {
      case 'critical': return 'bg-red-500/10 border-red-500/30'
      case 'high': return 'bg-orange-500/10 border-orange-500/30'
      case 'elevated': return 'bg-yellow-500/10 border-yellow-500/30'
      case 'moderate': return 'bg-blue-500/10 border-blue-500/30'
      case 'low': return 'bg-green-500/10 border-green-500/30'
      default: return 'bg-gray-500/10 border-gray-500/30'
    }
  })
  const criticalAlerts = computed(() => alerts.value.filter(a => a.severity === 'critical'))
  const highAlerts = computed(() => alerts.value.filter(a => a.severity === 'high'))

  // Actions
  async function checkHealth() {
    try {
      const { data } = await sbClient.get<ShadowbrokerHealth>('/health')
      health.value = data
      isConnected.value = data.shadowbroker_connected
      isAutopilot.value = data.autopilot
      error.value = null
    } catch (e: any) {
      health.value = null
      isConnected.value = false
      error.value = e.message
    }
  }

  async function fetchDashboard() {
    try {
      isLoading.value = true
      const { data } = await sbClient.get<IntelDashboard>('/dashboard')
      dashboard.value = data
      threatAssessment.value = data.threatAssessment
      alerts.value = data.recentAlerts || []
      events.value = data.recentEvents || []
      analyses.value = data.recentAnalyses || []
      error.value = null
    } catch (e: any) {
      error.value = e.message
    } finally {
      isLoading.value = false
    }
  }

  async function fetchThreatLevel() {
    try {
      const { data } = await sbClient.get<{ assessment: ThreatAssessment; history: ThreatAssessment[] }>('/threat-level')
      threatAssessment.value = data.assessment
    } catch (e: any) {
      // Silently fail
    }
  }

  async function fetchAlerts() {
    try {
      const { data } = await sbClient.get<{ alerts: IntelAlert[] }>('/alerts')
      alerts.value = data.alerts || []
    } catch (e: any) {
      alerts.value = []
    }
  }

  async function fetchEvents() {
    try {
      const { data } = await sbClient.get<{ events: IntelEvent[] }>('/events')
      events.value = data.events || []
    } catch (e: any) {
      events.value = []
    }
  }

  async function fetchAnalyses() {
    try {
      const { data } = await sbClient.get<{ analyses: AIAnalysis[] }>('/analyses')
      analyses.value = data.analyses || []
    } catch (e: any) {
      analyses.value = []
    }
  }

  async function triggerAnalysis(type: string = 'threat') {
    try {
      isLoading.value = true
      const { data } = await sbClient.post('/analyze', { type })
      await fetchDashboard()
      return data
    } catch (e: any) {
      error.value = e.message
      return null
    } finally {
      isLoading.value = false
    }
  }

  async function generateReport() {
    try {
      isLoading.value = true
      const { data } = await sbClient.post('/report')
      lastReport.value = data.report || data.summary || 'Report generated'
      await fetchDashboard()
      return data
    } catch (e: any) {
      error.value = e.message
      return null
    } finally {
      isLoading.value = false
    }
  }

  async function naturalLanguageQuery(query: string) {
    try {
      isLoading.value = true
      const { data } = await sbClient.post<QueryResponse>('/query', { query })
      queryResult.value = data
      return data
    } catch (e: any) {
      error.value = e.message
      queryResult.value = null
      return null
    } finally {
      isLoading.value = false
    }
  }

  async function toggleAutopilot(enable: boolean) {
    try {
      const endpoint = enable ? '/autopilot/start' : '/autopilot/stop'
      await sbClient.post(endpoint)
      isAutopilot.value = enable
      await checkHealth()
    } catch (e: any) {
      error.value = e.message
    }
  }

  async function initialize() {
    isLoading.value = true
    await Promise.allSettled([
      checkHealth(),
      fetchDashboard(),
    ])
    isLoading.value = false
  }

  return {
    // State
    health, dashboard, threatAssessment, alerts, events, analyses,
    isAutopilot, isConnected, isLoading, error, queryResult, lastReport,
    // Computed
    threatLevel, threatLevelColor, threatLevelBg, criticalAlerts, highAlerts,
    // Actions
    checkHealth, fetchDashboard, fetchThreatLevel, fetchAlerts,
    fetchEvents, fetchAnalyses, triggerAnalysis, generateReport,
    naturalLanguageQuery, toggleAutopilot, initialize,
  }
})

export default useShadowbrokerStore
