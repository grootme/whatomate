<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useHermesStore } from '@/stores/hermes'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Badge } from '@/components/ui/badge'
import {
  Search,
  Activity,
  MessageSquare,
  RefreshCw,
} from 'lucide-vue-next'

const hermesStore = useHermesStore()
const searchQuery = ref('')
const searchResults = ref<any[]>([])

onMounted(async () => {
  await hermesStore.fetchSessions()
})

async function search() {
  if (searchQuery.value.trim()) {
    searchResults.value = await hermesStore.searchSessions(searchQuery.value)
  }
}

async function refresh() {
  await hermesStore.fetchSessions()
  searchResults.value = []
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleString()
}
</script>

<template>
  <Card class="h-full flex flex-col">
    <CardHeader class="pb-3">
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-2">
          <Activity class="w-5 h-5 text-purple-500" />
          <CardTitle class="text-lg">Agent Sessions</CardTitle>
        </div>
        <Button variant="ghost" size="sm" @click="refresh">
          <RefreshCw class="w-4 h-4" />
        </Button>
      </div>
    </CardHeader>
    <CardContent class="flex-1 flex flex-col gap-3 min-h-0">
      <!-- Search -->
      <div class="flex gap-2">
        <Input
          v-model="searchQuery"
          placeholder="Search sessions (FTS5)..."
          @keydown.enter="search"
          class="flex-1"
        />
        <Button variant="outline" size="sm" @click="search">
          <Search class="w-4 h-4" />
        </Button>
      </div>

      <!-- Sessions List -->
      <ScrollArea class="flex-1 min-h-0">
        <div class="space-y-2">
          <div
            v-for="session in (searchResults.length ? searchResults : hermesStore.sessions)"
            :key="session.id"
            class="p-3 rounded-lg border hover:bg-accent/50 transition-colors"
          >
            <div class="flex items-center justify-between mb-1">
              <div class="flex items-center gap-2">
                <MessageSquare class="w-3.5 h-3.5 text-muted-foreground" />
                <span class="text-sm font-medium truncate max-w-[200px]">
                  {{ session.session_key || session.id }}
                </span>
              </div>
              <Badge variant="outline" class="text-[10px]">
                {{ session.platform }}
              </Badge>
            </div>
            <div class="flex items-center justify-between text-xs text-muted-foreground">
              <span>{{ session.messages_count }} messages</span>
              <span>{{ formatTime(session.updated_at) }}</span>
            </div>
          </div>

          <div v-if="hermesStore.sessions.length === 0 && searchResults.length === 0" class="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <Activity class="w-8 h-8 mb-2 opacity-50" />
            <p class="text-sm">No sessions yet</p>
          </div>
        </div>
      </ScrollArea>
    </CardContent>
  </Card>
</template>
