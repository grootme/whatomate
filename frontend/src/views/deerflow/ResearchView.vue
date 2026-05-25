<script setup lang="ts">
import { onMounted, ref, computed } from 'vue'
import { useDeerFlowStore } from '@/stores/deerflow'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Switch } from '@/components/ui/switch'
import { Separator } from '@/components/ui/separator'
import ResearchThread from '@/components/deerflow/ResearchThread.vue'
import {
  FlaskConical,
  Brain,
  Send,
  Loader2,
  Plus,
  Trash2,
  ListChecks,
  Sparkles,
  Settings2,
  BookOpen,
  Cpu,
  Clock,
  X,
} from 'lucide-vue-next'

const deerflowStore = useDeerFlowStore()
const activeTab = ref('research')

onMounted(async () => {
  await deerflowStore.initialize()
})

async function newResearch() {
  deerflowStore.clearCurrentThread()
}

async function selectThread(threadId: string) {
  await deerflowStore.selectThread(threadId)
}

async function deleteThread(threadId: string) {
  await deerflowStore.deleteThread(threadId)
}

async function startResearch() {
  await deerflowStore.startResearch()
}

async function cancelResearch() {
  await deerflowStore.cancelResearch()
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleString()
}
</script>

<template>
  <div class="flex h-full gap-0">
    <!-- Sidebar: Thread List -->
    <div class="w-72 border-r flex flex-col bg-card">
      <div class="p-4 border-b">
        <div class="flex items-center justify-between mb-3">
          <div class="flex items-center gap-2">
            <FlaskConical class="w-5 h-5 text-violet-500" />
            <h2 class="font-semibold">DeerFlow</h2>
          </div>
          <Button variant="outline" size="sm" @click="newResearch">
            <Plus class="w-4 h-4" />
          </Button>
        </div>
        <p class="text-xs text-muted-foreground">Multi-agent deep research engine</p>
      </div>

      <ScrollArea class="flex-1">
        <div class="p-2 space-y-1">
          <button
            v-for="thread in deerflowStore.threads"
            :key="thread.thread_id"
            class="w-full text-left p-3 rounded-lg hover:bg-accent/50 transition-colors group"
            :class="deerflowStore.currentThread?.thread_id === thread.thread_id ? 'bg-accent' : ''"
            @click="selectThread(thread.thread_id)"
          >
            <div class="flex items-center justify-between">
              <span class="text-sm font-medium truncate flex-1">
                {{ thread.title || 'Research #' + thread.thread_id.substring(0, 8) }}
              </span>
              <Button
                variant="ghost"
                size="icon"
                class="w-6 h-6 opacity-0 group-hover:opacity-100"
                @click.stop="deleteThread(thread.thread_id)"
              >
                <Trash2 class="w-3 h-3 text-muted-foreground" />
              </Button>
            </div>
            <div class="flex items-center gap-2 mt-1">
              <Badge :variant="thread.status === 'busy' ? 'default' : 'outline'" class="text-[10px]">
                {{ thread.status }}
              </Badge>
              <span class="text-[10px] text-muted-foreground">
                {{ formatTime(thread.updated_at) }}
              </span>
            </div>
          </button>

          <div v-if="deerflowStore.threads.length === 0" class="p-4 text-center text-muted-foreground">
            <FlaskConical class="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p class="text-sm">No research threads</p>
            <p class="text-xs mt-1">Start a new research to begin</p>
          </div>
        </div>
      </ScrollArea>

      <!-- Research Config -->
      <div class="p-3 border-t space-y-2">
        <div class="flex items-center justify-between">
          <span class="text-xs font-medium flex items-center gap-1">
            <Brain class="w-3 h-3" />
            Plan Mode
          </span>
          <Switch v-model:checked="deerflowStore.planMode" />
        </div>
        <div class="flex items-center justify-between">
          <span class="text-xs font-medium flex items-center gap-1">
            <Sparkles class="w-3 h-3" />
            Sub-agents
          </span>
          <Switch v-model:checked="deerflowStore.subagentEnabled" />
        </div>
        <div class="flex items-center justify-between">
          <span class="text-xs font-medium flex items-center gap-1">
            <Cpu class="w-3 h-3" />
            Thinking
          </span>
          <Switch v-model:checked="deerflowStore.thinkingEnabled" />
        </div>
      </div>
    </div>

    <!-- Main Content -->
    <div class="flex-1 flex flex-col min-h-0">
      <!-- Research Input (when no thread selected or new) -->
      <div v-if="!deerflowStore.currentThread || deerflowStore.currentThread.status === 'idle'" class="p-6">
        <div class="max-w-3xl mx-auto">
          <div class="text-center mb-8">
            <div class="flex items-center justify-center w-16 h-16 rounded-2xl bg-violet-500/10 mx-auto mb-4">
              <FlaskConical class="w-8 h-8 text-violet-500" />
            </div>
            <h1 class="text-2xl font-bold mb-2">Deep Research</h1>
            <p class="text-muted-foreground">
              Start a multi-agent research task. DeerFlow will plan, execute, and synthesize using specialized sub-agents.
            </p>
          </div>

          <!-- Research Input -->
          <div class="flex gap-3">
            <Input
              v-model="deerflowStore.researchInput"
              placeholder="Enter your research question or topic..."
              class="flex-1 h-12 text-base"
              @keydown.enter="startResearch"
              :disabled="deerflowStore.isResearching"
            />
            <Button
              @click="startResearch"
              :disabled="!deerflowStore.researchInput.trim() || deerflowStore.isResearching"
              class="h-12 px-6"
            >
              <Loader2 v-if="deerflowStore.isResearching" class="w-4 h-4 mr-2 animate-spin" />
              <Send v-else class="w-4 h-4 mr-2" />
              {{ deerflowStore.isResearching ? 'Researching...' : 'Research' }}
            </Button>
            <Button
              v-if="deerflowStore.isResearching"
              variant="destructive"
              @click="cancelResearch"
              class="h-12"
            >
              <X class="w-4 h-4" />
            </Button>
          </div>

          <!-- Config Summary -->
          <div class="flex items-center gap-4 mt-4 text-xs text-muted-foreground">
            <span v-if="deerflowStore.selectedModel" class="flex items-center gap-1">
              <Cpu class="w-3 h-3" />
              {{ deerflowStore.selectedModel }}
            </span>
            <span class="flex items-center gap-1">
              <ListChecks class="w-3 h-3" />
              Plan: {{ deerflowStore.planMode ? 'On' : 'Off' }}
            </span>
            <span class="flex items-center gap-1">
              <Sparkles class="w-3 h-3" />
              Sub-agents: {{ deerflowStore.subagentEnabled ? 'On' : 'Off' }}
            </span>
          </div>
        </div>
      </div>

      <!-- Active Research Thread -->
      <ResearchThread v-else />

      <!-- Error -->
      <div
        v-if="deerflowStore.error"
        class="fixed bottom-4 right-4 max-w-md p-4 bg-destructive/10 border border-destructive/20 rounded-lg shadow-lg"
      >
        <p class="text-sm text-destructive font-medium">Error: {{ deerflowStore.error }}</p>
      </div>
    </div>
  </div>
</template>
