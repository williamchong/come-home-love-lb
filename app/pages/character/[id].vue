<script setup lang="ts">
const route = useRoute()
const id = computed(() => decodeURIComponent(String(route.params.id)))

const { data: ds } = useDatasetAsync()

const ch = computed(() => ds.value?.charactersById.get(id.value) || null)
const episodes = computed(() => {
  if (!ds.value || !ch.value) return []
  return (ch.value.episodeNos || []).map(n => ds.value!.episodesByNo.get(n)).filter(isPresent)
})
const plotlines = computed(() => {
  const name = ch.value?.name
  if (!ds.value || !name) return []
  return ds.value.plotlines.filter(p => p.characters.includes(name))
})

watchEffect(() => {
  if (ch.value) useSeoMeta({ title: `${ch.value.name}｜愛·回家之開心速遞` })
})
</script>

<template>
  <UContainer class="py-6 max-w-3xl">
    <UButton
      to="/"
      icon="i-lucide-arrow-left"
      variant="link"
      color="neutral"
      class="mb-4 px-0"
    >
      返回劇集導航
    </UButton>

    <div
      v-if="!ds"
      class="text-muted py-20 text-center"
    >
      載入中…
    </div>
    <div
      v-else-if="!ch"
      class="text-muted py-20 text-center"
    >
      找不到此角色。
    </div>
    <template v-else>
      <h1 class="text-2xl font-bold text-highlighted">
        {{ ch.name }}
      </h1>
      <p class="text-muted mt-1">
        <span v-if="ch.actor">{{ ch.actor }} 飾</span>
        <span v-if="ch.group"> · {{ ch.group }}</span>
        <span v-if="ch.homophone"> · 諧音「{{ ch.homophone }}」</span>
      </p>
      <p
        v-if="ch.bio"
        class="mt-3 text-sm leading-relaxed whitespace-pre-line"
      >
        {{ ch.bio }}
      </p>

      <USeparator class="my-6" />

      <section
        v-if="plotlines.length"
        class="mb-6"
      >
        <h2 class="text-sm font-semibold text-muted mb-2">
          相關故事線
        </h2>
        <div class="flex flex-wrap gap-2">
          <UButton
            v-for="p in plotlines"
            :key="p.id"
            :to="`/plotline/${p.id}`"
            size="xs"
            color="primary"
            variant="soft"
          >
            {{ p.name }}（{{ p.episodes.length }}）
          </UButton>
        </div>
      </section>

      <section>
        <h2 class="text-sm font-semibold text-muted mb-2">
          焦點劇集 <span class="text-primary">{{ episodes.length }}</span>
        </h2>
        <div
          v-if="!episodes.length"
          class="text-muted text-sm"
        >
          未有以此角色為主線的劇集紀錄。
        </div>
        <div
          v-else
          class="grid sm:grid-cols-2 gap-2"
        >
          <EpisodeCard
            v-for="ep in episodes"
            :key="ep.no"
            :episode="ep"
            :ds="ds"
          />
        </div>
      </section>
    </template>
  </UContainer>
</template>
