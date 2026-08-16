<script setup lang="ts">
import type { FeaturedItem } from '~/composables/useDetailView'

// Everything is pre-resolved by `buildHomeSeed`, so this renders from the
// prerendered payload alone — no dataset tier has to arrive first.
const props = defineProps<{ item: FeaturedItem }>()

const state = useFilterState()

/**
 * 節日 / 客串 / 里程碑 have no page of their own, so their href is the filtered
 * list — and following it in-app has to set the filter state as well.
 * `useEpisodeFilter` reads the query once, at module evaluation, so a client-side
 * navigation to ?tags= would otherwise move the address bar and nothing else.
 * The state lands on the same query the href spells, so the two agree whichever
 * one gets there first; a modified click (new tab) full-loads and hydrates from
 * the URL the usual way, which is why this doesn't preventDefault.
 */
function onSelect(e: MouseEvent) {
  // Every kind reports, modified clicks included: the card was chosen either
  // way, and the three kinds land on different destinations (a page of its own
  // for 故事線/角色, the filtered list for a 節日) so only the subject says which
  // curation is earning its place in the row.
  track('featured_select', subjectParams(props.item.token))
  if (props.item.kind !== 'tag') return
  if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return
  Object.assign(state.value, clearedFilters(state.value), { tags: [props.item.id] })
}
</script>

<template>
  <!-- A real anchor rather than `UCard :to`: UCard takes no `to` prop, so that
       would land in the DOM as a bare attribute on a div — no link at all,
       which on the one prerendered page crawlers do reach is the whole point.
       Classes mirror UCard's `subtle` variant so it sits with the grid below. -->
  <NuxtLink
    :to="item.to"
    class="shrink-0 w-40 sm:w-auto flex items-center gap-2 p-3 rounded-lg bg-elevated/50 ring ring-default hover:ring-primary transition"
    @click="onSelect"
  >
    <span
      class="text-xl leading-none shrink-0"
      aria-hidden="true"
    >{{ item.emoji }}</span>
    <div class="min-w-0">
      <!-- the entity's own tone, the same hue its badges carry everywhere else -->
      <div
        class="font-medium truncate"
        :style="toneTextStyle(item.tone)"
      >
        {{ item.label }}
      </div>
      <div class="text-[11px] text-muted truncate">
        {{ item.meta }}・{{ item.episodeCount }} 集
      </div>
    </div>
  </NuxtLink>
</template>
