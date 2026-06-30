<script setup lang="ts">
import type { FacetOption } from '~/composables/useDataset'

const props = defineProps<{
  modelValue: string[]
  items: FacetOption[]
  label: string
  icon?: string
  placeholder?: string
}>()
const emit = defineEmits<{ 'update:modelValue': [string[]] }>()

// USelectMenu works on the option objects; map to/from the value strings.
const selected = computed({
  get: () => {
    const set = new Set(props.modelValue)
    return props.items.filter(i => set.has(i.value))
  },
  set: (opts: FacetOption[]) => emit('update:modelValue', opts.map(o => o.value))
})
</script>

<template>
  <div>
    <label class="block text-xs font-medium text-muted mb-1">
      {{ label }}
      <span
        v-if="modelValue.length"
        class="text-primary"
      >· {{ modelValue.length }}</span>
    </label>
    <USelectMenu
      v-model="selected"
      :items="items"
      multiple
      :icon="icon"
      :placeholder="placeholder || `選擇${label}`"
      :search-input="{ placeholder: '搜尋…' }"
      class="w-full"
      :ui="{ content: 'min-w-72' }"
    >
      <template #item-label="{ item }">
        <span class="truncate">{{ item.label }}</span>
        <span
          v-if="item.meta"
          class="text-muted text-xs ml-1"
        >{{ item.meta }}</span>
        <span class="text-muted text-xs ml-auto pl-2">{{ item.count }}</span>
      </template>
    </USelectMenu>
  </div>
</template>
