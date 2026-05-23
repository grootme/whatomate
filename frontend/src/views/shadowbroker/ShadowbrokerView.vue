<template>
  <div class="h-full flex flex-col gap-4 p-4">
    <!-- Header -->
    <div class="flex items-center justify-between">
      <div>
        <h1 class="text-2xl font-bold flex items-center gap-2">
          <Radar class="h-7 w-7" />
          Shadowbroker OSINT
        </h1>
        <p class="text-sm text-muted-foreground mt-1">Plataforma de inteligencia geoespacial en tiempo real con IA</p>
      </div>
      <div class="flex items-center gap-2">
        <Badge :variant="store.isConnected ? 'default' : 'destructive'" class="text-xs">
          <span class="mr-1 h-2 w-2 rounded-full inline-block" :class="store.isConnected ? 'bg-green-400 animate-pulse' : 'bg-red-400'" />
          {{ store.isConnected ? 'Conectado' : 'Desconectado' }}
        </Badge>
        <Badge :variant="store.isAutopilot ? 'default' : 'outline'" class="text-xs">
          {{ store.isAutopilot ? 'Autopilot ON' : 'Autopilot OFF' }}
        </Badge>
      </div>
    </div>

    <!-- Threat Level Banner -->
    <Card v-if="store.threatAssessment" class="border" :class="store.threatLevelBg">
      <CardContent class="p-4">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-3">
            <ShieldAlert class="h-8 w-8" :class="store.threatLevelColor" />
            <div>
              <p class="font-semibold text-lg" :class="store.threatLevelColor">
                THREAT LEVEL: {{ store.threatLevel.toUpperCase() }}
              </p>
              <p class="text-sm text-muted-foreground">{{ store.threatAssessment.description }}</p>
            </div>
          </div>
          <div class="text-right">
            <p class="text-sm text-muted-foreground">Confidence</p>
            <Progress :model-value="store.threatAssessment.confidence * 100" class="w-24 h-2 mt-1" />
            <p class="text-xs text-muted-foreground mt-1">{{ Math.round(store.threatAssessment.confidence * 100) }}%</p>
          </div>
        </div>
        <div v-if="store.threatAssessment.recommendations?.length" class="mt-3 flex flex-wrap gap-2">
          <Badge v-for="(rec, i) in store.threatAssessment.recommendations.slice(0, 4)" :key="i" variant="outline" class="text-xs">
            {{ rec }}
          </Badge>
        </div>
      </CardContent>
    </Card>

    <!-- Tabs -->
    <Tabs v-model="activeTab" class="flex-1 flex flex-col min-h-0">
      <TabsList class="w-fit">
        <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
        <TabsTrigger value="alerts">Alertas</TabsTrigger>
        <TabsTrigger value="events">Eventos</TabsTrigger>
        <TabsTrigger value="analysis">Análisis IA</TabsTrigger>
        <TabsTrigger value="query">Consulta</TabsTrigger>
      </TabsList>

      <!-- Dashboard Tab -->
      <TabsContent value="dashboard" class="flex-1 overflow-auto">
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mt-4">
          <Card>
            <CardContent class="p-4">
              <div class="flex items-center gap-2"><Activity class="h-5 w-5 text-blue-500" /><p class="text-sm text-muted-foreground">Eventos</p></div>
              <p class="text-3xl font-bold mt-2">{{ store.dashboard?.stats?.totalEvents || 0 }}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent class="p-4">
              <div class="flex items-center gap-2"><Brain class="h-5 w-5 text-purple-500" /><p class="text-sm text-muted-foreground">Análisis IA</p></div>
              <p class="text-3xl font-bold mt-2">{{ store.dashboard?.stats?.totalAnalyses || 0 }}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent class="p-4">
              <div class="flex items-center gap-2"><Bell class="h-5 w-5 text-orange-500" /><p class="text-sm text-muted-foreground">Alertas</p></div>
              <p class="text-3xl font-bold mt-2">{{ store.dashboard?.stats?.totalAlerts || 0 }}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent class="p-4">
              <div class="flex items-center gap-2"><AlertTriangle class="h-5 w-5 text-red-500" /><p class="text-sm text-muted-foreground">Críticas</p></div>
              <p class="text-3xl font-bold mt-2">{{ store.criticalAlerts.length }}</p>
            </CardContent>
          </Card>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
          <Card>
            <CardContent class="p-4">
              <h3 class="font-semibold mb-2">Análisis Rápido</h3>
              <p class="text-sm text-muted-foreground mb-3">Ejecutar análisis de amenazas con IA</p>
              <Button @click="store.triggerAnalysis('threat')" :disabled="store.isLoading" size="sm" class="w-full">
                <Radar class="h-4 w-4 mr-2" /> Analizar Amenazas
              </Button>
            </CardContent>
          </Card>
          <Card>
            <CardContent class="p-4">
              <h3 class="font-semibold mb-2">Reporte de Inteligencia</h3>
              <p class="text-sm text-muted-foreground mb-3">Generar reporte completo con IA</p>
              <Button @click="store.generateReport()" :disabled="store.isLoading" size="sm" variant="outline" class="w-full">
                <FileText class="h-4 w-4 mr-2" /> Generar Reporte
              </Button>
            </CardContent>
          </Card>
          <Card>
            <CardContent class="p-4">
              <h3 class="font-semibold mb-2">Autopilot</h3>
              <p class="text-sm text-muted-foreground mb-3">Monitoreo y análisis automático</p>
              <Button @click="store.toggleAutopilot(!store.isAutopilot)" :disabled="store.isLoading" size="sm"
                :variant="store.isAutopilot ? 'destructive' : 'default'" class="w-full">
                <Zap class="h-4 w-4 mr-2" /> {{ store.isAutopilot ? 'Detener' : 'Iniciar' }} Autopilot
              </Button>
            </CardContent>
          </Card>
        </div>

        <Card class="mt-4">
          <CardContent class="p-4">
            <h3 class="font-semibold mb-3">Alertas Recientes</h3>
            <div v-if="store.alerts.length === 0" class="text-sm text-muted-foreground py-4 text-center">Sin alertas activas</div>
            <div v-else class="space-y-2">
              <div v-for="alert in store.alerts.slice(0, 5)" :key="alert.id"
                class="flex items-start gap-3 p-2 rounded-lg border"
                :class="alert.severity === 'critical' ? 'border-red-500/30 bg-red-500/5' : alert.severity === 'high' ? 'border-orange-500/30 bg-orange-500/5' : 'border-border'">
                <AlertTriangle v-if="alert.severity === 'critical'" class="h-4 w-4 text-red-500 mt-0.5 shrink-0" />
                <Bell v-else-if="alert.severity === 'high'" class="h-4 w-4 text-orange-500 mt-0.5 shrink-0" />
                <Info v-else class="h-4 w-4 text-blue-500 mt-0.5 shrink-0" />
                <div class="flex-1 min-w-0">
                  <p class="text-sm font-medium">{{ alert.title }}</p>
                  <p class="text-xs text-muted-foreground truncate">{{ alert.message }}</p>
                </div>
                <div class="flex items-center gap-1 shrink-0">
                  <Badge v-if="alert.whatsapp_sent" variant="outline" class="text-[10px]">WA</Badge>
                  <span class="text-[10px] text-muted-foreground">{{ formatTime(alert.created_at) }}</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </TabsContent>

      <!-- Alerts Tab -->
      <TabsContent value="alerts" class="flex-1 overflow-auto">
        <div class="mt-4 space-y-2">
          <div v-if="store.alerts.length === 0" class="text-center py-12 text-muted-foreground">
            <Bell class="h-12 w-12 mx-auto mb-2 opacity-30" /><p>Sin alertas de inteligencia</p>
          </div>
          <Card v-for="alert in store.alerts" :key="alert.id">
            <CardContent class="p-3">
              <div class="flex items-start justify-between">
                <div class="flex items-start gap-3">
                  <Badge :variant="alert.severity === 'critical' ? 'destructive' : alert.severity === 'high' ? 'default' : 'outline'">
                    {{ alert.severity.toUpperCase() }}
                  </Badge>
                  <div>
                    <p class="font-medium">{{ alert.title }}</p>
                    <p class="text-sm text-muted-foreground mt-1">{{ alert.message }}</p>
                  </div>
                </div>
                <div class="flex items-center gap-2 shrink-0">
                  <Badge v-if="alert.whatsapp_sent" variant="outline" class="text-[10px]">WA</Badge>
                  <span class="text-xs text-muted-foreground">{{ formatTime(alert.created_at) }}</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </TabsContent>

      <!-- Events Tab -->
      <TabsContent value="events" class="flex-1 overflow-auto">
        <div class="mt-4 space-y-2">
          <div v-if="store.events.length === 0" class="text-center py-12 text-muted-foreground">
            <Radar class="h-12 w-12 mx-auto mb-2 opacity-30" />
            <p>Sin eventos de inteligencia</p>
            <p class="text-xs mt-1">Los eventos aparecerán cuando Shadowbroker esté conectado</p>
          </div>
          <Card v-for="event in store.events" :key="event.id">
            <CardContent class="p-3">
              <div class="flex items-start justify-between">
                <div class="flex-1">
                  <div class="flex items-center gap-2">
                    <Badge variant="outline" class="text-[10px]">{{ event.event_type }}</Badge>
                    <Badge variant="outline" class="text-[10px]">{{ event.source }}</Badge>
                    <Badge v-if="event.analyzed" variant="default" class="text-[10px]">IA</Badge>
                  </div>
                  <p class="font-medium mt-1">{{ event.title }}</p>
                  <p class="text-sm text-muted-foreground mt-1">{{ event.description }}</p>
                </div>
                <span class="text-xs text-muted-foreground shrink-0 ml-2">{{ formatTime(event.created_at) }}</span>
              </div>
            </CardContent>
          </Card>
        </div>
      </TabsContent>

      <!-- AI Analysis Tab -->
      <TabsContent value="analysis" class="flex-1 overflow-auto">
        <div class="mt-4">
          <div class="flex gap-2 mb-4">
            <Button @click="store.triggerAnalysis('threat')" :disabled="store.isLoading" size="sm"><ShieldAlert class="h-4 w-4 mr-2" /> Amenazas</Button>
            <Button @click="store.triggerAnalysis('geospatial')" :disabled="store.isLoading" size="sm" variant="outline"><Globe class="h-4 w-4 mr-2" /> Geoespacial</Button>
            <Button @click="store.triggerAnalysis('anomaly')" :disabled="store.isLoading" size="sm" variant="outline"><Search class="h-4 w-4 mr-2" /> Anomalías</Button>
            <Button @click="store.triggerAnalysis('correlate')" :disabled="store.isLoading" size="sm" variant="outline"><Link class="h-4 w-4 mr-2" /> Correlación</Button>
          </div>
          <Card v-if="store.lastReport" class="mb-4">
            <CardContent class="p-4">
              <h3 class="font-semibold mb-2">Último Reporte</h3>
              <div class="whitespace-pre-wrap text-sm">{{ store.lastReport }}</div>
            </CardContent>
          </Card>
          <div v-if="store.analyses.length === 0" class="text-center py-12 text-muted-foreground">
            <Brain class="h-12 w-12 mx-auto mb-2 opacity-30" /><p>Sin análisis de IA</p>
          </div>
          <Card v-for="analysis in store.analyses" :key="analysis.id" class="mb-3">
            <CardContent class="p-4">
              <div class="flex items-center justify-between mb-2">
                <div class="flex items-center gap-2">
                  <Badge variant="outline">{{ analysis.analysis_type }}</Badge>
                  <Badge variant="outline" class="text-[10px]">{{ analysis.model_used }}</Badge>
                </div>
                <span class="text-xs text-muted-foreground">{{ Math.round(analysis.confidence * 100) }}% · {{ formatTime(analysis.created_at) }}</span>
              </div>
              <p class="text-sm">{{ analysis.summary }}</p>
            </CardContent>
          </Card>
        </div>
      </TabsContent>

      <!-- NL Query Tab -->
      <TabsContent value="query" class="flex-1 overflow-auto">
        <div class="mt-4">
          <Card>
            <CardContent class="p-4">
              <h3 class="font-semibold mb-2">Consulta en Lenguaje Natural</h3>
              <p class="text-sm text-muted-foreground mb-3">Pregunta sobre la situación de inteligencia actual</p>
              <div class="flex gap-2">
                <Input v-model="queryText" placeholder="Ej: ¿Cuál es el nivel de amenaza actual?" @keyup.enter="runQuery" :disabled="store.isLoading" class="flex-1" />
                <Button @click="runQuery" :disabled="store.isLoading || !queryText.trim()"><Search class="h-4 w-4" /></Button>
              </div>
            </CardContent>
          </Card>
          <Card v-if="store.queryResult" class="mt-4">
            <CardContent class="p-4">
              <div class="flex items-center gap-2 mb-3">
                <Brain class="h-5 w-5 text-purple-500" /><h3 class="font-semibold">Respuesta IA</h3>
                <Badge variant="outline" class="text-[10px]">{{ Math.round(store.queryResult.confidence * 100) }}%</Badge>
              </div>
              <div class="whitespace-pre-wrap text-sm">{{ store.queryResult.answer }}</div>
              <div v-if="store.queryResult.sources?.length" class="mt-3 flex flex-wrap gap-1">
                <span class="text-xs text-muted-foreground">Fuentes:</span>
                <Badge v-for="(src, i) in store.queryResult.sources" :key="i" variant="outline" class="text-[10px]">{{ src }}</Badge>
              </div>
            </CardContent>
          </Card>
          <div class="mt-4">
            <p class="text-sm text-muted-foreground mb-2">Consultas sugeridas:</p>
            <div class="flex flex-wrap gap-2">
              <Button v-for="q in suggestedQueries" :key="q" @click="queryText = q; runQuery()" variant="outline" size="sm" class="text-xs">{{ q }}</Button>
            </div>
          </div>
        </div>
      </TabsContent>
    </Tabs>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { useShadowbrokerStore } from '@/stores/shadowbroker'
import { Radar, ShieldAlert, Activity, Brain, Bell, AlertTriangle, Info, FileText, Zap, Globe, Search, Link } from 'lucide-vue-next'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Progress } from '@/components/ui/progress'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

const store = useShadowbrokerStore()
const activeTab = ref('dashboard')
const queryText = ref('')
let refreshTimer: ReturnType<typeof setInterval> | null = null

const suggestedQueries = [
  '¿Cuál es el nivel de amenaza actual?',
  'Resume la actividad de vuelos militares',
  '¿Hay anomalías en los datos SIGINT?',
  'Correlación entre GPS jamming y vuelos',
  'Estado de la red mesh InfoNet',
]

function formatTime(dateStr: string): string {
  if (!dateStr) return ''
  try {
    const d = new Date(dateStr + (dateStr.includes('Z') || dateStr.includes('+') ? '' : 'Z'))
    return d.toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })
  } catch { return dateStr }
}

async function runQuery() {
  if (!queryText.value.trim()) return
  await store.naturalLanguageQuery(queryText.value.trim())
}

onMounted(async () => {
  await store.initialize()
  refreshTimer = setInterval(() => { store.checkHealth(); store.fetchDashboard() }, 15000)
})

onUnmounted(() => { if (refreshTimer) clearInterval(refreshTimer) })
</script>
