<script setup lang="ts">
import { ref } from 'vue'
import { useCognitiveStore } from '@/stores/cognitive'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Badge } from '@/components/ui/badge'
import {
  Search,
  Loader2,
  FileText,
  Users,
  GitBranch,
  TrendingUp,
  Brain,
} from 'lucide-vue-next'

const cognitiveStore = useCognitiveStore()
const searchType = ref('')

async function doSearch() {
  await cognitiveStore.search(undefined, searchType.value || undefined)
}

function getIconForType(type: string) {
  switch (type) {
    case 'message': return FileText
    case 'entity': return Users
    case 'decision': return GitBranch
    case 'pattern': return TrendingUp
    case 'summary': return Brain
    default: return FileText
  }
}

function getTypeColor(type: string) {
  switch (type) {
    case 'message': return 'text-blue-500'
    case 'entity': return 'text-emerald-500'
    case 'decision': return 'text-violet-500'
    case 'pattern': return 'text-orange-500'
    case 'summary': return 'text-amber-500'
    default: return 'text-muted-foreground'
  }
}
</script>

<template>
  <Card class="h-full flex flex-col">
    <CardHeader class="pb-3">
      <CardTitle class="text-lg flex items-center gap-2">
        <Search class="w-5 h-5 text-blue-500" />
        Knowledge Search (FTS5)
      </CardTitle>
    </CardHeader>
    <CardContent class="flex-1 flex flex-col gap-3 min-h-0">
      <!-- Search Input -->
      <div class="flex gap-2">
        <Input
          v-model="cognitiveStore.searchQuery"
          placeholder="Search messages, entities, decisions, patterns..."
          class="flex-1"
          @keydown.enter="doSearch"
        />
        <select
          v-model="searchType"
          class="h-9 rounded-md border bg-background px-3 text-sm"
        >
          <option value="">All Types</option>
          <option value="message">Messages</option>
          <option value="entity">Entities</option>
          <option value="decision">Decisions</option>
          <option value="pattern">Patterns</option>
          <option value="summary">Summaries</option>
        </select>
        <Button @click="doSearch" :disabled="cognitiveStore.isLoading">
          <Loader2 v-if="cognitiveStore.isLoading" class="w-4 h-4 animate-spin" />
          <Search v-else class="w-4 h-4" />
        </Button>
      </div>

      <!-- Results -->
      <ScrollArea class="flex-1 min-h-0">
        <div v-if="cognitiveStore.searchResults" class="space-y-2">
          <p class="text-xs text-muted-foreground mb-2">
            {{ cognitiveStore.searchResults.total }} results for "{{ cognitiveStore.searchResults.query }}"
          </p>

          <div
            v-for="result in cognitiveStore.searchResults.results"
            :key="`${result.type}-${result.id}`"
            class="p-3 rounded-lg border hover:bg-accent/50 transition-colors"
          >
            <div class="flex items-center justify-between mb-1.5">
              <div class="flex items-center gap-2">
                <component :is="getIconForType(result.type)" class="w-4 h-4" :class="getTypeColor(result.type)" />
                <Badge variant="outline" class="text-[10px] capitalize">{{ result.type }}</Badge>
                <span class="text-[10px] text-muted-foreground">ID: {{ result.id }}</span>
              </div>
              <span class="text-[10px] text-muted-foreground">Rank: {{ result.rank.toFixed(4) }}</span>
            </div>
            <p class="text-sm leading-relaxed">{{ result.content }}</p>
          </div>

          <div v-if="cognitiveStore.searchResults.results.length === 0" class="text-center py-8 text-muted-foreground">
            <Search class="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p class="text-sm">No results found</p>
          </div>
        </div>

        <div v-else class="flex flex-col items-center justify-center py-12 text-muted-foreground">
          <Search class="w-10 h-10 mb-3 opacity-50" />
          <p class="text-sm">Search across all knowledge</p>
          <p class="text-xs mt-1">Messages, entities, decisions, patterns and summaries</p>
        </div>
      </ScrollArea>
    </CardContent>
  </Card>
</template>
