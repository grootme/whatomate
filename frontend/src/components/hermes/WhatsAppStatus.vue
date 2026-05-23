<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useHermesStore } from '@/stores/hermes'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Button } from '@/components/ui/button'
import {
  Wifi,
  WifiOff,
  Loader2,
  MessageSquare,
  Users,
  RefreshCw,
  CheckCircle2,
  XCircle,
  AlertCircle,
} from 'lucide-vue-next'

const hermesStore = useHermesStore()

const statusColor = computed(() => {
  switch (hermesStore.whatsappHealth?.status) {
    case 'connected': return 'text-emerald-500'
    case 'connecting': return 'text-yellow-500'
    default: return 'text-red-500'
  }
})

const statusBg = computed(() => {
  switch (hermesStore.whatsappHealth?.status) {
    case 'connected': return 'bg-emerald-500/10'
    case 'connecting': return 'bg-yellow-500/10'
    default: return 'bg-red-500/10'
  }
})

const statusIcon = computed(() => {
  switch (hermesStore.whatsappHealth?.status) {
    case 'connected': return CheckCircle2
    case 'connecting': return Loader2
    default: return XCircle
  }
})

const recentMessages = computed(() =>
  hermesStore.whatsappMessages.slice(-20).reverse()
)

async function refreshMessages() {
  if (hermesStore.isWhatsAppConnected) {
    await hermesStore.fetchWhatsAppMessages()
  }
}

function formatTimestamp(ts: number): string {
  return new Date(ts * 1000).toLocaleTimeString()
}

function extractText(msg: any): string {
  if (msg.message?.conversation) return msg.message.conversation
  if (msg.message?.extendedTextMessage?.text) return msg.message.extendedTextMessage.text
  if (msg.message?.imageMessage?.caption) return `[Image] ${msg.message.imageMessage.caption}`
  if (msg.message?.documentMessage?.fileName) return `[Document] ${msg.message.documentMessage.fileName}`
  if (msg.message?.audioMessage) return '[Audio]'
  if (msg.message?.videoMessage?.caption) return `[Video] ${msg.message.videoMessage.caption}`
  return '[Media]'
}
</script>

<template>
  <Card class="h-full flex flex-col">
    <CardHeader class="pb-3">
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-2">
          <component :is="statusIcon" class="w-5 h-5" :class="[statusColor, { 'animate-spin': hermesStore.isWhatsAppConnecting }]" />
          <CardTitle class="text-lg">WhatsApp Status</CardTitle>
        </div>
        <Button variant="ghost" size="sm" @click="refreshMessages" :disabled="!hermesStore.isWhatsAppConnected">
          <RefreshCw class="w-4 h-4" />
        </Button>
      </div>
      <CardDescription>
        Real-time WhatsApp bridge connection status and messages
      </CardDescription>
    </CardHeader>
    <CardContent class="flex-1 flex flex-col gap-4 min-h-0">
      <!-- Connection Details -->
      <div class="grid grid-cols-2 gap-3">
        <div class="p-3 rounded-lg border">
          <p class="text-xs text-muted-foreground mb-1">Connection</p>
          <div class="flex items-center gap-2">
            <Badge :variant="hermesStore.isWhatsAppConnected ? 'default' : 'destructive'" class="capitalize">
              {{ hermesStore.whatsappHealth?.status || 'unknown' }}
            </Badge>
          </div>
        </div>
        <div class="p-3 rounded-lg border">
          <p class="text-xs text-muted-foreground mb-1">Queue</p>
          <p class="text-lg font-semibold">{{ hermesStore.whatsappHealth?.queueLength || 0 }}</p>
        </div>
      </div>

      <!-- Recent Messages -->
      <div class="flex items-center justify-between">
        <p class="text-sm font-medium flex items-center gap-1.5">
          <MessageSquare class="w-3.5 h-3.5" />
          Recent Messages
        </p>
        <Badge variant="outline">{{ recentMessages.length }}</Badge>
      </div>

      <ScrollArea class="flex-1 min-h-0">
        <div v-if="recentMessages.length === 0" class="flex flex-col items-center justify-center py-8 text-muted-foreground">
          <MessageSquare class="w-8 h-8 mb-2 opacity-50" />
          <p class="text-sm">No messages yet</p>
          <p class="text-xs">Connect WhatsApp to start monitoring</p>
        </div>

        <div v-else class="space-y-2">
          <div
            v-for="msg in recentMessages"
            :key="msg.key.id"
            class="p-2.5 rounded-lg border hover:bg-accent/50 transition-colors"
            :class="msg.key.fromMe ? 'ml-4 bg-primary/5' : 'mr-4'"
          >
            <div class="flex items-center justify-between mb-1">
              <div class="flex items-center gap-1.5">
                <span class="text-xs font-medium">
                  {{ msg.key.fromMe ? 'You' : (msg.pushName || msg.key.remoteJid) }}
                </span>
                <Badge v-if="msg.key.fromMe" variant="outline" class="text-[10px] px-1 py-0">sent</Badge>
              </div>
              <span class="text-[10px] text-muted-foreground">
                {{ formatTimestamp(msg.messageTimestamp) }}
              </span>
            </div>
            <p class="text-sm leading-relaxed">{{ extractText(msg) }}</p>
          </div>
        </div>
      </ScrollArea>
    </CardContent>
  </Card>
</template>
