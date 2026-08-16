<script setup lang="ts">
import type { SortKey } from '~/composables/useEpisodeFilter'

// Rendered in both the mobile sticky bar and the desktop toolbar, so it reads the
// shared filter state directly rather than taking a model from either caller.
// Both halves come from `useEpisodeFilter`: the value is `useSortKey` rather than
// the raw field, since 得分 is the default and this control is what has to stop
// claiming it where scores aren't in play, and the option list is defined next to
// it so the menu can never offer a value the getter rewrites.
const sortKey = useSortKey()
const items = useSortItems()

// Reported here rather than in `useSortKey`'s setter: this menu is the only
// thing that ever writes it, and the getter also *rewrites* 得分 to 集數 where
// scores aren't in play — so a setter-side event would be the one place unable
// to tell a visitor's choice from that degradation.
const onSort = (sort: SortKey) => track('filter_sort', { sort })
</script>

<template>
  <USelectMenu
    v-model="sortKey"
    :items="items"
    value-key="value"
    :search-input="false"
    size="sm"
    color="neutral"
    variant="ghost"
    icon="i-lucide-arrow-up-down"
    aria-label="排序"
    :ui="{ content: 'min-w-32' }"
    @update:model-value="onSort"
  />
</template>
