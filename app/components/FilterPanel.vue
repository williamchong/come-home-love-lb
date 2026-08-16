<script setup lang="ts">
import type { Dataset } from '~/composables/useDataset'
import type { FacetItem } from '~/composables/useFacetIndex'

// The two mount sites differ in what the surrounding chrome already provides:
// the drawer has its own footer count and its own height budget, so it drops
// the count line and the browse block. One variant beats a boolean per part.
const props = withDefaults(
  defineProps<{ ds: Dataset, activeCount: number, resultCount: number, variant?: 'sidebar' | 'drawer' }>(),
  { variant: 'sidebar' }
)
const isSidebar = computed(() => props.variant === 'sidebar')
const emit = defineEmits<{ reset: [] }>()

const state = useFilterState()

const { sections, byToken } = useFacetIndex(() => props.ds)
const tokens = useFacetTokens(state)

// the panel's one search button hands over to the page's palette — see SearchOmnibox
const { show } = useOmnibox()

/**
 * A toned entity keeps its neutral surface — an inline background would beat the
 * button's hover class — and carries its hue in text + icon instead. Both chip
 * rows below read the pair from here so they can't drift apart.
 */
const facetVisual = (item?: FacetItem) => ({
  color: item?.color ?? 'neutral',
  style: toneTextStyle(item?.tone)
})

/**
 * Active selections, as removable chips — including the free-text search, which
 * has no box of its own here: it is one of the things the palette answers (its
 * 搜尋標題／主人翁 row), so a second input beside the search button offered a
 * narrower version of the same surface. As a chip it is the only place `q` is
 * still visible, and the only way to drop it without clearing everything.
 *
 * Each chip carries its own remover rather than being keyed by kind: `q` is a
 * `FilterState` field and a facet is an entry in one of its arrays, and a
 * closure is what lets one row and one handler serve both. A token from a stale
 * shared link won't be in the index — show its raw value rather than dropping
 * it from the filter.
 */
const chips = computed(() => {
  const facets = tokens.value.map((token) => {
    const item = byToken.value.get(token)
    return {
      // never collides with the query chip below: a facet token always has a colon
      key: token,
      label: item?.label ?? parseToken(token)?.value ?? token,
      icon: item?.icon ?? 'i-lucide-tag',
      remove: () => {
        tokens.value = tokens.value.filter(t => t !== token)
        track('filter_remove', subjectParams(token))
      },
      ...facetVisual(item)
    }
  })
  if (!state.value.q) return facets
  return [{
    key: 'q',
    label: `「${state.value.q}」`,
    icon: 'i-lucide-search',
    remove: () => {
      // Reported as a chip like any other — `q` is not a `SubjectKey`, but this
      // row is the only way to drop a search on its own, so counting it apart
      // from the facet chips would hide half of what 清除 is competing with.
      track('filter_remove', { subject_key: 'q', subject_value: state.value.q })
      state.value.q = ''
    },
    ...facetVisual()
  }, ...facets]
})

/**
 * The controls above are deliberately compact, which leaves the desktop sidebar
 * mostly empty — and a lone search button says nothing about *what* it searches.
 * The browse block spends that space on the head of every facet type, so the
 * available axes are visible and one click away. Options arrive sorted upstream
 * — best-liked first, falling back to most-frequent where no one has voted — so
 * the head of each list is also the part worth offering; the cap is tighter than
 * the menu's because chips wrap barely two to a sidebar row.
 */
const BROWSE_PER_SECTION = 6

// Which question the head of each section answers — see `useFacetIndex`. 得分 is
// the default and this toggle is the way back to 集數, so it is offered exactly
// when the score order it toggles is the one in effect: a visit with no scores
// on it is already showing the count order, and a button claiming to switch to
// what is on screen is noise. The omnibox follows the same state.
const facetOrder = useFacetOrder()
const { scoresInPlay } = useVotes()
const toggleFacetOrder = () => {
  facetOrder.value = facetOrder.value === 'count' ? 'score' : 'count'
  track('facet_order', { order: facetOrder.value })
}

const browse = computed(() => {
  const chosen = new Set(tokens.value)
  return sections.value
    // already-picked options live in the chip row above; drop them here rather
    // than render the same filter twice in two different states
    .map(s => ({ ...s, items: s.items.filter(i => !chosen.has(i.token)).slice(0, BROWSE_PER_SECTION) }))
    .filter(s => s.items.length)
})
// browse only ever offers tokens that aren't selected, so this is an append
function addToken(token: string) {
  tokens.value = [...tokens.value, token]
  track('filter_add', { ...subjectParams(token), source: 'panel' })
}

// 提及 is the one control that widens rather than narrows, and it is only
// offered while a 角色 chip is on the board — so how often it is reached for is
// a question about that facet. The switch keeps its plain `v-model`; only the
// event needs a handler.
const onMentions = (enabled: boolean) => track('filter_mentions', { enabled })

// USelectMenu uses undefined for "no selection"; the filter state uses null.
// Both bounds report the resulting range rather than the half that moved —
// 2019–2020 and "from 2019" are different filters and only the pair says which.
const trackYears = () => track('filter_year', { from: state.value.yearFrom, to: state.value.yearTo })
const yearFrom = computed<number | undefined>({
  get: () => state.value.yearFrom ?? undefined,
  set: (v) => {
    state.value.yearFrom = v ?? null
    trackYears()
  }
})
const yearTo = computed<number | undefined>({
  get: () => state.value.yearTo ?? undefined,
  set: (v) => {
    state.value.yearTo = v ?? null
    trackYears()
  }
})
const years = computed(() => props.ds.facets.years.map(y => Number(y.value)))
</script>

<template>
  <!-- flex column so the browse block below can absorb (and scroll) whatever
       height is left over in the sticky sidebar -->
  <div class="flex flex-col gap-3 min-h-0">
    <div class="flex items-center justify-between">
      <div
        v-if="isSidebar"
        class="text-sm"
      >
        <span class="font-semibold text-highlighted">{{ resultCount.toLocaleString() }}</span>
        <span class="text-muted"> 集</span>
      </div>
      <UButton
        v-if="activeCount"
        size="xs"
        color="neutral"
        variant="ghost"
        icon="i-lucide-x"
        class="ml-auto"
        @click="emit('reset')"
      >
        清除 {{ activeCount }}
      </UButton>
    </div>

    <!-- Opens the page's omnibox rather than a box of its own: one search
         surface, and the panel's ~440 options were unreachable inside a listbox
         eight rows tall. It stands in for a title search too — the palette's
         搜尋標題／主人翁 row hands the term to exactly the filter a local input
         would have set — so the panel offers one door where it used to offer
         two. The page has its own field, but that one scrolls away and this
         sidebar is sticky, and on a phone the drawer covers it entirely. -->
    <UButton
      block
      color="neutral"
      variant="subtle"
      icon="i-lucide-search"
      :ui="{ base: 'justify-start font-normal' }"
      @click="show(variant)"
    >
      <span class="text-dimmed">搜尋或新增篩選…</span>
    </UButton>

    <div
      v-if="chips.length"
      class="flex flex-wrap gap-1.5"
    >
      <UButton
        v-for="chip in chips"
        :key="chip.key"
        size="sm"
        :color="chip.color"
        variant="soft"
        :style="chip.style"
        :icon="chip.icon"
        trailing-icon="i-lucide-x"
        :aria-label="`移除篩選：${chip.label}`"
        :ui="{ trailingIcon: 'text-dimmed' }"
        @click="chip.remove()"
      >
        {{ chip.label }}
      </UButton>
    </div>

    <USwitch
      v-if="state.characters.length"
      v-model="state.includeMentions"
      size="xs"
      label="包括配角出場"
      description="除主人翁外，亦包括官方劇情簡介提及該角色的集數"
      @update:model-value="onMentions"
    />

    <div class="flex gap-2 items-center">
      <span class="text-xs font-medium text-muted shrink-0">年份</span>
      <USelectMenu
        v-model="yearFrom"
        :items="years"
        placeholder="由"
        size="sm"
        class="flex-1 min-w-0"
      />
      <span class="text-muted">–</span>
      <USelectMenu
        v-model="yearTo"
        :items="years"
        placeholder="至"
        size="sm"
        class="flex-1 min-w-0"
      />
    </div>

    <!-- Memoised on everything this subtree reads, not just `browse`. Without a
         memo the ~40 buttons re-render on every unrelated filter change (a year
         bound, the 配角出場 switch, a search term arriving from the palette),
         since a slotted child is patched unconditionally — its slot compiles as
         DYNAMIC_SLOTS inside the `v-for`, which `shouldUpdateComponent` takes
         as an update before it compares any prop.
         `scoresInPlay` has to be listed even though `browse` derives from it:
         `sections` only reads it through a short-circuit (`order === 'score' &&
         scoresInPlay`), so once the toggle is on 集數 nothing under `browse`
         depends on vote status, and a memo without it would strand the toggle
         on screen after a snapshot failed. `-mr-2 pr-2` parks the scrollbar in
         the grid gutter so chips don't reflow when it appears. -->
    <div
      v-if="isSidebar && browse.length"
      v-memo="[browse, scoresInPlay, facetOrder]"
      class="flex-1 min-h-0 overflow-y-auto border-t border-default pt-3 -mr-2 pr-2 flex flex-col gap-3"
    >
      <div
        v-if="scoresInPlay"
        class="flex justify-end -mt-1"
      >
        <UButton
          size="xs"
          color="neutral"
          variant="ghost"
          :icon="facetOrder === 'count' ? 'i-lucide-hash' : 'i-lucide-thumbs-up'"
          :aria-label="`改為依${facetOrder === 'count' ? '得分' : '集數'}排序`"
          @click="toggleFacetOrder()"
        >
          依{{ facetOrder === 'count' ? '集數' : '得分' }}
        </UButton>
      </div>
      <div
        v-for="section in browse"
        :key="section.label"
      >
        <div class="flex items-center gap-1.5 mb-1.5 text-xs font-medium text-muted">
          <UIcon
            :name="section.icon"
            class="size-3.5 shrink-0"
          />
          {{ section.label }}
        </div>
        <div class="flex flex-wrap gap-1">
          <UButton
            v-for="item in section.items"
            :key="item.token"
            size="xs"
            variant="outline"
            class="max-w-full"
            v-bind="facetVisual(item)"
            :ui="{ label: 'truncate' }"
            :aria-label="`新增篩選：${item.label}`"
            @click="addToken(item.token)"
          >
            {{ item.label }}
          </UButton>
        </div>
      </div>
    </div>
  </div>
</template>
