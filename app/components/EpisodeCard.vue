<script setup lang="ts">
import type { CoreDataset } from '~/composables/useDataset'
import type { Episode, Plotline } from '~/types'
import { TAG_COLOR } from '~/types'

const props = defineProps<{
  episode: Episode
  ds: CoreDataset
  /** From the full dataset tier — 所屬故事線 badges appear once it loads. */
  plotlinesById?: Map<string, Plotline> | null
}>()

const tags = computed(() => props.episode.tagIds.map(id => props.ds.tagsById.get(id)).filter(isPresent))

// keep cards compact: an episode can sit in up to 11 plot lines. Festival
// plot lines share their name with the episode's festival tag — showing both
// would read as a duplicate badge, so those are skipped.
const PLOTLINES_SHOWN = 2
const plotlines = computed(() => {
  const tagLabels = new Set(tags.value.map(t => t.label))
  return props.episode.plotlineIds
    .map(id => props.plotlinesById?.get(id))
    .filter(isPresent)
    .filter(p => !tagLabels.has(p.name))
})
const shownPlotlines = computed(() => plotlines.value.slice(0, PLOTLINES_SHOWN))
const morePlotlines = computed(() => plotlines.value.length - shownPlotlines.value.length)
const cast = computed(() => {
  const ids = props.episode.focus.length
    ? props.episode.focus
    : props.episode.protagonists
  return ids.slice(0, 5)
})
</script>

<template>
  <UCard
    :to="`/episode/${episode.no}`"
    variant="subtle"
    class="hover:ring-primary transition"
    :ui="{ body: 'p-3 sm:p-4' }"
  >
    <div class="flex items-start gap-3">
      <div class="text-right shrink-0 w-14">
        <div class="text-lg font-bold tabular-nums">
          {{ episode.no }}
        </div>
        <div class="text-[10px] text-muted leading-tight">
          {{ episode.date }}
        </div>
      </div>
      <div class="min-w-0 flex-1">
        <NuxtLink
          :to="`/episode/${episode.no}`"
          class="font-medium hover:text-primary line-clamp-2"
        >
          {{ episode.title }}
        </NuxtLink>
        <div class="mt-1 flex flex-wrap gap-1 items-center">
          <span
            v-for="c in cast"
            :key="c"
            class="text-xs text-muted"
          >{{ c }}</span>
        </div>
        <div
          v-if="tags.length || plotlines.length"
          class="mt-1.5 flex flex-wrap gap-1"
        >
          <UBadge
            v-for="p in shownPlotlines"
            :key="p.id"
            color="primary"
            variant="soft"
            size="sm"
          >
            {{ p.name }}
          </UBadge>
          <UBadge
            v-if="morePlotlines"
            color="primary"
            variant="soft"
            size="sm"
          >
            +{{ morePlotlines }}
          </UBadge>
          <UBadge
            v-for="t in tags"
            :key="t.id"
            :color="TAG_COLOR[t.kind]"
            variant="soft"
            size="sm"
          >
            {{ t.label }}
          </UBadge>
        </div>
      </div>
    </div>
  </UCard>
</template>
