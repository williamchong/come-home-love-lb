<script setup lang="ts">
// Rendered in both the mobile sticky bar and the desktop toolbar, so it reads the
// shared filter state directly rather than taking a model from either caller.
const state = useFilterState()

// 得分 is only an ordering once there is something to order by — it stays out
// of the menu while the scores are loading, and for good if voting is off. The
// exception is a visitor who arrived on `?sort=score-desc`: dropping the option
// they are currently sorted by would leave the control showing no label at all.
const { status } = useVotes()
const items = computed(() => SORT_ITEMS.filter(item =>
  item.value !== 'score-desc' || status.value === 'ready' || state.value.sort === 'score-desc'))
</script>

<template>
  <USelectMenu
    v-model="state.sort"
    :items="items"
    value-key="value"
    :search-input="false"
    size="sm"
    color="neutral"
    variant="ghost"
    icon="i-lucide-arrow-up-down"
    aria-label="排序"
    :ui="{ content: 'min-w-32' }"
  />
</template>
