<script setup lang="ts">
import { onMounted } from 'vue'
import { useHermesStore } from '@/stores/hermes'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import {
  Clock,
  Play,
  Pause,
  RefreshCw,
  Plus,
  CalendarClock,
} from 'lucide-vue-next'

const hermesStore = useHermesStore()

onMounted(async () => {
  await hermesStore.fetchCronJobs()
})

async function toggleJob(jobId: string, currentlyEnabled: boolean) {
  await hermesStore.toggleCronJob(jobId, currentlyEnabled ? 'pause' : 'resume')
}

function formatSchedule(schedule: string): string {
  return schedule
}
</script>

<template>
  <Card class="h-full flex flex-col">
    <CardHeader class="pb-3">
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-2">
          <CalendarClock class="w-5 h-5 text-orange-500" />
          <CardTitle class="text-lg">Scheduled Tasks</CardTitle>
        </div>
        <Button variant="outline" size="sm" @click="hermesStore.fetchCronJobs()">
          <RefreshCw class="w-4 h-4" />
        </Button>
      </div>
    </CardHeader>
    <CardContent class="flex-1 flex flex-col gap-3 min-h-0">
      <ScrollArea class="flex-1 min-h-0">
        <div class="space-y-3">
          <div
            v-for="job in hermesStore.cronJobs"
            :key="job.id"
            class="p-3 rounded-lg border"
          >
            <div class="flex items-center justify-between mb-2">
              <div class="flex items-center gap-2">
                <Clock class="w-3.5 h-3.5 text-muted-foreground" />
                <span class="text-sm font-medium">{{ job.name }}</span>
              </div>
              <div class="flex items-center gap-2">
                <Badge :variant="job.enabled ? 'default' : 'outline'" class="text-[10px]">
                  {{ job.enabled ? 'Active' : 'Paused' }}
                </Badge>
                <Switch
                  :checked="job.enabled"
                  @update:checked="toggleJob(job.id, job.enabled)"
                />
              </div>
            </div>
            <p class="text-xs text-muted-foreground mb-1 line-clamp-2">{{ job.prompt }}</p>
            <div class="flex items-center gap-3 text-xs text-muted-foreground">
              <span class="flex items-center gap-1">
                <CalendarClock class="w-3 h-3" />
                {{ job.schedule }}
              </span>
              <span>Platform: {{ job.platform }}</span>
            </div>
          </div>

          <div v-if="hermesStore.cronJobs.length === 0" class="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <CalendarClock class="w-8 h-8 mb-2 opacity-50" />
            <p class="text-sm">No scheduled tasks</p>
            <p class="text-xs mt-1">Create cron jobs to automate agent tasks</p>
          </div>
        </div>
      </ScrollArea>
    </CardContent>
  </Card>
</template>
