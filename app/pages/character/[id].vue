<script setup lang="ts">
import { SERIES_NAME, pageTitle } from '~/types'

const route = useRoute()
const id = computed(() => decodeURIComponent(String(route.params.id)))

const { data: view, status } = await useCharacterViewAsync(id)

const ch = computed(() => view.value?.ch ?? null)
const episodes = computed(() => view.value?.episodes ?? [])
const highlighted = useEpisodeAnchor(episodes)
const plotlines = computed(() => view.value?.plotlines ?? [])
const cardPlotlinesById = computed(() => byId(view.value?.cardPlotlines ?? []))
const cardCharactersById = computed(() => byId(view.value?.cardCharacters ?? []))
// the subject's own tone, the same one their name carries on every card
const tone = computed(() => ch.value && characterTone(ch.value))
// 焦點劇集 is a playlist too — opening one keeps prev/next on this character.
const list = computed(() => facetToken('characters', id.value))

const title = computed(() => (ch.value ? pageTitle(ch.value.name) : '找不到此角色'))

const description = computed(() => {
  const c = ch.value
  if (!c) return undefined
  const who = [c.actor ? `${c.name}（${c.actor} 飾）` : c.name, c.group].filter(Boolean).join('，')
  return sentences([
    `《${SERIES_NAME}》${who}`,
    c.bio,
    episodes.value.length > 0 && `共 ${episodes.value.length} 集以其為主線`
  ])
})

usePageSeo(title, description)
useMissingSubjectStatus(!ch.value)

// Roster footnotes are still served, so their links resolve, but kept out of
// the index. nuxt.config filters the sitemap on the very same predicate.
// Spelled as a directive string, not `{ index: false }` — the object form drops
// every false-valued key, so it can express `index` but never `noindex`.
const indexable = computed(() => Boolean(ch.value) && isIndexableCharacter(ch.value!, plotlines.value.length > 0))
useRobotsRule(computed(() => (indexable.value ? 'index, follow' : 'noindex, follow')))

useSchemaOrg(computed(() => (ch.value ? [homeBreadcrumb(ch.value.name)] : [])))
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
      v-else-if="!ch"
      class="text-muted py-20 text-center"
    >
      找不到此角色。
    </div>
    <template v-else>
      <h1
        class="text-2xl font-bold text-highlighted"
        :style="toneTextStyle(tone)"
      >
        {{ ch.name }}
      </h1>
      <p class="text-muted mt-1">
        <span v-if="ch.actor">{{ ch.actor }} 飾</span>
        <span
          v-if="ch.group"
          :style="toneTextStyle(familyTone(ch.group))"
        > · {{ ch.group }}</span>
        <span v-if="ch.homophone"> · 諧音「{{ ch.homophone }}」</span>
      </p>
      <p
        v-if="ch.bio"
        class="mt-3 text-sm leading-relaxed whitespace-pre-line"
      >
        {{ ch.bio }}
      </p>

      <VoteButtons
        :subject="subjectToken('characters', ch.id)"
        :label="ch.name"
        class="mt-3"
      />

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
            :to="`/plotline/${encodeURIComponent(p.id)}`"
            size="xs"
            color="neutral"
            variant="soft"
            :style="toneTextStyle(p.tone)"
          >
            {{ p.name }}（{{ p.episodeCount }}）
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
            :plotlines-by-id="cardPlotlinesById"
            :characters-by-id="cardCharactersById"
            :list="list"
            :highlighted="highlighted === ep.no"
          />
        </div>
      </section>
    </template>
  </UContainer>
</template>
