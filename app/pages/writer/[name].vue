<script setup lang="ts">
// 編劇. Keyed on the writer's name, which is what `Episode.writers` carries and
// therefore what the facet chip already uses as its value.
const route = useRoute()
const name = computed(() => decodeURIComponent(String(route.params.name)))

const { data: view, status } = await useFacetViewAsync('writers', name)
</script>

<template>
  <FacetDetail
    :view="view"
    :status="status"
    missing-text="找不到此編劇"
  />
</template>
