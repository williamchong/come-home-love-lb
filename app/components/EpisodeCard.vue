<script setup lang="ts">
import type { CharacterRef, EpisodeCardData, PlotlineBadge } from '~/composables/useDetailView'

// Every prop is narrowed to the fields the card actually reads, so a detail
// page's lean payload (`useDetailView`) satisfies them just as the live
// dataset tiers do.
const props = defineProps<{
  episode: EpisodeCardData
  /** From the full dataset tier — 所屬故事線 badges appear once it loads. */
  plotlinesById?: ReadonlyMap<string, PlotlineBadge> | null
  /** From the full dataset tier — cast names take their family tone once it loads. */
  charactersById?: ReadonlyMap<string, CharacterRef> | null
  /**
   * A `key:value` facet token naming the list this card sits in. Passed through
   * to the episode page as `?list=`, so prev/next there keep following the list
   * the visitor was actually browsing rather than reverting to ±1.
   */
  list?: string | null
  /**
   * The card the visitor just arrived at, via `#ep-1234` — rings it so the
   * scroll reads as an arrival rather than a mis-scroll. A prop rather than a
   * class from the parent because the ring colour is what `UCard` already sets
   * here, and one binding should decide it.
   */
  highlighted?: boolean
}>()

const to = computed(() => episodeLink(props.episode.no, props.list))

const tags = computed(() => props.episode.tagIds.map(id => TAGS_BY_ID.get(id)).filter(isPresent))
const tagStyle = (id: string) => toneBadgeStyle(TAG_TONES.get(id))

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

// Cast tones resolve only once the full tier delivers charactersById, so until
// then the row stays muted (same progressive fill-in as the plotline badges).
const castStyle = (token: string) => toneTextStyle(
  props.charactersById && tokenTone(token, props.charactersById, props.episode.groupIds.includes(token))
)
</script>

<template>
  <UCard
    :id="episodeAnchor(episode.no)"
    :to="to"
    variant="subtle"
    class="transition"
    :class="[EPISODE_ANCHOR_CLASS, highlighted ? EPISODE_ANCHOR_RING : 'hover:ring-primary']"
    :ui="{ body: 'p-3 sm:p-4' }"
  >
    <div class="flex items-start gap-3">
      <div class="text-right shrink-0 w-20 flex flex-col items-end">
        <div class="text-lg font-bold tabular-nums">
          {{ episode.no }}
        </div>
        <div class="text-[10px] text-muted leading-tight">
          {{ episode.date }}
        </div>
        <!-- Inside the card's own <a>, so the buttons stop the click from
             navigating — see `@click.stop.prevent` in VoteButtons. -->
        <VoteButtons
          :subject="subjectToken('episodes', episode.no)"
          size="xs"
          :label="`第${episode.no}集`"
          class="mt-1"
        />
      </div>
      <div class="min-w-0 flex-1">
        <NuxtLink
          :to="to"
          class="font-medium hover:text-primary line-clamp-2"
        >
          {{ episode.title }}
        </NuxtLink>
        <div class="mt-1 flex flex-wrap gap-1 items-center">
          <span
            v-for="c in cast"
            :key="c"
            class="text-xs text-muted"
            :style="castStyle(c)"
          >{{ c }}</span>
        </div>
        <div
          v-if="tags.length || plotlines.length"
          class="mt-1.5 flex flex-wrap gap-1"
        >
          <UBadge
            v-for="p in shownPlotlines"
            :key="p.id"
            color="neutral"
            variant="soft"
            size="sm"
            :style="toneBadgeStyle(p.tone)"
          >
            {{ p.name }}
          </UBadge>
          <!-- the overflow badge stands for several lines at once, so it keeps
               the neutral surface rather than picking one of their hues -->
          <UBadge
            v-if="morePlotlines"
            color="neutral"
            variant="soft"
            size="sm"
          >
            +{{ morePlotlines }}
          </UBadge>
          <UBadge
            v-for="t in tags"
            :key="t.id"
            color="neutral"
            variant="soft"
            size="sm"
            :style="tagStyle(t.id)"
          >
            {{ t.label }}
          </UBadge>
        </div>
      </div>
    </div>
  </UCard>
</template>
