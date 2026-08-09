<script setup lang="ts">
import type { Dataset } from '~/composables/useDataset'
import { FACET_TEXT_CLASS } from '~/types'

const props = withDefaults(
  defineProps<{ ds: Dataset, activeCount: number, resultCount: number, showCount?: boolean }>(),
  { showCount: true }
)
const emit = defineEmits<{ reset: [] }>()

const state = useFilterState()

// bound so the index can list only the top options per section until you type
const facetSearch = ref('')
const { groups, byToken } = useFacetIndex(() => props.ds, facetSearch)
const tokens = useFacetTokens(state)

// active selections, as removable chips. A token from a stale shared link won't
// be in the index — show its raw value rather than dropping it from the filter.
const chips = computed(() => tokens.value.map((token) => {
  const item = byToken.value.get(token)
  return {
    token,
    label: item?.label ?? parseToken(token)?.value ?? token,
    icon: item?.icon ?? 'i-lucide-tag',
    // a toned entity keeps its neutral surface — an inline background would
    // beat the button's hover class — and carries its hue in text + icon
    color: item?.color ?? 'neutral',
    style: toneTextStyle(item?.tone)
  }
}))
function removeChip(token: string) {
  tokens.value = tokens.value.filter(t => t !== token)
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
  <div class="space-y-3">
    <div class="flex items-center justify-between">
      <div
        v-if="showCount"
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

    <USelectMenu
      v-model="tokens"
      v-model:search-term="facetSearch"
      :items="groups"
      multiple
      value-key="token"
      icon="i-lucide-list-filter"
      :filter-fields="FACET_FILTER_FIELDS"
      :search-input="{ placeholder: '角色、故事線、節日、里程碑…' }"
      class="w-full"
      :ui="{ content: 'min-w-72 max-w-[calc(100vw-2rem)]' }"
    >
      <!-- the trigger always invites a new pick; what's chosen shows as chips -->
      <template #default>
        <span class="text-dimmed">新增篩選…</span>
      </template>
      <template #item-leading="{ item }">
        <UIcon
          v-if="item.icon"
          :name="item.icon"
          :class="['size-5 shrink-0', item.color ? FACET_TEXT_CLASS[item.color] : '']"
          :style="toneTextStyle(item.tone)"
        />
      </template>
      <template #item-label="{ item }">
        <span class="truncate">{{ item.label }}</span>
        <span
          v-if="item.meta"
          class="text-muted text-xs ml-1"
        >{{ item.meta }}</span>
        <span class="text-muted text-xs ml-auto pl-2">{{ item.count }}</span>
      </template>
    </USelectMenu>

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
  </div>
</template>
