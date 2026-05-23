import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import {
  cognitiveService,
  type CognitiveDashboard,
  type CognitiveStats,
  type CognitiveEntity,
  type CognitiveDecision,
  type CognitivePattern,
  type CognitiveSummary,
  type CognitiveSearchResult,
} from '@/services/cognitive'

export const useCognitiveStore = defineStore('cognitive', () => {
  // ─── State ────────────────────────────────────────────────────────────
  const dashboard = ref<CognitiveDashboard | null>(null)
  const stats = ref<CognitiveStats | null>(null)
  const entities = ref<CognitiveEntity[]>([])
  const decisions = ref<CognitiveDecision[]>([])
  const patterns = ref<CognitivePattern[]>([])
  const summaries = ref<CognitiveSummary[]>([])
  const searchResults = ref<CognitiveSearchResult | null>(null)
  const searchQuery = ref('')
  const isLoading = ref(false)
  const error = ref<string | null>(null)
  const selectedEntityType = ref<string>('')
  const selectedDecisionStatus = ref<string>('')

  // ─── Computed ──────────────────────────────────────────────────────────
  const totalEntities = computed(() => stats.value?.entities.total || 0)
  const totalMessages = computed(() => stats.value?.messages.total || 0)
  const totalDecisions = computed(() => stats.value?.decisions.total || 0)
  const totalPatterns = computed(() => stats.value?.patterns.total || 0)
  const pendingDecisions = computed(() => stats.value?.decisions.pending || 0)
  const topEntities = computed(() => dashboard.value?.top_entities || [])
  const recentDecisions = computed(() => dashboard.value?.recent_decisions || [])
  const activePatterns = computed(() => dashboard.value?.active_patterns || [])
  const latestSummary = computed(() => dashboard.value?.latest_summary)
  const sentimentTrend = computed(() => dashboard.value?.sentiment_trend || [])
  const topicDistribution = computed(() => dashboard.value?.topic_distribution || [])

  const entityTypeOptions = computed(() => [
    { value: '', label: 'Todos' },
    { value: 'person', label: 'Personas' },
    { value: 'organization', label: 'Organizaciones' },
    { value: 'topic', label: 'Temas' },
    { value: 'project', label: 'Proyectos' },
    { value: 'location', label: 'Ubicaciones' },
    { value: 'event', label: 'Eventos' },
  ])

  const decisionStatusOptions = computed(() => [
    { value: '', label: 'Todos' },
    { value: 'pending', label: 'Pendientes' },
    { value: 'made', label: 'Tomadas' },
    { value: 'reversed', label: 'Revertidas' },
  ])

  // ─── Actions ──────────────────────────────────────────────────────────

  async function fetchDashboard() {
    try {
      const { data } = await cognitiveService.getDashboard()
      dashboard.value = data
    } catch (e: any) {
      dashboard.value = null
    }
  }

  async function fetchStats() {
    try {
      const { data } = await cognitiveService.getStats()
      stats.value = data
    } catch (e: any) {
      stats.value = null
    }
  }

  async function fetchEntities(type?: string) {
    try {
      const { data } = await cognitiveService.listEntities(type || selectedEntityType.value || undefined)
      entities.value = data.entities || []
    } catch (e: any) {
      entities.value = []
      error.value = e.message
    }
  }

  async function fetchDecisions(status?: string) {
    try {
      const { data } = await cognitiveService.listDecisions(status || selectedDecisionStatus.value || undefined)
      decisions.value = data.decisions || []
    } catch (e: any) {
      decisions.value = []
      error.value = e.message
    }
  }

  async function fetchPatterns(patternType?: string) {
    try {
      const { data } = await cognitiveService.listPatterns(patternType)
      patterns.value = data.patterns || []
    } catch (e: any) {
      patterns.value = []
    }
  }

  async function fetchSummaries(period?: string) {
    try {
      const { data } = await cognitiveService.listSummaries(period)
      summaries.value = data.summaries || []
    } catch (e: any) {
      summaries.value = []
    }
  }

  async function search(query?: string, type?: string) {
    const q = query || searchQuery.value
    if (!q.trim()) return

    try {
      isLoading.value = true
      const { data } = await cognitiveService.search(q, type)
      searchResults.value = data
    } catch (e: any) {
      searchResults.value = null
      error.value = e.message
    } finally {
      isLoading.value = false
    }
  }

  async function createDecision(decision: Partial<CognitiveDecision>) {
    try {
      await cognitiveService.createDecision(decision)
      await fetchDecisions()
    } catch (e: any) {
      error.value = e.message
    }
  }

  async function updateDecision(id: number, decision: Partial<CognitiveDecision>) {
    try {
      await cognitiveService.updateDecision(id, decision)
      await fetchDecisions()
    } catch (e: any) {
      error.value = e.message
    }
  }

  async function createEntity(entity: Partial<CognitiveEntity>) {
    try {
      await cognitiveService.createEntity(entity)
      await fetchEntities()
    } catch (e: any) {
      error.value = e.message
    }
  }

  async function generateSummary(period: 'daily' | 'weekly' | 'monthly') {
    try {
      isLoading.value = true
      await cognitiveService.generateSummary(period)
      await fetchSummaries()
    } catch (e: any) {
      error.value = e.message
    } finally {
      isLoading.value = false
    }
  }

  async function extractEntities(jid?: string) {
    try {
      isLoading.value = true
      await cognitiveService.extractEntities(jid)
      await fetchEntities()
      await fetchStats()
    } catch (e: any) {
      error.value = e.message
    } finally {
      isLoading.value = false
    }
  }

  async function detectPatterns() {
    try {
      isLoading.value = true
      await cognitiveService.detectPatterns()
      await fetchPatterns()
      await fetchStats()
    } catch (e: any) {
      error.value = e.message
    } finally {
      isLoading.value = false
    }
  }

  async function initialize() {
    isLoading.value = true
    await Promise.allSettled([
      fetchDashboard(),
      fetchStats(),
      fetchEntities(),
      fetchDecisions(),
      fetchPatterns(),
      fetchSummaries(),
    ])
    isLoading.value = false
  }

  return {
    // State
    dashboard,
    stats,
    entities,
    decisions,
    patterns,
    summaries,
    searchResults,
    searchQuery,
    isLoading,
    error,
    selectedEntityType,
    selectedDecisionStatus,
    // Computed
    totalEntities,
    totalMessages,
    totalDecisions,
    totalPatterns,
    pendingDecisions,
    topEntities,
    recentDecisions,
    activePatterns,
    latestSummary,
    sentimentTrend,
    topicDistribution,
    entityTypeOptions,
    decisionStatusOptions,
    // Actions
    fetchDashboard,
    fetchStats,
    fetchEntities,
    fetchDecisions,
    fetchPatterns,
    fetchSummaries,
    search,
    createDecision,
    updateDecision,
    createEntity,
    generateSummary,
    extractEntities,
    detectPatterns,
    initialize,
  }
})
