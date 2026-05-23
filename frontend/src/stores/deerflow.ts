import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import {
  deerflowService,
  type DeerFlowThread,
  type DeerFlowRun,
  type DeerFlowMessage,
  type DeerFlowModel,
  type DeerFlowSkill,
  type DeerFlowAgent,
  type DeerFlowMemoryFact,
} from '@/services/deerflow'

export const useDeerFlowStore = defineStore('deerflow', () => {
  // ─── State ────────────────────────────────────────────────────────────
  const threads = ref<DeerFlowThread[]>([])
  const currentThread = ref<DeerFlowThread | null>(null)
  const currentMessages = ref<DeerFlowMessage[]>([])
  const currentRun = ref<DeerFlowRun | null>(null)
  const models = ref<DeerFlowModel[]>([])
  const skills = ref<DeerFlowSkill[]>([])
  const agents = ref<DeerFlowAgent[]>([])
  const memoryFacts = ref<DeerFlowMemoryFact[]>([])
  const isResearching = ref(false)
  const isLoading = ref(false)
  const error = ref<string | null>(null)
  const streamingContent = ref('')
  const researchInput = ref('')
  const selectedModel = ref('')
  const planMode = ref(true)
  const subagentEnabled = ref(true)
  const thinkingEnabled = ref(false)

  // ─── Computed ──────────────────────────────────────────────────────────
  const hasThreads = computed(() => threads.value.length > 0)
  const isStreaming = computed(() => isResearching.value)
  const latestAssistantMessage = computed(() =>
    [...currentMessages.value]
      .reverse()
      .find((m) => m.role === 'assistant')
  )

  // ─── Actions ──────────────────────────────────────────────────────────

  async function fetchThreads() {
    try {
      isLoading.value = true
      const { data } = await deerflowService.listThreads()
      threads.value = data || []
    } catch (e: any) {
      threads.value = []
      error.value = e.message
    } finally {
      isLoading.value = false
    }
  }

  async function createThread(metadata?: Record<string, any>) {
    try {
      const { data } = await deerflowService.createThread(metadata)
      threads.value.unshift(data)
      currentThread.value = data
      currentMessages.value = []
      return data
    } catch (e: any) {
      error.value = e.message
      return null
    }
  }

  async function selectThread(threadId: string) {
    try {
      isLoading.value = true
      const [threadRes, messagesRes] = await Promise.all([
        deerflowService.getThread(threadId),
        deerflowService.getThreadMessages(threadId),
      ])
      currentThread.value = threadRes.data
      currentMessages.value = messagesRes.data.messages || []
    } catch (e: any) {
      error.value = e.message
    } finally {
      isLoading.value = false
    }
  }

  async function deleteThread(threadId: string) {
    try {
      await deerflowService.deleteThread(threadId)
      threads.value = threads.value.filter((t) => t.thread_id !== threadId)
      if (currentThread.value?.thread_id === threadId) {
        currentThread.value = null
        currentMessages.value = []
      }
    } catch (e: any) {
      error.value = e.message
    }
  }

  async function startResearch(message?: string) {
    const query = message || researchInput.value
    if (!query.trim()) return

    try {
      isResearching.value = true
      streamingContent.value = ''
      error.value = null

      // Ensure we have a thread
      let threadId = currentThread.value?.thread_id
      if (!threadId) {
        const thread = await createThread({ title: query.substring(0, 80) })
        threadId = thread?.thread_id
        if (!threadId) throw new Error('Failed to create thread')
      }

      // Add user message locally
      currentMessages.value.push({
        id: `local-${Date.now()}`,
        role: 'user',
        content: query,
      })
      researchInput.value = ''

      // Start the run with streaming
      const config: Record<string, any> = {
        model_name: selectedModel.value || undefined,
        is_plan_mode: planMode.value,
        subagent_enabled: subagentEnabled.value,
        thinking_enabled: thinkingEnabled.value,
        max_concurrent_subagents: 3,
      }

      const { data } = await deerflowService.createRun(
        threadId,
        { messages: currentMessages.value.filter((m) => !m.id.startsWith('local-')) },
        config
      )
      currentRun.value = data

      // Poll for completion
      await pollRunStatus(threadId, data.run_id)
    } catch (e: any) {
      error.value = e.message
      isResearching.value = false
    }
  }

  async function pollRunStatus(threadId: string, runId: string, maxAttempts = 120) {
    let attempts = 0
    while (attempts < maxAttempts && isResearching.value) {
      try {
        const { data: run } = await deerflowService.getRun(threadId, runId)
        currentRun.value = run

        if (run.status === 'completed' || run.status === 'error' || run.status === 'interrupted') {
          // Fetch final messages
          const { data: msgData } = await deerflowService.getRunMessages(threadId, runId)
          if (msgData.messages?.length) {
            // Replace local messages with server messages
            currentMessages.value = msgData.messages
          } else {
            // Fallback: get all thread messages
            const { data: allMsgs } = await deerflowService.getThreadMessages(threadId)
            currentMessages.value = allMsgs.messages || []
          }
          isResearching.value = false
          break
        }

        // Update messages in real-time while running
        const { data: msgData } = await deerflowService.getRunMessages(threadId, runId)
        if (msgData.messages?.length) {
          streamingContent.value = msgData.messages[msgData.messages.length - 1]?.content || ''
        }

        await new Promise((resolve) => setTimeout(resolve, 2000))
        attempts++
      } catch (e: any) {
        error.value = e.message
        isResearching.value = false
        break
      }
    }
    if (attempts >= maxAttempts) {
      isResearching.value = false
      error.value = 'Research timed out'
    }
  }

  async function cancelResearch() {
    if (!currentThread.value?.thread_id || !currentRun.value?.run_id) return
    try {
      await deerflowService.cancelRun(currentThread.value.thread_id, currentRun.value.run_id)
      isResearching.value = false
    } catch (e: any) {
      error.value = e.message
    }
  }

  async function fetchModels() {
    try {
      const { data } = await deerflowService.listModels()
      models.value = data || []
    } catch (e: any) {
      models.value = []
    }
  }

  async function fetchSkills() {
    try {
      const { data } = await deerflowService.listSkills()
      skills.value = data || []
    } catch (e: any) {
      skills.value = []
    }
  }

  async function toggleSkill(name: string, enabled: boolean) {
    try {
      await deerflowService.toggleSkill(name, enabled)
      const skill = skills.value.find((s) => s.name === name)
      if (skill) skill.enabled = enabled
    } catch (e: any) {
      error.value = e.message
    }
  }

  async function fetchAgents() {
    try {
      const { data } = await deerflowService.listAgents()
      agents.value = data || []
    } catch (e: any) {
      agents.value = []
    }
  }

  async function fetchMemory() {
    try {
      const { data } = await deerflowService.getMemory()
      memoryFacts.value = data.facts || []
    } catch (e: any) {
      memoryFacts.value = []
    }
  }

  async function addMemoryFact(content: string) {
    try {
      await deerflowService.createFact(content)
      await fetchMemory()
    } catch (e: any) {
      error.value = e.message
    }
  }

  async function deleteMemoryFact(factId: string) {
    try {
      await deerflowService.deleteFact(factId)
      memoryFacts.value = memoryFacts.value.filter((f) => f.id !== factId)
    } catch (e: any) {
      error.value = e.message
    }
  }

  function clearCurrentThread() {
    currentThread.value = null
    currentMessages.value = []
    currentRun.value = null
    streamingContent.value = ''
  }

  async function initialize() {
    isLoading.value = true
    await Promise.allSettled([
      fetchThreads(),
      fetchModels(),
      fetchSkills(),
      fetchAgents(),
      fetchMemory(),
    ])
    isLoading.value = false
  }

  return {
    // State
    threads,
    currentThread,
    currentMessages,
    currentRun,
    models,
    skills,
    agents,
    memoryFacts,
    isResearching,
    isLoading,
    error,
    streamingContent,
    researchInput,
    selectedModel,
    planMode,
    subagentEnabled,
    thinkingEnabled,
    // Computed
    hasThreads,
    isStreaming,
    latestAssistantMessage,
    // Actions
    fetchThreads,
    createThread,
    selectThread,
    deleteThread,
    startResearch,
    cancelResearch,
    fetchModels,
    fetchSkills,
    toggleSkill,
    fetchAgents,
    fetchMemory,
    addMemoryFact,
    deleteMemoryFact,
    clearCurrentThread,
    initialize,
  }
})
