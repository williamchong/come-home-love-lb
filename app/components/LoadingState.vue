<script setup lang="ts">
defineProps<{ text: string }>()
</script>

<template>
  <div class="flex items-center gap-2 text-muted">
    <UIcon
      name="i-lucide-loader-circle"
      class="animate-spin size-4"
    />
    {{ text }}
  </div>
</template>
