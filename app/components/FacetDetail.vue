<script setup lang="ts">
import type { AsyncDataRequestStatus } from '#app'
import type { FacetView } from '~/composables/useDetailView'
import { SERIES_NAME, pageTitle } from '~/types'

/**
 * The page behind a 節日 / 客串 / 里程碑 / 家庭・機構 / 編劇 facet.
 *
 * One component for all five because they differ only in where their episodes
 * come from, which `buildFacetView` already resolved. The three routes that
 * mount it are thin on purpose — a page each so the URLs read as
 * `/tag/迎新年` rather than `/facet/tags/迎新年`, and so each can be prerendered
 * and sitemapped on its own terms.
 *
 * SEO lives here rather than in those routes for the same reason: it is derived
 * entirely from the view, and three copies of it would be three chances to drift.
 */
const props = defineProps<{
  view: FacetView | null | undefined
  status: AsyncDataRequestStatus
  /** What to say when nothing resolves — 找不到此標籤 / 此分類 / 此編劇. */
  missingText: string
}>()

const episodes = computed(() => props.view?.episodes ?? [])
const highlighted = useEpisodeAnchor(episodes)
const cardPlotlinesById = computed(() => byId(props.view?.cardPlotlines ?? []))
const cardCharactersById = computed(() => byId(props.view?.cardCharacters ?? []))

const title = computed(() => (props.view ? pageTitle(props.view.label) : props.missingText))
const description = computed(() => {
  const view = props.view
  if (!view) return undefined
  return sentences([
    `《${SERIES_NAME}》${view.meta}「${view.label}」，共 ${view.episodes.length} 集`,
    view.summary
  ])
})

usePageSeo(title, description)
// Prerendered for every real facet, so the Worker only renders this for an
// invented URL — which has to answer 404 rather than a friendly 200.
useMissingSubjectStatus(!props.view)
useSchemaOrg(computed(() => (props.view ? [homeBreadcrumb(props.view.label)] : [])))
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
      v-else-if="!view"
      class="text-muted py-20 text-center"
    >
      {{ missingText }}。
    </div>
    <template v-else>
      <h1
        class="text-2xl font-bold text-highlighted"
        :style="toneTextStyle(view.tone)"
      >
        {{ view.label }}
      </h1>
      <p class="text-muted mt-1 text-sm">
        {{ view.meta }}
      </p>
      <p
        v-if="view.summary"
        class="mt-3 text-sm leading-relaxed"
      >
        {{ view.summary }}
      </p>

      <VoteButtons
        :subject="view.token"
        :label="view.label"
        class="mt-3"
      />

      <USeparator class="my-6" />

      <section>
        <h2 class="text-sm font-semibold text-muted mb-2">
          相關劇集 <span class="text-primary">{{ episodes.length }}</span>
        </h2>
        <div class="grid sm:grid-cols-2 gap-2">
          <!-- `list` is the page's own token, so opening a card keeps prev/next
               stepping through this facet rather than reverting to ±1. -->
          <EpisodeCard
            v-for="ep in episodes"
            :key="ep.no"
            :episode="ep"
            :plotlines-by-id="cardPlotlinesById"
            :characters-by-id="cardCharactersById"
            :list="view.token"
            :highlighted="highlighted === ep.no"
          />
        </div>
      </section>
    </template>
  </UContainer>
</template>
