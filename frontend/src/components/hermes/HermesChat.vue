<script setup lang="ts">
import { ref, nextTick, watch, computed } from 'vue'
import { useHermesStore } from '@/stores/hermes'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Badge } from '@/components/ui/badge'
import {
  Send,
  Loader2,
  Trash2,
  Bot,
  User,
  Zap,
} from 'lucide-vue-next'

const hermesStore = useHermesStore()
const chatInput = ref('')
const scrollAreaRef = ref<any>(null)
const sessionKey = ref('whatomate-frontend')

const chatMessages = computed(() => hermesStore.chatHistory)

function formatMessage(content: string): string {
  // Truncate very long messages for display
  if (content.length > 2000) {
    return content.substring(0, 2000) + '...'
  }
  return content
}

async function sendMessage() {
  const message = chatInput.value.trim()
  if (!message || hermesStore.isAgentRunning) return

  chatInput.value = ''
  await hermesStore.sendChatCompletion(message, {
    sessionKey: sessionKey.value,
  })
  await nextTick()
  scrollToBottom()
}

function clearChat() {
  hermesStore.clearChat()
}

function scrollToBottom() {
  if (scrollAreaRef.value?.$el) {
    const scrollEl = scrollAreaRef.value.$el.querySelector('[data-radix-scroll-area-viewport]')
    if (scrollEl) {
      scrollEl.scrollTop = scrollEl.scrollHeight
    }
  }
}

watch(() => hermesStore.chatHistory.length, () => {
  nextTick(scrollToBottom)
})
</script>

<template>
  <Card class="h-full flex flex-col">
    <CardHeader class="pb-3">
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-2">
          <Bot class="w-5 h-5 text-emerald-500" />
          <CardTitle class="text-lg">Agent Chat</CardTitle>
          <Badge v-if="hermesStore.isAgentRunning" variant="default" class="animate-pulse">
            <Loader2 class="w-3 h-3 mr-1 animate-spin" />
            Thinking
          </Badge>
        </div>
        <div class="flex items-center gap-2">
          <Input
            v-model="sessionKey"
            placeholder="Session key"
            class="w-40 h-8 text-xs"
          />
          <Button variant="ghost" size="sm" @click="clearChat">
            <Trash2 class="w-4 h-4" />
          </Button>
        </div>
      </div>
    </CardHeader>
    <CardContent class="flex-1 flex flex-col min-h-0 gap-3">
      <!-- Chat Messages -->
      <ScrollArea ref="scrollAreaRef" class="flex-1 min-h-0">
        <div v-if="chatMessages.length === 0" class="flex flex-col items-center justify-center h-full text-muted-foreground py-12">
          <Zap class="w-10 h-10 mb-3 opacity-50" />
          <p class="text-sm font-medium">Start a conversation with Hermes</p>
          <p class="text-xs mt-1">Ask anything — analysis, monitoring, research, decisions</p>
        </div>

        <div v-else class="space-y-4 pr-2">
          <div
            v-for="(msg, idx) in chatMessages"
            :key="idx"
            class="flex gap-3"
            :class="msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'"
          >
            <!-- Avatar -->
            <div
              class="flex-shrink-0 flex items-center justify-center w-8 h-8 rounded-full"
              :class="msg.role === 'user' ? 'bg-primary' : 'bg-emerald-500/10'"
            >
              <User v-if="msg.role === 'user'" class="w-4 h-4 text-primary-foreground" />
              <Bot v-else class="w-4 h-4 text-emerald-500" />
            </div>

            <!-- Message Bubble -->
            <div
              class="max-w-[75%] rounded-xl px-4 py-2.5"
              :class="msg.role === 'user'
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted'"
            >
              <p class="text-sm whitespace-pre-wrap leading-relaxed">{{ formatMessage(msg.content) }}</p>
            </div>
          </div>

          <!-- Thinking indicator -->
          <div v-if="hermesStore.isAgentRunning" class="flex gap-3">
            <div class="flex-shrink-0 flex items-center justify-center w-8 h-8 rounded-full bg-emerald-500/10">
              <Bot class="w-4 h-4 text-emerald-500" />
            </div>
            <div class="bg-muted rounded-xl px-4 py-3">
              <div class="flex items-center gap-1.5">
                <div class="w-2 h-2 bg-emerald-500 rounded-full animate-bounce" style="animation-delay: 0ms" />
                <div class="w-2 h-2 bg-emerald-500 rounded-full animate-bounce" style="animation-delay: 150ms" />
                <div class="w-2 h-2 bg-emerald-500 rounded-full animate-bounce" style="animation-delay: 300ms" />
              </div>
            </div>
          </div>
        </div>
      </ScrollArea>

      <!-- Input -->
      <div class="flex gap-2 pt-2 border-t">
        <Input
          v-model="chatInput"
          placeholder="Ask Hermes anything..."
          class="flex-1"
          @keydown.enter="sendMessage"
          :disabled="hermesStore.isAgentRunning || !hermesStore.isApiConnected"
        />
        <Button
          @click="sendMessage"
          :disabled="!chatInput.trim() || hermesStore.isAgentRunning || !hermesStore.isApiConnected"
          size="icon"
        >
          <Send class="w-4 h-4" />
        </Button>
      </div>
    </CardContent>
  </Card>
</template>
