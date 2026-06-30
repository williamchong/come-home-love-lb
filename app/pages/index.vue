<script setup lang="ts">
const { data: ds, status } = useDatasetAsync()

const { state, filtered, activeCount, reset } = useEpisodeFilter(ds)

// pagination
const PAGE = 48
const page = ref(1)
watch(filtered, () => {
  page.value = 1
})
const paged = computed(() => filtered.value.slice((page.value - 1) * PAGE, page.value * PAGE))

// mobile filter drawer
const drawerOpen = ref(false)

// shared across the desktop sidebar + mobile drawer instances of FilterPanel
const panelProps = computed(() => ({ ds: ds.value!, activeCount: activeCount.value, resultCount: filtered.value.length }))

// quick presets (set a filter in one click) — resolved against the loaded data
const presets = computed(() => {
  if (!ds.value) return []
  const find = (label: string, list: { value: string, label: string }[]) => list.find(o => o.label.includes(label))
  const out: { text: string, apply: () => void }[] = []
  const apply = (key: 'plotlines' | 'tags' | 'characters', value: string) => () => {
    reset()
    state.value[key] = [value]
  }
  const add = (text: string, opt: { value: string } | undefined, key: 'plotlines' | 'tags' | 'characters') => {
    if (opt) out.push({ text, apply: apply(key, opt.value) })
  }
  add('💍 龔水戀', find('龔水戀', ds.value.facets.plotlines), 'plotlines')
  add('☕ 仁菲戀', find('仁菲戀', ds.value.facets.plotlines), 'plotlines')
  add('🎭 歐陽bobby', find('歐陽bobby', ds.value.facets.tagsByKind.cameo), 'tags')
  add('💒 龔水結婚', find('龔水結婚', ds.value.facets.tagsByKind.milestone), 'tags')
  add('🎄 聖誕節', find('聖誕', ds.value.facets.tagsByKind.festival), 'tags')
  add('🏫 香港島大學', find('香港島大學', ds.value.facets.tagsByKind.location), 'tags')
  const cui = ds.value.facets.characters.find(c => c.label === '崔李悟璋')
  if (cui) out.push({ text: '👵 崔auntie', apply: apply('characters', cui.value) })
  return out
})

useSeoMeta({
  title: '愛·回家之開心速遞 劇集導航',
  description: '篩選 2800+ 集《愛·回家之開心速遞》，依角色、故事線、CP、節日、客串、里程碑、地點快速找到想重溫的劇集。'
})
</script>

<template>
  <UContainer class="py-4 sm:py-6">
    <div class="mb-4 sm:mb-6">
      <h1 class="text-xl sm:text-3xl font-bold text-highlighted">
        愛·回家之開心速遞 · 劇集導航
      </h1>
      <p class="text-muted mt-1 text-sm hidden sm:block">
        篩選 {{ ds?.meta.total?.toLocaleString() ?? '2800+' }} 集，依角色、故事線、CP、節日、客串、里程碑與地點找回想重溫的劇情。
      </p>
    </div>

    <div
      v-if="status === 'pending' || !ds"
      class="flex items-center gap-2 text-muted py-20 justify-center"
    >
      <UIcon
        name="i-lucide-loader-circle"
        class="animate-spin size-5"
      />
      載入劇集資料中…
    </div>

    <template v-else>
      <!-- mobile: sticky filter bar (desktop uses the sidebar instead) -->
      <div class="lg:hidden sticky top-(--ui-header-height) z-10 -mx-4 px-4 py-2 mb-3 bg-default/80 backdrop-blur border-b border-default flex items-center gap-3">
        <UButton
          icon="i-lucide-sliders-horizontal"
          color="neutral"
          variant="subtle"
          @click="drawerOpen = true"
        >
          篩選
          <UBadge
            v-if="activeCount"
            color="primary"
            size="sm"
          >
            {{ activeCount }}
          </UBadge>
        </UButton>
        <span class="text-sm text-muted">
          <span class="font-semibold text-highlighted">{{ filtered.length.toLocaleString() }}</span> 集
        </span>
      </div>

      <div class="grid lg:grid-cols-[300px_1fr] gap-6 items-start">
        <aside class="hidden lg:block lg:sticky lg:top-(--ui-header-height)">
          <FilterPanel
            v-bind="panelProps"
            @reset="reset"
          />
        </aside>

        <div>
          <div
            v-if="!activeCount"
            class="mb-4 flex gap-2 overflow-x-auto pb-1 lg:flex-wrap lg:overflow-visible"
          >
            <UButton
              v-for="p in presets"
              :key="p.text"
              size="sm"
              color="neutral"
              variant="soft"
              class="shrink-0"
              @click="p.apply"
            >
              {{ p.text }}
            </UButton>
          </div>

          <div
            v-if="!filtered.length"
            class="text-center text-muted py-20"
          >
            沒有符合條件的劇集，試試放寬篩選。
          </div>

          <div
            v-else
            class="grid sm:grid-cols-2 gap-3"
          >
            <EpisodeCard
              v-for="ep in paged"
              :key="ep.no"
              :episode="ep"
              :ds="ds"
            />
          </div>

          <div
            v-if="filtered.length > PAGE"
            class="mt-6 flex justify-center"
          >
            <UPagination
              v-model:page="page"
              :total="filtered.length"
              :items-per-page="PAGE"
              :sibling-count="1"
            />
          </div>
        </div>
      </div>

      <!-- mobile: filter drawer (bottom sheet) -->
      <UDrawer
        v-model:open="drawerOpen"
        title="篩選劇集"
      >
        <template #body>
          <div class="max-h-[70vh] overflow-y-auto px-1">
            <FilterPanel
              v-bind="panelProps"
              :show-count="false"
              @reset="reset"
            />
          </div>
        </template>
        <template #footer>
          <UButton
            block
            color="primary"
            @click="drawerOpen = false"
          >
            查看 {{ filtered.length.toLocaleString() }} 集
          </UButton>
        </template>
      </UDrawer>
    </template>
  </UContainer>
</template>
