<script setup lang="ts">
import { SERIES_NAME, pageTitle } from '~/types'

const route = useRoute()
const id = computed(() => String(route.params.id))

const { data: view, status } = await usePlotlineViewAsync(id)

const pl = computed(() => view.value?.pl ?? null)
const sorted = computed(() => [...(pl.value?.episodes || [])].sort((a, b) => a.no - b.no))
const highlighted = useEpisodeAnchor(sorted)
// milestones that live inside this plot line
const milestones = computed(() => TAGS.filter(t => t.kind === 'milestone' && t.parentPlotlineId === id.value))
const tagStyle = (tagId: string) => toneBadgeStyle(TAG_TONES.get(tagId))
const membersById = computed(() => byId(view.value?.members ?? []))
// 劇集順序 is literally a playlist, so opening one of its episodes hands the
// line along as `?list=` and prev/next there keep following it.
const list = computed(() => facetToken('plotlines', id.value))
// A plot line lists members by name, and name === id on the roster. The leftover
// tokens differ by category: 節日 lines list festival names (no entity to tone),
// every other category lists families and departments — 熊氏一家, 接龍集團保安部 —
// which resolve to the same hue their members carry.
const memberStyle = (name: string) => toneTextStyle(
  tokenTone(name, membersById.value, pl.value?.category !== 'festival')
)

const title = computed(() => (pl.value ? pageTitle(pl.value.name) : '找不到此故事線'))

const description = computed(() => {
  const p = pl.value
  if (!p) return undefined
  return sentences([
    `《${SERIES_NAME}》${p.categoryLabel}「${p.name}」，共 ${p.episodes.length} 集`,
    p.characters.length > 0 && `涉及${p.characters.join('、')}`,
    p.summary
  ])
})

usePageSeo(title, description)

useSchemaOrg(computed(() => (pl.value ? [homeBreadcrumb(pl.value.name)] : [])))
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

    <LoadingState
      v-if="status === 'pending'"
      text="載入中…"
      class="py-20 justify-center"
    />
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
      <!-- the line's own hue, the same one its badge carries on every card -->
      <h1
        class="text-2xl font-bold text-highlighted"
        :style="toneTextStyle(pl.tone)"
      >
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
          :style="tagStyle(m.id)"
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
          :id="episodeAnchor(e.no)"
          :key="e.no"
          :class="EPISODE_ANCHOR_CLASS"
        >
          <ULink
            :to="episodeLink(e.no, list)"
            class="flex gap-3 py-1.5 px-2 rounded hover:bg-elevated"
            :class="highlighted === e.no && `bg-elevated ${EPISODE_ANCHOR_RING}`"
          >
            <span class="tabular-nums text-muted w-12 text-right shrink-0">{{ e.no }}</span>
            <span class="text-highlighted">{{ e.title }}</span>
          </ULink>
        </li>
      </ol>
    </template>
  </UContainer>
</template>
