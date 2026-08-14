<script setup lang="ts">
import { SERIES_NAME, SITE_LOCALE, pageTitle } from '~/types'

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

// The drawer's search button opens the omnibox, and a palette stacked on a bottom
// sheet is two overlays deep on the smallest screen — hand over instead. The
// drawer exists to add a filter, which is what the palette is about to do.
const { open: omniboxOpen } = useOmnibox()
watch(omniboxOpen, (v) => {
  if (v) drawerOpen.value = false
})

// shared across the desktop sidebar + mobile drawer instances of FilterPanel;
// null until the full tier loads, so render sites guard on `v-if="panelProps"`
const panelProps = computed(() => full.value
  ? { ds: full.value, activeCount: activeCount.value, resultCount: filtered.value.length }
  : null)

/**
 * 精選: curated entry points from `data/overlay.json → featured`, resolved into
 * the prerendered seed so the first screen is a browsable index — reordered by
 * what people actually voted for, since a row of eight cards can put the
 * best-liked one first at no cost in space.
 *
 * The overlay's own order survives as the tie-break, and does the whole job on
 * its own until scores exist: `Array.sort` is stable, so an unvoted card keeps
 * the position the curation gave it, and a scoreless site renders exactly the
 * row it rendered before. That is also what makes this hydration-safe — scores
 * only land after `onNuxtReady`, so the prerendered HTML and the client's first
 * render agree on the curated order and the sort arrives later as a patch.
 *
 * `scoresInPlay` for the same reason the list's sort and the panel's browse
 * block ask it: a visit showing no scores anywhere shows the curated row.
 *
 * Copied before sorting: `seed` is the payload, and sorting in place would
 * mutate it under `useAsyncData`.
 */
const { net, scoresInPlay } = useVotes()
const featured = computed(() => {
  const cards = seed.value?.featured ?? []
  if (!scoresInPlay.value) return cards
  return [...cards].sort((a, b) => (net(b.token) ?? 0) - (net(a.token) ?? 0))
})

/**
 * The list an opened card hands on to the episode page as `?list=`.
 *
 * Only when the results are narrowed to exactly one facet and nothing else:
 * that is the "I'm browsing 龔水戀" case, and the token names a list the
 * episode page can resolve and label on its own. Two facets AND-ed together,
 * or a facet plus a title search / year range / 配角出場, describe a set with no
 * name and no page — those keep the sequential default rather than promise a
 * playlist that isn't the one on screen.
 *
 * One token *and* one active filter is what rules the first two out, since
 * `activeFilterCount` counts the title search and each year bound alongside the
 * facets. 配角出場 deliberately isn't in that count, so it is checked here.
 */
const tokens = useFacetTokens(state)
const list = computed(() => (tokens.value.length === 1 && activeCount.value === 1 && !state.value.includeMentions
  ? tokens.value[0]!
  : null))

// `useSortKey`, not `state.sort`: the heading has to name the order the rows are
// in, which is not 最高分 on a visit where the scores never arrived.
const sortKey = useSortKey()
const listHeading = computed(() =>
  activeCount.value ? '篩選結果' : SORT_HEADING[sortKey.value])

/**
 * The tab title, when the view has a name.
 *
 * `list` is reused rather than re-derived: it is already the "these results are
 * exactly one named facet" test, so the tab is titled after the very playlist
 * the cards hand on. Anything broader — two facets AND-ed, a facet plus a title
 * search — describes a set with no name, and falls back to the site title.
 *
 * `pageTitle` keeps the series name, as every detail page does; the 劇集導航
 * qualifier is what stops「安凌線」filtered here from reading exactly like the
 * 安凌線 page's own title, since both would otherwise resolve to the same string.
 *
 * `null`, not SITE_TITLE, is that fallback, and app.vue must **not** set a
 * `title` of its own beside its `titleTemplate` — the template already returns
 * SITE_TITLE for an unset title, and a second entry spelling the same string
 * costs this one its claim on the tag: unhead then keeps resolving to app.vue's
 * static value and this getter's later, real title never reaches the DOM. It
 * fails silently, so re-adding `title:` there looks harmless and isn't.
 *
 * Only the title moves. og:title stays site-level on purpose: GitHub Pages
 * serves one prerendered index.html for every query string, so a shared
 * /?plots=… link is scraped as the unfiltered home page whatever the tab says.
 * `byToken` needs the full tier, which is client-only, so the prerendered head
 * always carries SITE_TITLE and unhead patches this in a tick later — a head
 * tag is patched rather than hydrated, so the two disagreeing is not a mismatch.
 */
const { byToken } = useFacetIndex(full)
useSeoMeta({
  title: () => {
    const label = list.value && byToken.value.get(list.value)?.label
    return label ? pageTitle(`${label} · 劇集導航`) : null
  }
})

// Description comes from app.vue, which already carries the site-level line
// this page would otherwise repeat verbatim.
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

      <!-- The site's front door. Renders identically before and after either
           tier lands, so it is above the loading guard and hydration-safe. -->
      <SearchOmnibox class="mt-3" />
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
          :key="f.token"
          :item="f"
        />
      </div>
    </section>

    <!-- Prerendered seed — see `useHomeSeedAsync` above. Mirrors the real grid
         so handing over to the filterable list doesn't shift the layout. -->
    <div v-if="!core">
      <!-- the seed's own order, not `listHeading`: a heading that varied with
           the arrival query would mismatch, for the reason given above. It is
           `SCORELESS_SORT` rather than the default because that is the order
           `buildHomeSeed` could actually build at deploy time — 得分 is a
           promise only the client can keep. -->
      <h2 class="text-sm font-semibold text-highlighted mb-2">
        {{ SORT_HEADING[SCORELESS_SORT] }}
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
              :list="list"
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
