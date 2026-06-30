<script setup lang="ts">
import { CATEGORY_LABEL, TAG_COLOR } from '~/types'

const route = useRoute()
const no = computed(() => Number(route.params.no))

const { data: ds } = useDatasetAsync()

const ep = computed(() => ds.value?.episodesByNo.get(no.value) || null)
const characters = computed(() => (ep.value?.characterIds || []).map(id => ds.value?.charactersById.get(id)).filter(isPresent))
const plotlines = computed(() => (ep.value?.plotlineIds || []).map(id => ds.value?.plotlinesById.get(id)).filter(isPresent))
const tags = computed(() => (ep.value?.tagIds || []).map(id => ds.value?.tagsById.get(id)).filter(isPresent))
const prev = computed(() => ds.value?.episodesByNo.get(no.value - 1))
const next = computed(() => ds.value?.episodesByNo.get(no.value + 1))

watchEffect(() => {
  if (ep.value) useSeoMeta({ title: `第${ep.value.no}集 ${ep.value.title}｜愛·回家之開心速遞` })
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
      v-else-if="!ep"
      class="text-muted py-20 text-center"
    >
      找不到第 {{ no }} 集。
    </div>
    <template v-else>
      <div class="flex items-baseline gap-3">
        <span class="text-3xl font-bold tabular-nums text-primary">{{ ep.no }}</span>
        <h1 class="text-2xl font-bold text-highlighted">
          {{ ep.title }}
        </h1>
      </div>
      <p class="text-muted mt-1">
        {{ ep.date }} · 編劇 {{ ep.writers.join('、') || '—' }}
      </p>

      <div
        v-if="tags.length"
        class="mt-4 space-y-2"
      >
        <div
          v-for="t in tags"
          :key="t.id"
        >
          <UBadge
            :color="TAG_COLOR[t.kind]"
            variant="soft"
          >
            {{ t.label }}
          </UBadge>
          <span
            v-if="t.summary"
            class="text-sm text-muted ml-2"
          >{{ t.summary }}</span>
        </div>
      </div>

      <USeparator class="my-6" />

      <section
        v-if="ep.focus.length"
        class="mb-5"
      >
        <h2 class="text-sm font-semibold text-muted mb-2">
          主線角色
        </h2>
        <div class="flex flex-wrap gap-2">
          <UBadge
            v-for="c in ep.focus"
            :key="c"
            color="primary"
            variant="soft"
          >
            {{ c }}
          </UBadge>
        </div>
      </section>

      <section
        v-if="characters.length"
        class="mb-5"
      >
        <h2 class="text-sm font-semibold text-muted mb-2">
          出場角色
        </h2>
        <div class="flex flex-wrap gap-2">
          <UButton
            v-for="c in characters"
            :key="c.id"
            :to="`/character/${encodeURIComponent(c.id)}`"
            size="xs"
            color="neutral"
            variant="subtle"
          >
            {{ c.name }}<span
              v-if="c.actor"
              class="text-muted ml-1"
            >/ {{ c.actor }}</span>
          </UButton>
        </div>
      </section>

      <section
        v-if="plotlines.length"
        class="mb-5"
      >
        <h2 class="text-sm font-semibold text-muted mb-2">
          所屬故事線
        </h2>
        <div class="flex flex-col gap-2">
          <ULink
            v-for="p in plotlines"
            :key="p.id"
            :to="`/plotline/${p.id}`"
            class="text-primary hover:underline"
          >
            {{ p.name }} <span class="text-muted text-xs">· {{ CATEGORY_LABEL[p.category] }}（{{ p.episodes.length }} 集）</span>
          </ULink>
        </div>
      </section>

      <USeparator class="my-6" />
      <div class="flex justify-between">
        <UButton
          v-if="prev"
          :to="`/episode/${prev.no}`"
          icon="i-lucide-chevron-left"
          variant="ghost"
          color="neutral"
        >
          {{ prev.no }} {{ prev.title }}
        </UButton>
        <span v-else />
        <UButton
          v-if="next"
          :to="`/episode/${next.no}`"
          trailing-icon="i-lucide-chevron-right"
          variant="ghost"
          color="neutral"
        >
          {{ next.no }} {{ next.title }}
        </UButton>
      </div>
    </template>
  </UContainer>
</template>
