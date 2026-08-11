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

// 新增篩選 hands over to the page's palette — see SearchOmnibox
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

// active selections, as removable chips. A token from a stale shared link won't
// be in the index — show its raw value rather than dropping it from the filter.
const chips = computed(() => tokens.value.map((token) => {
  const item = byToken.value.get(token)
  return {
    token,
    label: item?.label ?? parseToken(token)?.value ?? token,
    icon: item?.icon ?? 'i-lucide-tag',
    ...facetVisual(item)
  }
}))
function removeChip(token: string) {
  tokens.value = tokens.value.filter(t => t !== token)
}

/**
 * The controls above are deliberately compact, which leaves the desktop sidebar
 * mostly empty — and a lone 新增篩選 box says nothing about *what* it searches.
 * The browse block spends that space on the head of every facet type, so the
 * available axes are visible and one click away. Options are count-sorted
 * upstream, so the head of each list is also the part worth offering; the cap is
 * tighter than the menu's because chips wrap barely two to a sidebar row.
 */
const BROWSE_PER_SECTION = 6
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
}

// USelectMenu uses undefined for "no selection"; the filter state uses null
const yearFrom = computed<number | undefined>({
  get: () => state.value.yearFrom ?? undefined,
  set: (v) => {
    state.value.yearFrom = v ?? null
  }
})
const yearTo = computed<number | undefined>({
  get: () => state.value.yearTo ?? undefined,
  set: (v) => {
    state.value.yearTo = v ?? null
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

    <UInput
      v-model="state.q"
      icon="i-lucide-search"
      placeholder="搜尋劇集標題…"
      class="w-full"
    />

    <!-- Opens the page's omnibox rather than a dropdown of its own: one search
         surface, and the panel's ~440 options were unreachable inside a listbox
         eight rows tall. -->
    <UButton
      block
      color="neutral"
      variant="subtle"
      icon="i-lucide-list-filter"
      :ui="{ base: 'justify-start font-normal' }"
      @click="show()"
    >
      <span class="text-dimmed">新增篩選…</span>
    </UButton>

    <div
      v-if="chips.length"
      class="flex flex-wrap gap-1.5"
    >
      <UButton
        v-for="chip in chips"
        :key="chip.token"
        size="sm"
        :color="chip.color"
        variant="soft"
        :style="chip.style"
        :icon="chip.icon"
        trailing-icon="i-lucide-x"
        :aria-label="`移除篩選：${chip.label}`"
        :ui="{ trailingIcon: 'text-dimmed' }"
        @click="removeChip(chip.token)"
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

    <!-- Memoised on `browse` — its own dependency set. Without this the ~40
         buttons re-render on every keystroke in the title search above, since
         a slotted child component is patched unconditionally. `-mr-2 pr-2`
         parks the scrollbar in the grid gutter so chips don't reflow when it
         appears. -->
    <div
      v-if="isSidebar && browse.length"
      v-memo="[browse]"
      class="flex-1 min-h-0 overflow-y-auto border-t border-default pt-3 -mr-2 pr-2 flex flex-col gap-3"
    >
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
