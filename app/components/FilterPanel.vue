<script setup lang="ts">
import type { Dataset } from '~/composables/useDataset'
import type { TagKind } from '~/types'

const props = defineProps<{ ds: Dataset, activeCount: number, resultCount: number }>()
const emit = defineEmits<{ reset: [] }>()

const state = useFilterState()

// per-kind tag models that all read/write the single combined `state.tags`
function tagModel(kind: TagKind) {
  return computed<string[]>({
    get: () => state.value.tags.filter(id => props.ds.tagsById.get(id)?.kind === kind),
    set: (v) => {
      const others = state.value.tags.filter(id => props.ds.tagsById.get(id)?.kind !== kind)
      state.value.tags = [...others, ...v]
    }
  })
}
const festival = tagModel('festival')
const location = tagModel('location')
const cameo = tagModel('cameo')
const milestone = tagModel('milestone')

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

const sortItems = [
  { label: '集數 ↑', value: 'no-asc' },
  { label: '集數 ↓', value: 'no-desc' }
]
</script>

<template>
  <div class="space-y-3">
    <div class="flex items-center justify-between">
      <div class="text-sm">
        <span class="font-semibold text-highlighted">{{ resultCount.toLocaleString() }}</span>
        <span class="text-muted"> 集</span>
      </div>
      <UButton
        v-if="activeCount"
        size="xs"
        color="neutral"
        variant="ghost"
        icon="i-lucide-x"
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

    <FacetSelect
      v-model="state.characters"
      :items="ds.facets.characters"
      label="角色"
      icon="i-lucide-user"
    />
    <FacetSelect
      v-model="state.plotlines"
      :items="ds.facets.plotlines"
      label="故事線 / CP"
      icon="i-lucide-heart"
    />
    <FacetSelect
      v-model="festival"
      :items="ds.facets.tagsByKind.festival"
      label="節日"
      icon="i-lucide-party-popper"
    />
    <FacetSelect
      v-model="cameo"
      :items="ds.facets.tagsByKind.cameo"
      label="客串"
      icon="i-lucide-star"
    />
    <FacetSelect
      v-model="milestone"
      :items="ds.facets.tagsByKind.milestone"
      label="里程碑"
      icon="i-lucide-flag"
    />
    <FacetSelect
      v-model="location"
      :items="ds.facets.tagsByKind.location"
      label="地點"
      icon="i-lucide-map-pin"
    />
    <FacetSelect
      v-model="state.groups"
      :items="ds.facets.groups"
      label="家庭 / 機構"
      icon="i-lucide-users"
    />
    <FacetSelect
      v-model="state.writers"
      :items="ds.facets.writers"
      label="編劇"
      icon="i-lucide-pen-line"
    />

    <div>
      <label class="block text-xs font-medium text-muted mb-1">年份</label>
      <div class="flex gap-2 items-center">
        <USelectMenu
          v-model="yearFrom"
          :items="ds.facets.years.map(y => Number(y.value))"
          placeholder="由"
          class="flex-1"
        />
        <span class="text-muted">–</span>
        <USelectMenu
          v-model="yearTo"
          :items="ds.facets.years.map(y => Number(y.value))"
          placeholder="至"
          class="flex-1"
        />
      </div>
    </div>

    <div>
      <label class="block text-xs font-medium text-muted mb-1">排序</label>
      <USelectMenu
        v-model="state.sort"
        :items="sortItems"
        value-key="value"
        class="w-full"
      />
    </div>
  </div>
</template>
