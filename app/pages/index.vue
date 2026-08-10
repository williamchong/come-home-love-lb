<script setup lang="ts">
import { SERIES_NAME, SITE_LOCALE } from '~/types'

// Two tiers: `core` (episodes/tags/meta) paints the list fast; `full` (adds
// characters/plot lines/groups) loads in the background for the facet panel.
const { data: core } = useCoreDatasetAsync()
const { data: full } = useDatasetAsync()

// Paging lives in the filter state alongside the facets, so it mirrors to the
// URL (?p=3) and a shared link opens where it was left.
const { state, filtered, paged, pageCount, activeCount, reset } = useEpisodeFilter(core)

// Both tiers are client-only, so the prerendered homepage would otherwise ship
// a spinner as its entire body. The seed is one page of episodes rendered at
// build time — real text and 48 crawlable links — and it hands over to the
// filterable list the moment `core` resolves.
const { data: seed } = await useHomeSeedAsync(PAGE_SIZE)
const seedPlotlinesById = computed(() => byId(seed.value?.cardPlotlines ?? []))
const seedCharactersById = computed(() => byId(seed.value?.cardCharacters ?? []))

// mobile filter drawer
const drawerOpen = ref(false)

// jump straight to an episode by number — faster than filtering when you already
// know which one you want. Resolved against the dataset so typos don't 404.
const jumpNo = ref('')
const jumpTarget = computed(() => {
  const n = Number(jumpNo.value)
  return Number.isInteger(n) && core.value?.episodesByNo.has(n) ? n : null
})
// The form renders above the loading guard, so `core` is still null on first
// paint — only call a number missing once there is a dataset to miss from.
const jumpUnknown = computed(() => Boolean(core.value && jumpNo.value && !jumpTarget.value))
function jump() {
  if (jumpTarget.value) navigateTo(`/episode/${jumpTarget.value}`)
}

// shared across the desktop sidebar + mobile drawer instances of FilterPanel;
// null until the full tier loads, so render sites guard on `v-if="panelProps"`
const panelProps = computed(() => full.value
  ? { ds: full.value, activeCount: activeCount.value, resultCount: filtered.value.length }
  : null)

// 精選: curated entry points from `data/overlay.json → featured`, resolved into
// the prerendered seed so the first screen is a browsable index.
const featured = computed(() => seed.value?.featured ?? [])

const listHeading = computed(() =>
  activeCount.value ? '篩選結果' : SORT_HEADING[state.value.sort])

// Title and description come from app.vue, which already carries the
// site-level pair this page would otherwise repeat verbatim.
useSchemaOrg([
  defineTVSeries({
    name: SERIES_NAME,
    alternateName: 'Come Home Love: Lo and Behold',
    inLanguage: SITE_LOCALE,
    numberOfEpisodes: seed.value?.meta.total,
    genre: ['Sitcom', 'Comedy']
  })
])
</script>

<template>
  <UContainer class="py-4 sm:py-6">
    <div class="mb-4 sm:mb-6">
      <h1 class="text-xl sm:text-3xl font-bold text-highlighted">
        愛·回家之開心速遞 · 劇集導航
      </h1>
      <p class="text-muted mt-1 text-sm hidden sm:block">
        篩選 {{ seed?.meta.total.toLocaleString() ?? '2800+' }} 集，依角色、故事線、CP、節日、客串與里程碑找回想重溫的劇情。
      </p>

      <form
        class="mt-3 flex items-center gap-2"
        @submit.prevent="jump"
      >
        <UInput
          v-model="jumpNo"
          type="number"
          inputmode="numeric"
          placeholder="集數"
          icon="i-lucide-hash"
          size="sm"
          class="w-28"
          :aria-label="'跳至指定集數'"
        />
        <UButton
          type="submit"
          size="sm"
          color="neutral"
          variant="subtle"
          :disabled="!jumpTarget"
        >
          前往
        </UButton>
        <span
          v-if="jumpUnknown"
          class="text-xs text-error"
        >沒有第 {{ jumpNo }} 集</span>
      </form>
    </div>

    <!-- 精選 — part of the prerendered seed, so the first screen is curated
         entry points rather than a spinner. Hidden once a filter is on: it is
         a place to start from, not a result.
         `!core ||` is what keeps hydration honest: the prerendered HTML is
         always unfiltered, while the client has already read the arrival query
         by first render, so gating on `activeCount` alone would drop this
         section on a shared /?plots=… link and mismatch. Before the dataset
         lands both sides agree it is shown; the filter can hide it after. -->
    <section
      v-if="featured.length && (!core || !activeCount)"
      class="mb-5"
    >
      <h2 class="text-sm font-semibold text-highlighted mb-2">
        精選
      </h2>
      <div class="flex gap-2 overflow-x-auto pb-1 sm:grid sm:grid-cols-3 lg:grid-cols-4 sm:overflow-visible sm:pb-0">
        <FeaturedCard
          v-for="f in featured"
          :key="`${f.kind}:${f.id}`"
          :item="f"
        />
      </div>
    </section>

    <!-- Prerendered seed — see `useHomeSeedAsync` above. Mirrors the real grid
         so handing over to the filterable list doesn't shift the layout. -->
    <div v-if="!core">
      <!-- the seed's own order, not `listHeading`: a heading that varied with
           the arrival query would mismatch, for the reason given above -->
      <h2 class="text-sm font-semibold text-highlighted mb-2">
        {{ SORT_HEADING[DEFAULT_SORT] }}
      </h2>
      <div class="grid sm:grid-cols-2 gap-3">
        <EpisodeCard
          v-for="ep in seed?.episodes ?? []"
          :key="ep.no"
          :episode="ep"
          :plotlines-by-id="seedPlotlinesById"
          :characters-by-id="seedCharactersById"
        />
      </div>
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
        <SortSelect class="ml-auto" />
      </div>

      <div class="grid lg:grid-cols-[300px_1fr] gap-6 items-start">
        <!-- capped to the viewport so the panel's browse block scrolls inside
             the sticky sidebar instead of running off the bottom of it -->
        <aside class="hidden lg:flex lg:flex-col lg:sticky lg:top-(--ui-header-height) lg:max-h-[calc(100dvh-var(--ui-header-height))]">
          <FilterPanel
            v-if="panelProps"
            v-bind="panelProps"
            @reset="reset"
          />
          <LoadingState
            v-else
            text="載入篩選器…"
            class="py-4"
          />
        </aside>

        <div>
          <!-- mobile shows sort in the sticky bar instead -->
          <div class="flex items-center justify-between gap-3 -mt-1 mb-2">
            <h2 class="text-sm font-semibold text-highlighted">
              {{ listHeading }}
            </h2>
            <SortSelect class="hidden lg:block" />
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
              :plotlines-by-id="full?.plotlinesById"
              :characters-by-id="full?.charactersById"
            />
          </div>

          <div
            v-if="pageCount > 1"
            class="mt-6 flex justify-center"
          >
            <UPagination
              v-model:page="state.page"
              :total="filtered.length"
              :items-per-page="PAGE_SIZE"
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
              v-if="panelProps"
              v-bind="panelProps"
              variant="drawer"
              @reset="reset"
            />
            <LoadingState
              v-else
              text="載入篩選器…"
              class="py-8 justify-center"
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
