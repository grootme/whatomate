<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import { useHermesStore } from '@/stores/hermes'
import { useCognitiveStore } from '@/stores/cognitive'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import WhatsAppStatus from '@/components/hermes/WhatsAppStatus.vue'
import WhatsAppQRPairing from '@/components/hermes/WhatsAppQRPairing.vue'
import HermesChat from '@/components/hermes/HermesChat.vue'
import HermesSessions from '@/components/hermes/HermesSessions.vue'
import HermesCronJobs from '@/components/hermes/HermesCronJobs.vue'
import {
  Bot,
  Wifi,
  WifiOff,
  RefreshCw,
  Activity,
  MessageSquare,
  Clock,
  Cpu,
  Zap,
  Loader2,
} from 'lucide-vue-next'

const hermesStore = useHermesStore()
const cognitiveStore = useCognitiveStore()
const activeTab = ref('whatsapp')
let pollInterval: ReturnType<typeof setInterval> | null = null

onMounted(async () => {
  await hermesStore.initialize()
  startPolling()
})

onUnmounted(() => {
  stopPolling()
})

function startPolling() {
  pollInterval = setInterval(async () => {
    await Promise.allSettled([
      hermesStore.checkWhatsAppHealth(),
      hermesStore.checkApiHealth(),
    ])
  }, 10000)
}

function stopPolling() {
  if (pollInterval) {
    clearInterval(pollInterval)
    pollInterval = null
  }
}

async function refreshAll() {
  await hermesStore.initialize()
}

function formatUptime(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  return `${h}h ${m}m`
}
</script>

<template>
  <div class="flex flex-col h-full gap-6 p-6">
    <!-- Header -->
    <div class="flex items-center justify-between">
      <div class="flex items-center gap-3">
        <div class="flex items-center justify-center w-10 h-10 rounded-lg bg-emerald-500/10">
          <Bot class="w-5 h-5 text-emerald-500" />
        </div>
        <div>
          <h1 class="text-2xl font-bold tracking-tight">Hermes Agent</h1>
          <p class="text-sm text-muted-foreground">
            WhatsApp monitoring & AI agent control
          </p>
        </div>
      </div>
      <div class="flex items-center gap-3">
        <!-- Connection Status Badges -->
        <div class="flex items-center gap-2">
          <Badge
            :variant="hermesStore.isApiConnected ? 'default' : 'destructive'"
            class="flex items-center gap-1.5"
          >
            <component :is="hermesStore.isApiConnected ? Wifi : WifiOff" class="w-3 h-3" />
            API {{ hermesStore.isApiConnected ? 'Online' : 'Offline' }}
          </Badge>
          <Badge
            :variant="hermesStore.isWhatsAppConnected ? 'default' : 'destructive'"
            class="flex items-center gap-1.5"
          >
            <component :is="hermesStore.isWhatsAppConnected ? Wifi : WifiOff" class="w-3 h-3" />
            WhatsApp {{ hermesStore.isWhatsAppConnected ? 'Connected' : 'Disconnected' }}
          </Badge>
        </div>
        <Button variant="outline" size="sm" @click="refreshAll" :disabled="hermesStore.isLoading">
          <RefreshCw class="w-4 h-4 mr-1.5" :class="{ 'animate-spin': hermesStore.isLoading }" />
          Refresh
        </Button>
      </div>
    </div>

    <!-- Stats Cards -->
    <div class="grid grid-cols-1 md:grid-cols-4 gap-4">
      <Card>
        <CardContent class="p-4">
          <div class="flex items-center gap-3">
            <div class="flex items-center justify-center w-9 h-9 rounded-md bg-blue-500/10">
              <Activity class="w-4 h-4 text-blue-500" />
            </div>
            <div>
              <p class="text-xs text-muted-foreground">Gateway</p>
              <p class="text-sm font-semibold capitalize">{{ hermesStore.gatewayState }}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent class="p-4">
          <div class="flex items-center gap-3">
            <div class="flex items-center justify-center w-9 h-9 rounded-md bg-emerald-500/10">
              <MessageSquare class="w-4 h-4 text-emerald-500" />
            </div>
            <div>
              <p class="text-xs text-muted-foreground">WhatsApp</p>
              <p class="text-sm font-semibold capitalize">{{ hermesStore.whatsappHealth?.status || 'unknown' }}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent class="p-4">
          <div class="flex items-center gap-3">
            <div class="flex items-center justify-center w-9 h-9 rounded-md bg-purple-500/10">
              <Clock class="w-4 h-4 text-purple-500" />
            </div>
            <div>
              <p class="text-xs text-muted-foreground">Uptime</p>
              <p class="text-sm font-semibold">{{ formatUptime(hermesStore.uptimeSeconds) }}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent class="p-4">
          <div class="flex items-center gap-3">
            <div class="flex items-center justify-center w-9 h-9 rounded-md bg-orange-500/10">
              <Cpu class="w-4 h-4 text-orange-500" />
            </div>
            <div>
              <p class="text-xs text-muted-foreground">Platforms</p>
              <p class="text-sm font-semibold">{{ hermesStore.activePlatforms.length }} active</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>

    <!-- Main Tabs -->
    <Tabs v-model="activeTab" class="flex-1 flex flex-col min-h-0">
      <TabsList class="w-fit">
        <TabsTrigger value="whatsapp" class="flex items-center gap-1.5">
          <Wifi class="w-3.5 h-3.5" />
          WhatsApp
        </TabsTrigger>
        <TabsTrigger value="chat" class="flex items-center gap-1.5">
          <MessageSquare class="w-3.5 h-3.5" />
          Agent Chat
        </TabsTrigger>
        <TabsTrigger value="sessions" class="flex items-center gap-1.5">
          <Activity class="w-3.5 h-3.5" />
          Sessions
        </TabsTrigger>
        <TabsTrigger value="cron" class="flex items-center gap-1.5">
          <Clock class="w-3.5 h-3.5" />
          Scheduled
        </TabsTrigger>
      </TabsList>

      <TabsContent value="whatsapp" class="flex-1 mt-4 overflow-hidden">
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-4 h-full">
          <WhatsAppStatus />
          <WhatsAppQRPairing />
        </div>
      </TabsContent>

      <TabsContent value="chat" class="flex-1 mt-4 overflow-hidden">
        <HermesChat />
      </TabsContent>

      <TabsContent value="sessions" class="flex-1 mt-4 overflow-hidden">
        <HermesSessions />
      </TabsContent>

      <TabsContent value="cron" class="flex-1 mt-4 overflow-hidden">
        <HermesCronJobs />
      </TabsContent>
    </Tabs>

    <!-- Error Banner -->
    <div
      v-if="hermesStore.error"
      class="fixed bottom-4 right-4 max-w-md p-4 bg-destructive/10 border border-destructive/20 rounded-lg shadow-lg"
    >
      <p class="text-sm text-destructive font-medium">Error: {{ hermesStore.error }}</p>
    </div>
  </div>
</template>
