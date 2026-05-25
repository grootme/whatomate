import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import {
  hermesApiService,
  hermesWhatsAppService,
  hermesDashboardService,
  type HermesHealth,
  type HermesDetailedHealth,
  type WhatsAppBridgeHealth,
  type WhatsAppMessage,
  type HermesSession,
  type HermesCronJob,
  type HermesConfig,
  type ChatCompletionRequest,
  type ChatCompletionResponse,
} from '@/services/hermes'

export const useHermesStore = defineStore('hermes', () => {
  // ─── State ────────────────────────────────────────────────────────────
  const apiHealth = ref<HermesHealth | null>(null)
  const detailedHealth = ref<HermesDetailedHealth | null>(null)
  const whatsappHealth = ref<WhatsAppBridgeHealth | null>(null)
  const sessions = ref<HermesSession[]>([])
  const cronJobs = ref<HermesCronJob[]>([])
  const config = ref<HermesConfig | null>(null)
  const whatsappMessages = ref<WhatsAppMessage[]>([])
  const qrCodeImage = ref<string | null>(null)
  const isLoading = ref(false)
  const error = ref<string | null>(null)
  const isAgentRunning = ref(false)
  const currentChatSession = ref<string | null>(null)
  const chatHistory = ref<{ role: string; content: string }[]>([])

  // ─── Computed ──────────────────────────────────────────────────────────
  const isApiConnected = computed(() => apiHealth.value?.status === 'ok')
  const isWhatsAppConnected = computed(() => whatsappHealth.value?.status === 'connected')
  const isWhatsAppConnecting = computed(() => whatsappHealth.value?.status === 'connecting')
  const gatewayState = computed(() => detailedHealth.value?.gateway_state || 'unknown')
  const activePlatforms = computed(() => detailedHealth.value?.platforms || [])
  const uptimeSeconds = computed(() => detailedHealth.value?.uptime || 0)

  // ─── Actions ──────────────────────────────────────────────────────────

  async function checkApiHealth() {
    try {
      const { data } = await hermesApiService.health()
      apiHealth.value = data
      error.value = null
    } catch (e: any) {
      apiHealth.value = null
      error.value = e.message
    }
  }

  async function checkDetailedHealth() {
    try {
      const { data } = await hermesApiService.detailedHealth()
      detailedHealth.value = data
    } catch (e: any) {
      detailedHealth.value = null
    }
  }

  async function checkWhatsAppHealth() {
    try {
      const { data } = await hermesWhatsAppService.health()
      whatsappHealth.value = data
      error.value = null
    } catch (e: any) {
      whatsappHealth.value = { status: 'disconnected', queueLength: 0, uptime: 0 }
      error.value = e.message
    }
  }

  async function fetchQRCode() {
    try {
      isLoading.value = true
      const { data } = await hermesWhatsAppService.getQR()
      // Convert arraybuffer to base64 image
      const blob = new Blob([data], { type: 'image/png' })
      qrCodeImage.value = URL.createObjectURL(blob)
      error.value = null
    } catch (e: any) {
      error.value = e.message
      qrCodeImage.value = null
    } finally {
      isLoading.value = false
    }
  }

  async function fetchSessions() {
    try {
      const { data } = await hermesDashboardService.listSessions()
      sessions.value = data.sessions || []
    } catch (e: any) {
      sessions.value = []
    }
  }

  async function searchSessions(query: string) {
    try {
      const { data } = await hermesDashboardService.searchSessions(query)
      return data.results || []
    } catch (e: any) {
      return []
    }
  }

  async function fetchCronJobs() {
    try {
      const { data } = await hermesApiService.listCronJobs()
      cronJobs.value = data.jobs || []
    } catch (e: any) {
      cronJobs.value = []
    }
  }

  async function fetchConfig() {
    try {
      const { data } = await hermesDashboardService.getConfig()
      config.value = data
    } catch (e: any) {
      config.value = null
    }
  }

  async function fetchWhatsAppMessages() {
    try {
      const { data } = await hermesWhatsAppService.getMessages()
      whatsappMessages.value = data || []
    } catch (e: any) {
      whatsappMessages.value = []
    }
  }

  async function sendWhatsAppMessage(chatId: string, message: string) {
    try {
      await hermesWhatsAppService.sendMessage({ chatId, message })
      await fetchWhatsAppMessages()
    } catch (e: any) {
      error.value = e.message
    }
  }

  async function sendChatCompletion(message: string, options?: { sessionKey?: string; stream?: boolean }) {
    try {
      isAgentRunning.value = true
      chatHistory.value.push({ role: 'user', content: message })

      const req: ChatCompletionRequest = {
        messages: chatHistory.value.map((m) => ({
          role: m.role as any,
          content: m.content,
        })),
        stream: options?.stream || false,
        session_key: options?.sessionKey || 'whatomate-frontend',
      }

      const { data } = await hermesApiService.chatCompletion(req)
      const assistantMessage = data.choices?.[0]?.message?.content || 'Sin respuesta'
      chatHistory.value.push({ role: 'assistant', content: assistantMessage })
      return assistantMessage
    } catch (e: any) {
      error.value = e.message
      chatHistory.value.push({ role: 'assistant', content: `Error: ${e.message}` })
      return null
    } finally {
      isAgentRunning.value = false
    }
  }

  async function restartGateway() {
    try {
      await hermesDashboardService.restartGateway()
      await checkApiHealth()
      await checkDetailedHealth()
    } catch (e: any) {
      error.value = e.message
    }
  }

  async function createCronJob(job: Partial<HermesCronJob>) {
    try {
      await hermesApiService.createCronJob(job)
      await fetchCronJobs()
    } catch (e: any) {
      error.value = e.message
    }
  }

  async function toggleCronJob(jobId: string, action: 'pause' | 'resume') {
    try {
      if (action === 'pause') {
        await hermesApiService.pauseCronJob(jobId)
      } else {
        await hermesApiService.resumeCronJob(jobId)
      }
      await fetchCronJobs()
    } catch (e: any) {
      error.value = e.message
    }
  }

  function clearChat() {
    chatHistory.value = []
    currentChatSession.value = null
  }

  // Initialize all health checks
  async function initialize() {
    isLoading.value = true
    await Promise.allSettled([
      checkApiHealth(),
      checkDetailedHealth(),
      checkWhatsAppHealth(),
    ])
    isLoading.value = false
  }

  return {
    // State
    apiHealth,
    detailedHealth,
    whatsappHealth,
    sessions,
    cronJobs,
    config,
    whatsappMessages,
    qrCodeImage,
    isLoading,
    error,
    isAgentRunning,
    currentChatSession,
    chatHistory,
    // Computed
    isApiConnected,
    isWhatsAppConnected,
    isWhatsAppConnecting,
    gatewayState,
    activePlatforms,
    uptimeSeconds,
    // Actions
    checkApiHealth,
    checkDetailedHealth,
    checkWhatsAppHealth,
    fetchQRCode,
    fetchSessions,
    searchSessions,
    fetchCronJobs,
    fetchConfig,
    fetchWhatsAppMessages,
    sendWhatsAppMessage,
    sendChatCompletion,
    restartGateway,
    createCronJob,
    toggleCronJob,
    clearChat,
    initialize,
  }
})
