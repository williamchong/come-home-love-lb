<script setup lang="ts">
const route = useRoute()
const id = computed(() => String(route.params.id))

const { data: ds } = useDatasetAsync()

const pl = computed(() => ds.value?.plotlinesById.get(id.value) || null)
const sorted = computed(() => [...(pl.value?.episodes || [])].sort((a, b) => a.no - b.no))
// milestones that live inside this plot line
const milestones = computed(() => (ds.value?.tags || []).filter(t => t.kind === 'milestone' && t.parentPlotlineId === id.value))
const tones = computed(() => tagTones(ds.value?.tags ?? []))
// A plot line lists members by name, and name === id on the roster. The leftover
// tokens differ by category: 節日 lines list festival names (no entity to tone),
// every other category lists families and departments — 熊氏一家, 接龍集團保安部 —
// which resolve to the same hue their members carry.
const memberStyle = (name: string) => toneTextStyle(
  ds.value && tokenTone(name, ds.value.charactersById, pl.value?.category !== 'festival')
)

watchEffect(() => {
  if (pl.value) useSeoMeta({ title: `${pl.value.name}｜愛·回家之開心速遞` })
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
      v-else-if="!pl"
      class="text-muted py-20 text-center"
    >
      找不到此故事線。
    </div>
    <template v-else>
      <UBadge
        color="primary"
        variant="soft"
        class="mb-2"
      >
        {{ pl.categoryLabel }}
      </UBadge>
      <h1 class="text-2xl font-bold text-highlighted">
        {{ pl.name }}
      </h1>

      <div
        v-if="pl.characters.length"
        class="mt-2 flex flex-wrap gap-2"
      >
        <UButton
          v-for="c in pl.characters"
          :key="c"
          :to="`/character/${encodeURIComponent(c)}`"
          size="xs"
          color="neutral"
          variant="subtle"
          :style="memberStyle(c)"
        >
          {{ c }}
        </UButton>
      </div>

      <p
        v-if="pl.summary"
        class="mt-3 text-sm leading-relaxed"
      >
        {{ pl.summary }}
      </p>

      <div
        v-if="milestones.length"
        class="mt-4 flex flex-wrap gap-2"
      >
        <UBadge
          v-for="m in milestones"
          :key="m.id"
          color="neutral"
          variant="soft"
          icon="i-lucide-flag"
          :style="toneBadgeStyle(tones.get(m.id))"
        >
          {{ m.label }}（{{ m.episodeNos.join('、') }}）
        </UBadge>
      </div>

      <USeparator class="my-6" />

      <h2 class="text-sm font-semibold text-muted mb-3">
        劇集順序 <span class="text-primary">{{ sorted.length }}</span> 集
      </h2>
      <ol class="space-y-1">
        <li
          v-for="e in sorted"
          :key="e.no"
        >
          <ULink
            :to="`/episode/${e.no}`"
            class="flex gap-3 py-1.5 px-2 rounded hover:bg-elevated"
          >
            <span class="tabular-nums text-muted w-12 text-right shrink-0">{{ e.no }}</span>
            <span class="text-highlighted">{{ e.title }}</span>
          </ULink>
        </li>
      </ol>
    </template>
  </UContainer>
</template>
