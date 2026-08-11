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

// A bordered card rather than a ghost button: these are the two largest targets
// on the page, and an edge is what makes them read as targets at all. The ring
// vocabulary is the one `FeaturedCard` already uses for a clickable card; the
// outline pair is Nuxt UI's own focus ring, which a raw NuxtLink — unlike the
// UButton this replaces — does not bring along.
const STEP_CARD = 'group flex min-w-0 items-center gap-1.5 rounded-lg px-2 py-1.5 bg-elevated/50 ring ring-default transition hover:ring-primary outline-inverted/25 focus-visible:outline-3'

// Mirrored rather than written twice: `flex-row-reverse` moves the chevron to
// the far side, and `col-start-2` holds 下一集 in its own column when 上一集 is
// missing (第 1 集, the finale). DOM order stays prev-then-next, so tab order
// follows reading order either way.
const steps = computed(() => [
  stepPrev.value && {
    dir: 'prev', nav: stepPrev.value, label: '上一集',
    icon: 'i-lucide-chevron-left', class: STEP_CARD
  },
  stepNext.value && {
    dir: 'next', nav: stepNext.value, label: '下一集',
    icon: 'i-lucide-chevron-right', class: `${STEP_CARD} col-start-2 flex-row-reverse text-right`
  }
].filter(isPresent))

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
  <!-- Sticky rather than fixed: it rides the bottom of the viewport while the
       page scrolls, then settles into place at the end — so it never covers the
       site footer and needs no body padding to compensate. Reaching that bottom
       edge on a short episode is the page's job; see the container comment in
       `pages/episode/[no].vue`.

       Full-bleed only holds while the container is narrower than `max-w-3xl`,
       which is why the bar goes static at `md`: past that width a bordered,
       blurred bar floating in gutters reads as a bug rather than a fixture. -->
  <nav
    aria-label="劇集導航"
    class="sticky bottom-0 z-10 md:static -mx-4 px-4 sm:-mx-6 sm:px-6 md:mx-0 md:px-0 mt-6 border-t border-default bg-default/80 backdrop-blur md:bg-transparent md:backdrop-blur-none pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] md:pb-0"
  >
    <!-- Which list the steps below are stepping through: the label on the
         control, not the control, so it stays small and quiet. -->
    <div class="flex items-center gap-2 mb-2 text-xs">
      <UIcon
        :name="playlist ? 'i-lucide-list-video' : 'i-lucide-list'"
        class="size-3.5 shrink-0 text-dimmed"
      />
      <template v-if="playlist">
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
        <!-- Pulled back to the strip's own text height, so adding a tappable
             control here doesn't stretch the row it labels. -->
        <UButton
          :to="`/episode/${no}`"
          size="xs"
          variant="ghost"
          color="neutral"
          icon="i-lucide-x"
          class="ml-auto shrink-0 -my-1 -mr-1.5"
          aria-label="離開此播放清單，改為按集數瀏覽"
        >
          離開
        </UButton>
      </template>
      <span
        v-else
        class="text-muted"
      >全劇集</span>
    </div>

    <!-- Each card stacks the number over the title: the number is what the card
         promises to go to and must survive any width, the title is context and
         may clip. Side by side on a phone, one line of each was two half-width
         truncations with nothing to rank them. -->
    <div class="grid grid-cols-2 gap-2">
      <NuxtLink
        v-for="s in steps"
        :key="s.dir"
        :to="stepTo(s.nav)"
        :class="s.class"
        :aria-label="`${s.label}：第 ${s.nav.no} 集 ${s.nav.title}`"
      >
        <UIcon
          :name="s.icon"
          class="size-5 shrink-0 text-dimmed transition-colors group-hover:text-highlighted"
        />
        <span class="min-w-0 flex-1">
          <span class="block text-sm font-semibold tabular-nums text-highlighted">{{ s.nav.no }}</span>
          <span class="block text-xs text-muted truncate">{{ s.nav.title }}</span>
        </span>
      </NuxtLink>
    </div>

    <!-- The way out of the list, or the way into one — centred and small so it
         never competes with the steps for the thumb. The height is reserved
         because the playlist resolves a tick *after* first paint (client-only
         by construction) and this row is what differs between the two states:
         without it the bar would shrink out from under a reader mid-reach. -->
    <div class="flex items-center justify-center min-h-6 mt-1.5 text-[11px] text-muted">
      <div
        v-if="playlist && (seqPrev || seqNext)"
        class="flex items-center gap-3"
      >
        <ULink
          v-if="seqPrev"
          :to="`/episode/${seqPrev.no}`"
          class="tabular-nums hover:underline"
        >‹ {{ seqPrev.no }}</ULink>
        <span>依集數</span>
        <ULink
          v-if="seqNext"
          :to="`/episode/${seqNext.no}`"
          class="tabular-nums hover:underline"
        >{{ seqNext.no }} ›</ULink>
      </div>

      <!-- Deliberately nowrap: a chip row that wraps would change this bar's
           height by tens of pixels the moment the playlist resolves. -->
      <div
        v-else-if="!playlist && offers.length"
        class="flex items-center gap-1.5 min-w-0"
      >
        <span class="shrink-0">跟隨故事線</span>
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
    </div>
  </nav>
</template>
