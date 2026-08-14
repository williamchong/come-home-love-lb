<script setup lang="ts">
// 家庭・機構. The id is the raw 故事主人翁 token an episode carries in
// `groupIds` — the same value the panel's chip holds, not an entry in
// `groups.json`, which nothing reads.
const route = useRoute()
const id = computed(() => decodeURIComponent(String(route.params.id)))

const { data: view, status } = await useFacetViewAsync('groups', id)
</script>

<template>
  <FacetDetail
    :view="view"
    :status="status"
    missing-text="找不到此分類"
  />
</template>
