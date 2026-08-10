<script setup lang="ts">
import type { ArcNav, EpisodeNav, PlotlineBadge } from '~/composables/useDetailView'
import type { Playlist } from '~/composables/usePlaylist'

const props = defineProps<{
  no: number
  /** ±1 by number — the default, and all a prerendered page can promise. */
  prev: EpisodeNav | null
  next: EpisodeNav | null
  /** Set once `?list=` resolves; then it, not ±1, drives the two big buttons. */
  playlist: Playlist | null
  /** Story lines this episode can be stepped through, offered when idle. */
  arcs: ArcNav[]
  /** Hue source for those offers — plot-line tones are already in this payload. */
  plotlines: PlotlineBadge[]
}>()

// Two is enough to suggest without turning the bar into a second facet panel;
// `buildArcs` ranks by which line picks up soonest, so these are the head.
const ARC_OFFERS = 2

const stepPrev = computed(() => props.playlist?.prev ?? props.prev)
const stepNext = computed(() => props.playlist?.next ?? props.next)

// Every step inside a list stays inside it.
const stepTo = (nav: EpisodeNav) => episodeLink(nav.no, props.playlist?.token)

const tones = computed(() => byId(props.plotlines))
const offers = computed(() => props.arcs.slice(0, ARC_OFFERS).map(arc => ({
  ...arc,
  // Same route, query only: following a line shouldn't move you off the
  // episode you're reading, it should change what "next" means from here.
  to: episodeLink(props.no, facetToken('plotlines', arc.id)),
  style: toneTextStyle(tones.value.get(arc.id)?.tone)
})))

// The ±1 pair stays reachable inside a list, but only where it says something
// new — on a step the list also takes, a second identical button is noise.
// These deliberately drop `?list=`: they are the way back out to the sequence.
const seqPrev = computed(() => (props.playlist && props.prev?.no !== props.playlist.prev?.no ? props.prev : null))
const seqNext = computed(() => (props.playlist && props.next?.no !== props.playlist.next?.no ? props.next : null))
</script>

<template>
  <!-- Sticky rather than fixed: pinned to the bottom of the viewport while the
       page scrolls, then settling into place at the end — so it never covers
       the site footer and needs no body padding to compensate. -->
  <nav
    aria-label="劇集導航"
    class="sticky bottom-0 lg:static -mx-4 px-4 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] mt-6 border-t border-default bg-default/90 backdrop-blur"
  >
    <div class="flex items-center gap-2 mb-1 text-xs">
      <template v-if="playlist">
        <UIcon
          name="i-lucide-list-video"
          class="size-3.5 shrink-0 text-muted"
        />
        <NuxtLink
          :to="playlist.to"
          class="font-medium min-w-0 truncate hover:underline"
          :style="toneTextStyle(playlist.tone)"
        >
          {{ playlist.label }}
        </NuxtLink>
        <span class="text-muted tabular-nums shrink-0">
          第 {{ playlist.index }} / {{ playlist.total }} 集
        </span>
        <UButton
          :to="`/episode/${no}`"
          size="xs"
          variant="ghost"
          color="neutral"
          icon="i-lucide-x"
          class="ml-auto shrink-0"
          aria-label="離開此播放清單，改為按集數瀏覽"
        />
      </template>
      <span
        v-else
        class="text-muted"
      >全劇集</span>
    </div>

    <div class="flex items-center gap-2">
      <!-- Two things are needed to clip rather than wrap a long title: `min-w-0`
           on the base, since a flex item's min-width defaults to auto, and a
           `truncate` span of our own — UButton's `label` slot only wraps the
           `label` *prop*, so styling it does nothing to default-slot content. -->
      <UButton
        v-if="stepPrev"
        :to="stepTo(stepPrev)"
        icon="i-lucide-chevron-left"
        variant="ghost"
        color="neutral"
        class="flex-1 justify-start"
        :ui="{ base: 'min-w-0' }"
      >
        <!-- The number is the part that must survive: it is what the button
             promises to go to, so it sits outside the clipping span. -->
        <span class="tabular-nums text-muted mr-1 shrink-0">{{ stepPrev.no }}</span>
        <span class="min-w-0 truncate">{{ stepPrev.title }}</span>
      </UButton>
      <span
        v-else
        class="flex-1"
      />

      <UButton
        v-if="stepNext"
        :to="stepTo(stepNext)"
        trailing-icon="i-lucide-chevron-right"
        variant="ghost"
        color="neutral"
        class="flex-1 justify-end"
        :ui="{ base: 'min-w-0' }"
      >
        <span class="min-w-0 truncate">{{ stepNext.title }}</span>
        <span class="tabular-nums text-muted ml-1 shrink-0">{{ stepNext.no }}</span>
      </UButton>
      <span
        v-else
        class="flex-1"
      />
    </div>

    <div
      v-if="playlist && (seqPrev || seqNext)"
      class="flex items-center gap-2 text-xs text-muted mt-0.5"
    >
      <span class="shrink-0">依集數</span>
      <ULink
        v-if="seqPrev"
        :to="`/episode/${seqPrev.no}`"
        class="tabular-nums hover:underline"
      >‹ {{ seqPrev.no }}</ULink>
      <ULink
        v-if="seqNext"
        :to="`/episode/${seqNext.no}`"
        class="tabular-nums hover:underline ml-auto"
      >{{ seqNext.no }} ›</ULink>
    </div>

    <div
      v-else-if="!playlist && offers.length"
      class="flex items-center gap-1.5 mt-1 min-w-0"
    >
      <span class="text-xs text-muted shrink-0">跟隨故事線</span>
      <UButton
        v-for="arc in offers"
        :key="arc.id"
        :to="arc.to"
        size="xs"
        variant="soft"
        color="neutral"
        class="min-w-0"
        :ui="{ base: 'min-w-0' }"
        :style="arc.style"
        :aria-label="`跟隨故事線「${arc.name}」，共 ${arc.total} 集`"
      >
        <span class="min-w-0 truncate">{{ arc.name }}</span>
      </UButton>
    </div>
  </nav>
</template>
