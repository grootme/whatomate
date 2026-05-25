<script setup lang="ts">
import { computed, ref, nextTick, watch } from 'vue'
import { useDeerFlowStore } from '@/stores/deerflow'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Bot,
  User,
  Loader2,
  Send,
  X,
  Sparkles,
  Cpu,
  Wrench,
  FileText,
} from 'lucide-vue-next'

const deerflowStore = useDeerFlowStore()
const followUpInput = ref('')
const scrollRef = ref<any>(null)

const messages = computed(() => deerflowStore.currentMessages)

function getIcon(role: string) {
  switch (role) {
    case 'user': return User
    case 'assistant': return Bot
    case 'tool': return Wrench
    case 'system': return FileText
    default: return Bot
  }
}

function getRoleColor(role: string) {
  switch (role) {
    case 'user': return 'bg-primary text-primary-foreground'
    case 'assistant': return 'bg-violet-500/10 text-violet-500'
    case 'tool': return 'bg-orange-500/10 text-orange-500'
    case 'system': return 'bg-muted text-muted-foreground'
    default: return 'bg-muted'
  }
}

function getBubbleClass(role: string) {
  switch (role) {
    case 'user': return 'bg-primary text-primary-foreground ml-12'
    case 'assistant': return 'bg-muted mr-12'
    case 'tool': return 'bg-orange-500/5 border border-orange-500/20 mr-12'
    default: return 'bg-muted'
  }
}

async function sendFollowUp() {
  const msg = followUpInput.value.trim()
  if (!msg || deerflowStore.isResearching) return
  followUpInput.value = ''
  await deerflowStore.startResearch(msg)
}

function cancel() {
  deerflowStore.cancelResearch()
}

watch(() => messages.value.length, () => {
  nextTick(() => {
    if (scrollRef.value?.$el) {
      const viewport = scrollRef.value.$el.querySelector('[data-radix-scroll-area-viewport]')
      if (viewport) viewport.scrollTop = viewport.scrollHeight
    }
  })
})
</script>

<template>
  <div class="flex-1 flex flex-col min-h-0">
    <!-- Header -->
    <div class="px-4 py-3 border-b flex items-center justify-between">
      <div class="flex items-center gap-2">
        <h3 class="font-medium text-sm truncate">
          {{ deerflowStore.currentThread?.title || 'Research' }}
        </h3>
        <Badge v-if="deerflowStore.isResearching" variant="default" class="animate-pulse text-[10px]">
          <Loader2 class="w-3 h-3 mr-1 animate-spin" />
          Researching
        </Badge>
        <Badge v-else-if="deerflowStore.currentThread?.status === 'busy'" variant="outline" class="text-[10px]">
          <Cpu class="w-3 h-3 mr-1" />
          Processing
        </Badge>
      </div>
      <div class="flex items-center gap-2">
        <Button
          v-if="deerflowStore.isResearching"
          variant="destructive"
          size="sm"
          @click="cancel"
        >
          <X class="w-3 h-3 mr-1" />
          Cancel
        </Button>
      </div>
    </div>

    <!-- Messages -->
    <ScrollArea ref="scrollRef" class="flex-1 min-h-0 p-4">
      <div class="max-w-4xl mx-auto space-y-4">
        <div
          v-for="(msg, idx) in messages"
          :key="msg.id || idx"
          class="flex gap-3"
          :class="msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'"
        >
          <!-- Avatar -->
          <div
            class="flex-shrink-0 flex items-center justify-center w-8 h-8 rounded-full"
            :class="getRoleColor(msg.role)"
          >
            <component :is="getIcon(msg.role)" class="w-4 h-4" />
          </div>

          <!-- Bubble -->
          <div
            class="max-w-[80%] rounded-xl px-4 py-3"
            :class="getBubbleClass(msg.role)"
          >
            <div v-if="msg.role === 'tool'" class="flex items-center gap-1.5 mb-1">
              <Wrench class="w-3 h-3 text-orange-500" />
              <span class="text-[10px] font-medium text-orange-500">Tool Call</span>
              <span v-if="msg.name" class="text-[10px] text-orange-500/70">— {{ msg.name }}</span>
            </div>
            <p class="text-sm whitespace-pre-wrap leading-relaxed">{{ msg.content }}</p>
          </div>
        </div>

        <!-- Streaming Indicator -->
        <div v-if="deerflowStore.isResearching" class="flex gap-3">
          <div class="flex-shrink-0 flex items-center justify-center w-8 h-8 rounded-full bg-violet-500/10">
            <Sparkles class="w-4 h-4 text-violet-500 animate-pulse" />
          </div>
          <div class="bg-muted rounded-xl px-4 py-3">
            <div class="flex items-center gap-2">
              <Loader2 class="w-4 h-4 animate-spin text-violet-500" />
              <span class="text-sm text-muted-foreground">
                {{ deerflowStore.streamingContent ? 'Generating...' : 'Planning research...' }}
              </span>
            </div>
            <p v-if="deerflowStore.streamingContent" class="text-sm mt-2 whitespace-pre-wrap">
              {{ deerflowStore.streamingContent }}
            </p>
          </div>
        </div>
      </div>
    </ScrollArea>

    <!-- Follow-up Input -->
    <div class="px-4 py-3 border-t">
      <div class="max-w-4xl mx-auto flex gap-2">
        <Input
          v-model="followUpInput"
          placeholder="Ask a follow-up question..."
          class="flex-1"
          @keydown.enter="sendFollowUp"
          :disabled="deerflowStore.isResearching"
        />
        <Button
          @click="sendFollowUp"
          :disabled="!followUpInput.trim() || deerflowStore.isResearching"
          size="icon"
        >
          <Send class="w-4 h-4" />
        </Button>
      </div>
    </div>
  </div>
</template>
