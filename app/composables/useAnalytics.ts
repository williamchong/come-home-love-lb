import type { SubjectKey } from '#shared/utils/subject'
import type { VoteValue } from '#shared/types/votes'
import type { SortKey } from './useEpisodeFilter'
import type { FacetOrder } from './useFacetIndex'

/**
 * The site's one analytics sink.
 *
 * Everything goes to the Google Analytics property configured in
 * `nuxt.config.ts` (`scripts.registry.googleAnalytics`), which is registered
 * **only under `$production`** — so in dev, in `pnpm preview`, and in any build
 * without the registry, `window.gtag` is simply absent and every call below is a
 * no-op. That is deliberate and is the same posture voting takes: analytics is
 * an enhancement, and its absence must never be visible in the app.
 *
 * Why `window.gtag` rather than `useScriptGoogleAnalytics()`:
 * - The registry entry lives under `$production`, so outside it the composable
 *   has no `id` and would register a *second* script — an id-less
 *   `googletagmanager.com/gtag/js` actually loading in dev — plus trip its
 *   dev-only schema validation.
 * - It needs a Nuxt context. Most calls here happen inside event handlers and
 *   `.then()` callbacks, where there isn't one.
 * - Nothing is lost by skipping the proxy: the registry's `clientInit` runs at
 *   app boot (`beforeInit`, well before the 3 s idle trigger) and installs
 *   `window.gtag` as a `dataLayer.push` stub. Events fired at second 0 are
 *   queued and replayed the moment gtag.js evaluates — which is the only reason
 *   instrumenting a script that deliberately loads late works at all.
 *
 * Page views are **not** sent from here. gtag's own `config` covers the landing
 * page and GA4's enhanced measurement covers client-side navigation via history
 * events; sending our own would double-count every one of them. `content_view`
 * below is the complement, not a replacement — it names *what kind of thing* was
 * opened, which no amount of path reporting can infer from `/tag/迎新年`.
 */

/**
 * The `key:value` pair every subject-shaped event reports — see `subjectParams`.
 *
 * `SubjectKey`, not a string, so the pair is as checked as the event name it
 * rides on. The two additions are the ones a token can't express: `q` for the
 * free-text chip, which is a `FilterState` field rather than a subject, and
 * `other` for a token that failed to parse.
 */
interface Subject {
  subject_key: SubjectKey | 'q' | 'other'
  subject_value: string
}

/**
 * Which of the omnibox's doors was used. `sidebar`/`drawer` are spelled as
 * `FilterPanel`'s own `variant`, so its two mounts pass theirs straight through
 * rather than translating one vocabulary into another at the call site.
 */
export type SearchSource = 'page' | 'sidebar' | 'drawer' | 'shortcut'

/** Which surface offered the facet that was added. */
export type FilterSource = 'omnibox' | 'panel'

/**
 * What kind of row a search ended on. No `query` member: the palette's
 * 搜尋標題／主人翁 row is the only thing that fires `search`, so that count is
 * already exactly this one and a second name for it would be two reports to
 * keep in agreement.
 */
export type SearchResultType = 'facet' | 'episode' | 'example'

/**
 * Every event the app sends, and its parameters.
 *
 * A map rather than loose strings so a call site can't invent a name or a
 * parameter: GA4 has no schema, it silently accepts whatever arrives, and a
 * typo'd event name is a report that quietly stays empty. Names are snake_case
 * and `search` is spelled exactly as GA4's recommended event so its `search_term`
 * lands in the built-in report rather than a custom dimension.
 */
interface AnalyticsEvents {
  /** The omnibox opened, and from which of its four doors. */
  search_open: { source: SearchSource }
  /** A term was handed to the list's title/主人翁 filter. GA4's recommended event. */
  search: { search_term: string }
  /** What a search actually ended in — the palette's own hit rate. */
  search_select: { search_term: string, result_type: SearchResultType } & Partial<Subject>
  /** A facet joined the selection, from whichever surface offered it. */
  filter_add: Subject & { source: FilterSource }
  /** One chip dropped — `subject_key: 'q'` for the free-text one, which is a chip too. */
  filter_remove: Subject
  /** 清除: the whole selection dropped at once, and how much of it there was. */
  filter_clear: { count: number }
  filter_sort: { sort: SortKey }
  /** 包括配角出場 — the one filter that widens rather than narrows. */
  filter_mentions: { enabled: boolean }
  filter_year: { from: number | null, to: number | null }
  /** Paging past the first 48 results. */
  filter_page: { page: number }
  /** The panel's 得分／集數 toggle over the browse block. */
  facet_order: { order: FacetOrder }
  /** A 精選 card on the home page. */
  featured_select: Subject
  /** A vote the server accepted; `0` is a withdrawal. */
  vote: Subject & { vote_value: VoteValue }
  vote_failed: { reason: 'rate_limited' | 'error' }
  /** A `?list=` playlist resolved on an episode page, and where in it the reader is. */
  playlist_view: Subject & { index: number, total: number }
  /**
   * A detail page opened, as its subject — the entity *kind* is the dimension a
   * URL path can't give, and reusing the subject pair means one report ranks
   * 角色 pages against 故事線 pages without parsing `/tag/迎新年` by regex.
   */
  content_view: Subject
}

type EventName = keyof AnalyticsEvents

declare global {
  interface Window {
    /**
     * Installed by @nuxt/scripts' Google Analytics `clientInit` as a
     * `dataLayer.push` stub, then replaced by gtag.js itself. Optional because
     * neither happens outside a production build.
     */
    gtag?: (command: 'event', name: string, params?: Record<string, unknown>) => void
  }
}

/**
 * Send one event, or nothing.
 *
 * Empty parameters are dropped rather than sent. GA4 already reports a missing
 * parameter as "(not set)", which is exactly what an unset year bound means —
 * whereas sending it spends one of the event's 25 parameter slots to say the
 * same thing under a literal `null`, as its own value in the dimension.
 *
 * The `try` is not defensiveness for its own sake. `window.gtag` is ours only
 * until something replaces it — a consent tool, an extension, a blocked script
 * swapped for a shim — and `track` is called from inside `useVotes`' reconcile
 * block, where a throw would land in the catch that *rolls back a vote the
 * server already accepted* and tells the visitor it failed. One swallow here
 * covers every call site: nothing the app does may depend on a beacon.
 */
export function track<K extends EventName>(event: K, params: AnalyticsEvents[K]): void {
  if (import.meta.server || !window.gtag) return
  const sent: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(params as Record<string, unknown>)) {
    if (isPresent(value)) sent[key] = value
  }
  try {
    window.gtag('event', event, sent)
  } catch {
    // A beacon that throws is a beacon that didn't send. That is all it is.
  }
}

/**
 * A `key:value` token as the pair every subject-shaped event reports.
 *
 * One pair for filters, votes, playlists and 精選 alike, because they already
 * share one vocabulary (`shared/utils/subject.ts`) — so two custom dimensions in
 * GA cover the whole site rather than two per feature.
 *
 * A token that doesn't parse — a hand-edited link, a rename that outlived a
 * shared URL — is reported whole under `other` rather than dropped: that it
 * happened is the very thing worth seeing.
 */
export function subjectParams(token: string): Subject {
  const parsed = parseSubject(token)
  return { subject_key: parsed?.key ?? 'other', subject_value: parsed?.value ?? token }
}

/**
 * Report which entity a detail page is showing.
 *
 * Called from the `use*ViewAsync` builders rather than from the pages, because
 * every detail route reaches exactly one of them with this very pair already in
 * hand — so no page can forget it, and none has to spell a subject twice (a
 * character page already builds the same token for its `?list=`). It takes the
 * pair rather than a token for the same reason: the key is then checked, where
 * a hand-built string could quietly degrade to `other`.
 *
 * A watcher rather than `onMounted`, and that is load-bearing: Vue reuses one
 * component instance across a param-only route change, so stepping /episode/2853
 * → /episode/2854 through the transport bar never remounts anything and an
 * `onMounted` would count a whole reading run as a single page. `immediate`
 * covers the first render; `post` keeps even that send out of setup, which on a
 * prerendered page is hydration.
 *
 * Client-only, so the prerender pass — which walks all 4,300 of these — sends
 * nothing. The value comes from the route rather than from the resolved view, so
 * a URL with nothing behind it reports too: those are exactly the dead inbound
 * links `useMissingSubjectStatus` answers 404 to, and this is the only thing
 * that makes them visible.
 */
export function useContentView(key: SubjectKey, value: MaybeRefOrGetter<string | number>) {
  if (import.meta.server) return
  watch(() => toValue(value), v => track('content_view', {
    subject_key: key,
    subject_value: String(v)
  }), { immediate: true, flush: 'post' })
}
