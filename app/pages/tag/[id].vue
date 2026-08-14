<script setup lang="ts">
// 節日 / 客串 / 里程碑. Everything below is in `FacetDetail`, which the
// /group and /writer routes mount too.
const route = useRoute()
const id = computed(() => decodeURIComponent(String(route.params.id)))

const { data: view, status } = await useFacetViewAsync('tags', id)
</script>

<template>
  <FacetDetail
    :view="view"
    :status="status"
    missing-text="找不到此標籤"
  />
</template>
