<script setup lang="ts">
import { onMounted, ref, computed } from 'vue'
import { useCognitiveStore } from '@/stores/cognitive'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Separator } from '@/components/ui/separator'
import KnowledgeSearch from '@/components/cognitive/KnowledgeSearch.vue'
import {
  Brain,
  Search,
  Users,
  GitBranch,
  TrendingUp,
  FileText,
  RefreshCw,
  Sparkles,
  BarChart3,
  AlertCircle,
  Layers,
  Plus,
  Loader2,
  Lightbulb,
  Target,
} from 'lucide-vue-next'

const cognitiveStore = useCognitiveStore()
const activeTab = ref('dashboard')

onMounted(async () => {
  await cognitiveStore.initialize()
})

async function refresh() {
  await cognitiveStore.initialize()
}

async function generateSummary() {
  await cognitiveStore.generateSummary('daily')
}

async function extractEntities() {
  await cognitiveStore.extractEntities()
}

async function detectPatterns() {
  await cognitiveStore.detectPatterns()
}
</script>

<template>
  <div class="flex flex-col h-full gap-6 p-6">
    <!-- Header -->
    <div class="flex items-center justify-between">
      <div class="flex items-center gap-3">
        <div class="flex items-center justify-center w-10 h-10 rounded-lg bg-amber-500/10">
          <Brain class="w-5 h-5 text-amber-500" />
        </div>
        <div>
          <h1 class="text-2xl font-bold tracking-tight">Cognitive Capital</h1>
          <p class="text-sm text-muted-foreground">
            Knowledge base, entities, decisions & patterns from WhatsApp
          </p>
        </div>
      </div>
      <div class="flex items-center gap-2">
        <Button variant="outline" size="sm" @click="extractEntities" :disabled="cognitiveStore.isLoading">
          <Sparkles class="w-3.5 h-3.5 mr-1.5" />
          Extract Entities
        </Button>
        <Button variant="outline" size="sm" @click="detectPatterns" :disabled="cognitiveStore.isLoading">
          <TrendingUp class="w-3.5 h-3.5 mr-1.5" />
          Detect Patterns
        </Button>
        <Button variant="outline" size="sm" @click="generateSummary" :disabled="cognitiveStore.isLoading">
          <FileText class="w-3.5 h-3.5 mr-1.5" />
          Summarize
        </Button>
        <Button variant="outline" size="sm" @click="refresh" :disabled="cognitiveStore.isLoading">
          <RefreshCw class="w-3.5 h-3.5" :class="{ 'animate-spin': cognitiveStore.isLoading }" />
        </Button>
      </div>
    </div>

    <!-- Stats Cards -->
    <div class="grid grid-cols-2 md:grid-cols-5 gap-4">
      <Card>
        <CardContent class="p-4">
          <div class="flex items-center gap-3">
            <div class="flex items-center justify-center w-9 h-9 rounded-md bg-blue-500/10">
              <FileText class="w-4 h-4 text-blue-500" />
            </div>
            <div>
              <p class="text-xs text-muted-foreground">Messages</p>
              <p class="text-lg font-semibold">{{ cognitiveStore.totalMessages }}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent class="p-4">
          <div class="flex items-center gap-3">
            <div class="flex items-center justify-center w-9 h-9 rounded-md bg-emerald-500/10">
              <Users class="w-4 h-4 text-emerald-500" />
            </div>
            <div>
              <p class="text-xs text-muted-foreground">Entities</p>
              <p class="text-lg font-semibold">{{ cognitiveStore.totalEntities }}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent class="p-4">
          <div class="flex items-center gap-3">
            <div class="flex items-center justify-center w-9 h-9 rounded-md bg-violet-500/10">
              <GitBranch class="w-4 h-4 text-violet-500" />
            </div>
            <div>
              <p class="text-xs text-muted-foreground">Decisions</p>
              <p class="text-lg font-semibold">{{ cognitiveStore.totalDecisions }}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent class="p-4">
          <div class="flex items-center gap-3">
            <div class="flex items-center justify-center w-9 h-9 rounded-md bg-orange-500/10">
              <TrendingUp class="w-4 h-4 text-orange-500" />
            </div>
            <div>
              <p class="text-xs text-muted-foreground">Patterns</p>
              <p class="text-lg font-semibold">{{ cognitiveStore.totalPatterns }}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent class="p-4">
          <div class="flex items-center gap-3">
            <div class="flex items-center justify-center w-9 h-9 rounded-md bg-red-500/10">
              <Target class="w-4 h-4 text-red-500" />
            </div>
            <div>
              <p class="text-xs text-muted-foreground">Pending</p>
              <p class="text-lg font-semibold">{{ cognitiveStore.pendingDecisions }}</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>

    <!-- Main Content Tabs -->
    <Tabs v-model="activeTab" class="flex-1 flex flex-col min-h-0">
      <TabsList class="w-fit">
        <TabsTrigger value="dashboard" class="flex items-center gap-1.5">
          <BarChart3 class="w-3.5 h-3.5" />
          Dashboard
        </TabsTrigger>
        <TabsTrigger value="entities" class="flex items-center gap-1.5">
          <Users class="w-3.5 h-3.5" />
          Entities
        </TabsTrigger>
        <TabsTrigger value="decisions" class="flex items-center gap-1.5">
          <GitBranch class="w-3.5 h-3.5" />
          Decisions
        </TabsTrigger>
        <TabsTrigger value="patterns" class="flex items-center gap-1.5">
          <TrendingUp class="w-3.5 h-3.5" />
          Patterns
        </TabsTrigger>
        <TabsTrigger value="search" class="flex items-center gap-1.5">
          <Search class="w-3.5 h-3.5" />
          Search
        </TabsTrigger>
      </TabsList>

      <!-- Dashboard Tab -->
      <TabsContent value="dashboard" class="flex-1 mt-4 overflow-auto">
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <!-- Latest Summary -->
          <Card>
            <CardHeader class="pb-2">
              <CardTitle class="text-base flex items-center gap-2">
                <FileText class="w-4 h-4 text-blue-500" />
                Latest Summary
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div v-if="cognitiveStore.latestSummary" class="space-y-3">
                <Badge variant="outline">{{ cognitiveStore.latestSummary.period }}</Badge>
                <p class="text-sm leading-relaxed">{{ cognitiveStore.latestSummary.summary }}</p>
                <div class="flex flex-wrap gap-1.5">
                  <Badge
                    v-for="topic in cognitiveStore.latestSummary.key_topics"
                    :key="topic"
                    variant="secondary"
                    class="text-[10px]"
                  >
                    {{ topic }}
                  </Badge>
                </div>
              </div>
              <p v-else class="text-sm text-muted-foreground">No summaries generated yet. Click "Summarize" to create one.</p>
            </CardContent>
          </Card>

          <!-- Top Entities -->
          <Card>
            <CardHeader class="pb-2">
              <CardTitle class="text-base flex items-center gap-2">
                <Users class="w-4 h-4 text-emerald-500" />
                Top Entities
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div class="space-y-2">
                <div
                  v-for="entity in cognitiveStore.topEntities.slice(0, 8)"
                  :key="entity.id"
                  class="flex items-center justify-between py-1.5"
                >
                  <div class="flex items-center gap-2">
                    <Badge variant="outline" class="text-[10px] capitalize">{{ entity.type }}</Badge>
                    <span class="text-sm">{{ entity.name }}</span>
                  </div>
                  <span class="text-xs text-muted-foreground">{{ entity.mention_count }} mentions</span>
                </div>
                <p v-if="cognitiveStore.topEntities.length === 0" class="text-sm text-muted-foreground">No entities extracted yet.</p>
              </div>
            </CardContent>
          </Card>

          <!-- Recent Decisions -->
          <Card>
            <CardHeader class="pb-2">
              <CardTitle class="text-base flex items-center gap-2">
                <GitBranch class="w-4 h-4 text-violet-500" />
                Recent Decisions
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div class="space-y-2">
                <div
                  v-for="decision in cognitiveStore.recentDecisions.slice(0, 5)"
                  :key="decision.id"
                  class="p-2.5 rounded-lg border"
                >
                  <div class="flex items-center justify-between mb-1">
                    <span class="text-sm font-medium">{{ decision.title }}</span>
                    <Badge :variant="decision.status === 'pending' ? 'destructive' : 'default'" class="text-[10px] capitalize">
                      {{ decision.status }}
                    </Badge>
                  </div>
                  <p class="text-xs text-muted-foreground line-clamp-2">{{ decision.description }}</p>
                </div>
                <p v-if="cognitiveStore.recentDecisions.length === 0" class="text-sm text-muted-foreground">No decisions recorded yet.</p>
              </div>
            </CardContent>
          </Card>

          <!-- Topic Distribution -->
          <Card>
            <CardHeader class="pb-2">
              <CardTitle class="text-base flex items-center gap-2">
                <Layers class="w-4 h-4 text-orange-500" />
                Topic Distribution
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div class="space-y-2">
                <div
                  v-for="topic in cognitiveStore.topicDistribution.slice(0, 10)"
                  :key="topic.topic"
                  class="flex items-center gap-3"
                >
                  <span class="text-sm flex-1 truncate">{{ topic.topic }}</span>
                  <div class="w-24 h-2 bg-muted rounded-full overflow-hidden">
                    <div
                      class="h-full bg-orange-500 rounded-full"
                      :style="{ width: Math.min((topic.count / (cognitiveStore.topicDistribution[0]?.count || 1)) * 100, 100) + '%' }"
                    />
                  </div>
                  <span class="text-xs text-muted-foreground w-8 text-right">{{ topic.count }}</span>
                </div>
                <p v-if="cognitiveStore.topicDistribution.length === 0" class="text-sm text-muted-foreground">No topics detected yet.</p>
              </div>
            </CardContent>
          </Card>
        </div>
      </TabsContent>

      <!-- Entities Tab -->
      <TabsContent value="entities" class="flex-1 mt-4 overflow-auto">
        <div class="flex items-center gap-2 mb-4">
          <select
            v-model="cognitiveStore.selectedEntityType"
            @change="cognitiveStore.fetchEntities()"
            class="h-9 rounded-md border bg-background px-3 text-sm"
          >
            <option v-for="opt in cognitiveStore.entityTypeOptions" :key="opt.value" :value="opt.value">
              {{ opt.label }}
            </option>
          </select>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          <Card v-for="entity in cognitiveStore.entities" :key="entity.id">
            <CardContent class="p-4">
              <div class="flex items-center justify-between mb-2">
                <Badge variant="outline" class="text-[10px] capitalize">{{ entity.type }}</Badge>
                <span class="text-[10px] text-muted-foreground">{{ entity.mention_count }} mentions</span>
              </div>
              <h4 class="font-medium text-sm mb-1">{{ entity.name }}</h4>
              <p class="text-xs text-muted-foreground">First seen: {{ entity.first_seen }}</p>
            </CardContent>
          </Card>
        </div>

        <div v-if="cognitiveStore.entities.length === 0" class="flex flex-col items-center justify-center py-12 text-muted-foreground">
          <Users class="w-10 h-10 mb-3 opacity-50" />
          <p class="text-sm">No entities found</p>
          <p class="text-xs mt-1">Extract entities from your WhatsApp messages</p>
        </div>
      </TabsContent>

      <!-- Decisions Tab -->
      <TabsContent value="decisions" class="flex-1 mt-4 overflow-auto">
        <div class="flex items-center gap-2 mb-4">
          <select
            v-model="cognitiveStore.selectedDecisionStatus"
            @change="cognitiveStore.fetchDecisions()"
            class="h-9 rounded-md border bg-background px-3 text-sm"
          >
            <option v-for="opt in cognitiveStore.decisionStatusOptions" :key="opt.value" :value="opt.value">
              {{ opt.label }}
            </option>
          </select>
        </div>

        <div class="space-y-3">
          <Card v-for="decision in cognitiveStore.decisions" :key="decision.id">
            <CardContent class="p-4">
              <div class="flex items-center justify-between mb-2">
                <h4 class="font-medium">{{ decision.title }}</h4>
                <Badge :variant="decision.status === 'pending' ? 'destructive' : decision.status === 'made' ? 'default' : 'outline'" class="capitalize">
                  {{ decision.status }}
                </Badge>
              </div>
              <p class="text-sm text-muted-foreground mb-2">{{ decision.description }}</p>
              <div class="flex items-center gap-3 text-xs text-muted-foreground">
                <span>Confidence: {{ (decision.confidence * 100).toFixed(0) }}%</span>
                <span>By: {{ decision.decision_maker }}</span>
                <span>{{ decision.created_at }}</span>
              </div>
            </CardContent>
          </Card>
        </div>

        <div v-if="cognitiveStore.decisions.length === 0" class="flex flex-col items-center justify-center py-12 text-muted-foreground">
          <GitBranch class="w-10 h-10 mb-3 opacity-50" />
          <p class="text-sm">No decisions recorded</p>
        </div>
      </TabsContent>

      <!-- Patterns Tab -->
      <TabsContent value="patterns" class="flex-1 mt-4 overflow-auto">
        <div class="space-y-3">
          <Card v-for="pattern in cognitiveStore.patterns" :key="pattern.id">
            <CardContent class="p-4">
              <div class="flex items-center justify-between mb-2">
                <div class="flex items-center gap-2">
                  <Badge variant="outline" class="text-[10px] capitalize">{{ pattern.pattern_type }}</Badge>
                  <h4 class="font-medium text-sm">{{ pattern.name }}</h4>
                </div>
                <span class="text-xs text-muted-foreground">
                  Confidence: {{ (pattern.confidence * 100).toFixed(0) }}%
                </span>
              </div>
              <p class="text-sm text-muted-foreground">{{ pattern.description }}</p>
              <div class="flex items-center gap-3 text-xs text-muted-foreground mt-2">
                <span>Frequency: {{ pattern.frequency }}</span>
                <span>Last: {{ pattern.last_observed }}</span>
              </div>
            </CardContent>
          </Card>
        </div>

        <div v-if="cognitiveStore.patterns.length === 0" class="flex flex-col items-center justify-center py-12 text-muted-foreground">
          <TrendingUp class="w-10 h-10 mb-3 opacity-50" />
          <p class="text-sm">No patterns detected</p>
          <p class="text-xs mt-1">Run "Detect Patterns" to analyze your data</p>
        </div>
      </TabsContent>

      <!-- Search Tab -->
      <TabsContent value="search" class="flex-1 mt-4 overflow-hidden">
        <KnowledgeSearch />
      </TabsContent>
    </Tabs>
  </div>
</template>
