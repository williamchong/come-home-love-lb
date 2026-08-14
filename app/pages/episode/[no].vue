<script setup lang="ts">
import { CATEGORY_LABEL, SERIES_NAME, SITE_LOCALE, mytvsuperUrl, pageTitle } from '~/types'

const route = useRoute()
const no = computed(() => Number(route.params.no))

const { data: view, status } = await useEpisodeViewAsync(no)

const ep = computed(() => view.value?.ep ?? null)
const charactersById = computed(() => byId(view.value?.characters ?? []))
const characters = computed(() => (ep.value?.characterIds ?? []).map(id => charactersById.value.get(id)).filter(isPresent))
const plotlines = computed(() => view.value?.plotlines ?? [])
const tags = computed(() => (ep.value?.tagIds ?? []).map(id => TAGS_BY_ID.get(id)).filter(isPresent))
const watchUrl = computed(() => mytvsuperUrl(ep.value?.playId))
const tagStyle = (id: string) => toneBadgeStyle(TAG_TONES.get(id))
// 主線角色 are raw 故事主人翁 tokens — usually a character, occasionally a group
const focusStyle = (token: string) => toneBadgeStyle(
  tokenTone(token, charactersById.value, ep.value?.groupIds.includes(token))
)
// Every link out of here into a list that contains this episode carries it, so
// the list opens at the row you left rather than at its top.
const anchor = computed(() => episodeHash(no.value))
const prev = computed(() => view.value?.prev ?? null)
const next = computed(() => view.value?.next ?? null)
const arcs = computed(() => view.value?.arcs ?? [])
// Null until `?list=` resolves on the client, which is what keeps the bar's
// first render identical to the prerendered HTML. Nuxt seeds a new key's data
// with the previous key's value, so a result resolved around another episode is
// dropped rather than flashed — see `usePlaylistAsync`.
const { data: playlistData } = usePlaylistAsync(no, arcs)
const playlist = computed(() => (playlistData.value?.no === no.value ? playlistData.value : null))

const title = computed(() => (ep.value ? pageTitle(`第${ep.value.no}集 ${ep.value.title}`) : '找不到此劇集'))

// A snippet that can stand on its own: what aired, when, by whom, about whom.
// The title follows a colon rather than sitting in 「」, because plenty of
// titles carry their own quote marks (「琴」的挑戰) and nesting them reads badly.
const description = computed(() => {
  const e = ep.value
  if (!e) return undefined
  const facts = [`${e.date}首播`]
  if (e.writers.length) facts.push(`編劇${e.writers.join('、')}`)
  return sentences([
    `《${SERIES_NAME}》第${e.no}集：${e.title}`,
    facts.join('，'),
    e.protagonists.length > 0 && `主線角色：${e.protagonists.join('、')}`,
    plotlines.value.length > 0 && `所屬故事線：${plotlines.value.map(p => p.name).join('、')}`
  ])
})

usePageSeo(title, description)
useMissingSubjectStatus(!ep.value)

/** 2019年1月24日 → 2019-01-24, the only date form schema.org accepts. */
function isoAirDate(date: string): string | undefined {
  const m = date.match(/(\d{4})年(\d{1,2})月(\d{1,2})日/)
  return m ? `${m[1]}-${m[2]!.padStart(2, '0')}-${m[3]!.padStart(2, '0')}` : undefined
}

useSchemaOrg(computed(() => (ep.value
  ? [
      homeBreadcrumb(`第${ep.value.no}集 ${ep.value.title}`),
      defineTVEpisode({
        name: ep.value.title,
        episodeNumber: ep.value.no,
        datePublished: isoAirDate(ep.value.date),
        inLanguage: SITE_LOCALE,
        partOfSeries: defineTVSeries({ name: SERIES_NAME })
      })
    ]
  : [])))
</script>

<template>
  <!-- Filled to the viewport below `md` so the transport bar can sit on its
       bottom edge. Two things are needed and neither is obvious: `sticky` only
       holds an element back from scrolling away, it never pushes one past where
       the flow put it — hence the column and the spacer below; and a sticky box
       is capped by its containing block's *content* box, so `pb-0`, or the bar
       pins a padding's width above the fold. `svh` rather than `dvh` keeps that
       edge from reflowing as mobile browser chrome retracts.

       `self-start` on the two buttons is the cost of the column: a flex parent
       stretches inline-flex children, which would run them the full width. -->
  <UContainer class="pt-6 pb-0 md:pb-6 max-w-3xl flex flex-col min-h-[calc(100svh-var(--ui-header-height))] md:block md:min-h-0">
    <UButton
      to="/"
      icon="i-lucide-arrow-left"
      variant="link"
      color="neutral"
      class="mb-4 px-0 self-start"
    >
      返回劇集導航
    </UButton>

    <LoadingState
      v-if="status === 'pending'"
      text="載入中…"
      class="py-20 justify-center"
    />
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

      <VoteButtons
        :subject="subjectToken('episodes', ep.no)"
        :label="`第${ep.no}集`"
        class="mt-3 self-start"
      />

      <UButton
        v-if="watchUrl"
        :to="watchUrl"
        target="_blank"
        trailing-icon="i-lucide-external-link"
        size="xs"
        color="neutral"
        variant="subtle"
        class="mt-3 self-start"
      >
        myTV SUPER 收看
      </UButton>

      <div
        v-if="tags.length"
        class="mt-4 space-y-2"
      >
        <div
          v-for="t in tags"
          :key="t.id"
        >
          <UBadge
            color="neutral"
            variant="soft"
            :style="tagStyle(t.id)"
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
            color="neutral"
            variant="soft"
            :style="focusStyle(c)"
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
            :to="`/character/${encodeURIComponent(c.id)}${anchor}`"
            size="xs"
            color="neutral"
            variant="subtle"
            :style="toneTextStyle(characterTone(c))"
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
            :to="`/plotline/${p.id}${anchor}`"
            class="hover:underline"
            :style="toneTextStyle(p.tone)"
          >
            {{ p.name }} <span class="text-muted text-xs">· {{ CATEGORY_LABEL[p.category] }}（{{ p.episodeCount }} 集）</span>
          </ULink>
        </div>
      </section>

      <!-- Takes the leftover height so the bar lands on the bottom edge;
           collapses to nothing once the content fills the viewport, and is
           inert at `md` where the container is back to `block`. -->
      <div class="grow" />

      <!-- ±1 by default; steps through whatever list the visitor arrived inside
           once `?list=` resolves. -->
      <EpisodeTransport
        :no="ep.no"
        :prev="prev"
        :next="next"
        :playlist="playlist"
        :arcs="arcs"
        :plotlines="plotlines"
      />
    </template>
  </UContainer>
</template>
