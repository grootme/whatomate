<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { useHermesStore } from '@/stores/hermes'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import {
  QrCode,
  RefreshCw,
  Smartphone,
  Loader2,
  CheckCircle2,
  WifiOff,
  Copy,
} from 'lucide-vue-next'

const hermesStore = useHermesStore()
const qrRefreshInterval = ref<ReturnType<typeof setInterval> | null>(null)
const autoRefresh = ref(true)

onMounted(async () => {
  await generateQR()
  if (autoRefresh.value) startAutoRefresh()
})

onUnmounted(() => {
  stopAutoRefresh()
})

function startAutoRefresh() {
  // Auto-refresh QR every 15 seconds since they expire
  qrRefreshInterval.value = setInterval(async () => {
    if (!hermesStore.isWhatsAppConnected && autoRefresh.value) {
      await hermesStore.fetchQRCode()
    }
  }, 15000)
}

function stopAutoRefresh() {
  if (qrRefreshInterval.value) {
    clearInterval(qrRefreshInterval.value)
    qrRefreshInterval.value = null
  }
}

async function generateQR() {
  await hermesStore.fetchQRCode()
}

function toggleAutoRefresh() {
  autoRefresh.value = !autoRefresh.value
  if (autoRefresh.value) {
    startAutoRefresh()
  } else {
    stopAutoRefresh()
  }
}
</script>

<template>
  <Card class="h-full flex flex-col">
    <CardHeader class="pb-3">
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-2">
          <QrCode class="w-5 h-5 text-blue-500" />
          <CardTitle class="text-lg">WhatsApp QR Pairing</CardTitle>
        </div>
        <div class="flex items-center gap-2">
          <Badge
            :variant="autoRefresh ? 'default' : 'outline'"
            class="cursor-pointer text-xs"
            @click="toggleAutoRefresh"
          >
            {{ autoRefresh ? 'Auto-refresh ON' : 'Auto-refresh OFF' }}
          </Badge>
          <Button variant="outline" size="sm" @click="generateQR" :disabled="hermesStore.isLoading">
            <RefreshCw class="w-3.5 h-3.5 mr-1" :class="{ 'animate-spin': hermesStore.isLoading }" />
            QR
          </Button>
        </div>
      </div>
      <CardDescription>
        Scan with WhatsApp to pair your account for monitoring
      </CardDescription>
    </CardHeader>
    <CardContent class="flex-1 flex flex-col items-center justify-center gap-4">
      <!-- Already Connected State -->
      <div v-if="hermesStore.isWhatsAppConnected" class="flex flex-col items-center gap-3 py-8">
        <div class="flex items-center justify-center w-20 h-20 rounded-full bg-emerald-500/10">
          <CheckCircle2 class="w-10 h-10 text-emerald-500" />
        </div>
        <p class="text-lg font-semibold text-emerald-500">WhatsApp Connected</p>
        <p class="text-sm text-muted-foreground text-center max-w-xs">
          Your WhatsApp account is linked and being monitored by Hermes Agent.
          Messages are being processed for cognitive capital generation.
        </p>
        <div class="grid grid-cols-2 gap-3 mt-2 w-full max-w-xs">
          <div class="p-3 rounded-lg border text-center">
            <p class="text-xs text-muted-foreground">Queue</p>
            <p class="text-lg font-semibold">{{ hermesStore.whatsappHealth?.queueLength || 0 }}</p>
          </div>
          <div class="p-3 rounded-lg border text-center">
            <p class="text-xs text-muted-foreground">Uptime</p>
            <p class="text-lg font-semibold">{{ Math.floor((hermesStore.whatsappHealth?.uptime || 0) / 60) }}m</p>
          </div>
        </div>
      </div>

      <!-- QR Code Display -->
      <div v-else-if="hermesStore.qrCodeImage" class="flex flex-col items-center gap-4">
        <div class="relative p-4 bg-white rounded-xl shadow-lg">
          <img
            :src="hermesStore.qrCodeImage"
            alt="WhatsApp QR Code"
            class="w-64 h-64"
          />
          <div
            v-if="hermesStore.isLoading"
            class="absolute inset-0 flex items-center justify-center bg-white/80 rounded-xl"
          >
            <Loader2 class="w-8 h-8 animate-spin text-primary" />
          </div>
        </div>
        <div class="flex items-center gap-2 text-sm text-muted-foreground">
          <Smartphone class="w-4 h-4" />
          <span>Open WhatsApp → Linked Devices → Link a Device</span>
        </div>
        <p class="text-xs text-muted-foreground">
          QR codes expire in ~20 seconds. Auto-refresh is {{ autoRefresh ? 'enabled' : 'disabled' }}.
        </p>
      </div>

      <!-- Disconnected / Error State -->
      <div v-else class="flex flex-col items-center gap-3 py-8">
        <div class="flex items-center justify-center w-20 h-20 rounded-full bg-red-500/10">
          <WifiOff class="w-10 h-10 text-red-500" />
        </div>
        <p class="text-lg font-semibold text-red-500">Bridge Offline</p>
        <p class="text-sm text-muted-foreground text-center max-w-xs">
          The WhatsApp bridge is not running. Start the Hermes bridge service to generate a QR code for pairing.
        </p>
        <Button @click="generateQR" :disabled="hermesStore.isLoading">
          <RefreshCw class="w-4 h-4 mr-2" :class="{ 'animate-spin': hermesStore.isLoading }" />
          Try Connect
        </Button>
      </div>

      <!-- Instructions -->
      <div class="w-full mt-auto pt-4 border-t">
        <p class="text-xs font-medium mb-2">How to pair:</p>
        <ol class="text-xs text-muted-foreground space-y-1">
          <li>1. Open WhatsApp on your phone</li>
          <li>2. Go to Settings → Linked Devices</li>
          <li>3. Tap "Link a Device"</li>
          <li>4. Scan the QR code above</li>
          <li>5. Wait for connection confirmation</li>
        </ol>
      </div>
    </CardContent>
  </Card>
</template>
