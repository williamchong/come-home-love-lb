<script setup lang="ts">
// Rendered in both the mobile sticky bar and the desktop toolbar, so it reads the
// shared filter state directly rather than taking a model from either caller.
const state = useFilterState()
</script>

<template>
  <USelectMenu
    v-model="state.sort"
    :items="SORT_ITEMS"
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
