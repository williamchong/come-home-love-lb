import type { CoreDataset } from './useDataset'
import type { Episode } from '~/types'
import type { ScoreMap } from '#shared/types/votes'

export type SortKey = 'no-asc' | 'no-desc' | 'score-desc'

/**
 * 得分 first — the whole point of collecting votes is that they decide what an
 * unfiltered visit lands on. Everything that has to agree with the default reads
 * it from here: the URL mirror omits it, and `useEpisodeFilter` hydrates to it.
 *
 * Note what it deliberately does *not* reach: anything built without a score
 * map. See `SCORELESS_SORT`.
 */
export const DEFAULT_SORT: SortKey = 'score-desc'

/**
 * The order used wherever there is no score map to sort by — and the one 得分
 * degrades to when there never will be.
 *
 * Two kinds of caller need it. The prerendered lists — the home seed, a facet
 * page's episodes, the omnibox's title matches — are built at deploy time and
 * cannot see a live score, so they ask for newest-first outright rather than for
 * an ordering they can't compute. And a visitor whose `/api/scores` never
 * answered gets it through `useSortKey`, which is what keeps the promise that a
 * failed vote API leaves the site behaving exactly as it did before voting
 * existed.
 *
 * Its value is not a coincidence: `bySort('score-desc')` with no scores already
 * falls through to precisely this comparator, so the seed still matches the
 * default order at handover and only reshuffles once real scores arrive.
 */
export const SCORELESS_SORT: SortKey = 'no-desc'

/**
 * The sort options offered in the UI, kept beside `SortKey` so they can't drift
 * apart. `SortSelect` hides 得分 while there are no scores to order by.
 */
export const SORT_ITEMS: { label: string, value: SortKey }[] = [
  { label: '集數 ↓', value: 'no-desc' },
  { label: '集數 ↑', value: 'no-asc' },
  { label: '得分 ↓', value: 'score-desc' }
]

/** What an unfiltered list of episodes in each order is called on the page. */
export const SORT_HEADING: Record<SortKey, string> = {
  'no-desc': '最新集數',
  'no-asc': '全部劇集',
  'score-desc': '最高分'
}

/**
 * The list's ordering. Shared with the prerendered seed (`buildHomeSeed`), which
 * has to produce what the filter shows before any score has landed or the
 * handover visibly reshuffles — so the seed calls this with `SCORELESS_SORT` and
 * no `scores`, and must keep doing so: it is built at deploy time and cannot see
 * a live score.
 *
 * `scores` is optional for the same reason it is optional everywhere else. With
 * none every episode nets zero and the comparator falls through to newest first,
 * which is what the loading window shows before the first snapshot lands. A
 * visit where scores never arrive doesn't reach this at all — `useSortKey`
 * degrades the key itself, one layer up.
 */
export const bySort = (sort: SortKey, scores?: ScoreMap) => {
  if (sort !== 'score-desc') {
    return (a: Episode, b: Episode) => (a.no - b.no) * (sort === 'no-desc' ? -1 : 1)
  }
  // Unvoted sorts as zero here, unlike the control's「–」: an episode nobody has
  // voted on has to sit somewhere, and that somewhere is level with the ties.
  //
  // Memoised per episode, which is not a micro-optimisation: a comparator runs
  // ~33k times over 2,868 episodes, so the naive form builds ~66k
  // `episodes:1234` strings *and* takes ~66k tracked reads through the reactive
  // score map — which cost more than the sort itself (6.6 ms, against 0.8 ms
  // memoised) on a computed that now re-runs on every filter interaction, not
  // just on a vote. Safe because `bySort` is called once per sort pass and
  // `scores` cannot change during one.
  const cache = new Map<number, number>()
  const net = (no: number) => {
    let v = cache.get(no)
    if (v === undefined) {
      v = netScore(scores?.[subjectToken('episodes', no)]) ?? 0
      cache.set(no, v)
    }
    return v
  }
  // The tie-break is load-bearing, not tidiness: nearly every episode sits at
  // zero, and without a second key their order is whatever the source array
  // happened to be — which changes under them on any recompute.
  return (a: Episode, b: Episode) => (net(b.no) - net(a.no)) || (b.no - a.no)
}

/** Episodes per page of the result grid. */
export const PAGE_SIZE = 48

/**
 * The free-text predicate, over an already trimmed + lowercased `q`.
 *
 * Split in two because the omnibox previews the title half on its own — every
 * row it lists has to visibly contain what was typed — while the filter it hands
 * the term to also matches 故事主人翁. Defined once so the preview can't drift
 * from the search it is previewing.
 */
export const matchesTitle = (ep: Episode, q: string) => ep.title.toLowerCase().includes(q)
export const matchesQuery = (ep: Episode, q: string) =>
  matchesTitle(ep, q) || ep.protagonists.some(p => p.toLowerCase().includes(q))

/**
 * Every selected id must be present: a second chip of the same type narrows
 * rather than widens, which is what ticking one more box reads as. `alsoHave`
 * carries 提及's widening — it joins the haystack rather than forming a second
 * whole-set pass, so 角色 reads like the other four facets.
 */
const allIn = (sel: string[], have: string[], alsoHave?: string[]) =>
  sel.every(id => have.includes(id) || !!alsoHave?.includes(id))

/**
 * The `FilterState` fields holding facet selections — enumerated once here
 * rather than spelled out at each site that has to walk them all. How a
 * selection combines is the predicate's business, in `useEpisodeFilter`.
 */
export const FACET_KEYS = ['characters', 'plotlines', 'tags', 'groups', 'writers'] as const
export type FacetKey = typeof FACET_KEYS[number]

/** A blank selection per facet key — the shared shape of empty and reset state. */
export const emptyFacets = () =>
  Object.fromEntries(FACET_KEYS.map(k => [k, [] as string[]])) as Record<FacetKey, string[]>

export interface FilterState {
  q: string
  characters: string[]
  plotlines: string[]
  groups: string[]
  tags: string[]
  writers: string[]
  yearFrom: number | null
  yearTo: number | null
  sort: SortKey
  /** Widen the 角色 filter from 故事主人翁 to any episode whose synopsis names them. */
  includeMentions: boolean
  /** 1-based page of the result grid, mirrored to the URL so a link keeps its place. */
  page: number
}

function emptyState(): FilterState {
  return { q: '', ...emptyFacets(), yearFrom: null, yearTo: null, sort: DEFAULT_SORT, includeMentions: false, page: 1 }
}

/**
 * The query string the visitor arrived with, captured at module-evaluation
 * time. While hydrating a prerendered page Nuxt parks the router — and, via
 * history.replaceState, the address bar itself — on the payload's path (no
 * query) until suspense resolves, so both route.query and window.location are
 * blind to a shared filter link during setup. This module is evaluated while
 * the initial navigation is still resolving, before that dance begins.
 */
const initialSearch = import.meta.client ? window.location.search : ''

const csv = (v: string[]) => (v.length ? v.join(',') : undefined)
const fromCsv = (v: unknown) => (typeof v === 'string' && v.length ? v.split(',') : [])
const num = (v: unknown) => (typeof v === 'string' && v.length ? Number(v) : null)

/**
 * The URL query for a filter state, *excluding* the page. `p` is appended by the
 * mirror below; keeping it out here gives the page-reset watcher a signature of
 * the filters alone, so paging never looks like a filter change (which would
 * reset the very page that was just picked).
 */
function toQuery(s: FilterState) {
  return {
    q: s.q || undefined,
    chars: csv(s.characters),
    plots: csv(s.plotlines),
    groups: csv(s.groups),
    tags: csv(s.tags),
    writers: csv(s.writers),
    from: s.yearFrom ?? undefined,
    to: s.yearTo ?? undefined,
    sort: s.sort === DEFAULT_SORT ? undefined : s.sort,
    mentions: s.includeMentions ? '1' : undefined
  }
}

/** Shared, app-wide filter state (so the panel and the list edit the same object). */
export function useFilterState() {
  return useState<FilterState>('episode-filter', emptyState)
}

/**
 * The order the list is *actually* in, as a writable projection of `state.sort`.
 *
 * 得分 is the default now, which means it is also the order a visitor lands in
 * on a visit where scores are not in play at all (`scoresInPlay`). Reading it
 * back as `SCORELESS_SORT` there is what keeps the documented degradation
 * intact: `SortSelect` drops the 得分 option and still has a label for what it
 * is showing, the index heads the list 最新集數 rather than 最高分, and the rows
 * are in the order both of them claim.
 *
 * Writes always go to the real state, so a visitor who picked 得分 on a working
 * visit keeps that choice in the URL even if a later load can't honour it.
 */
export function useSortKey() {
  const state = useFilterState()
  const { scoresInPlay } = useVotes()
  return computed<SortKey>({
    get: () => (state.value.sort === 'score-desc' && !scoresInPlay.value ? SCORELESS_SORT : state.value.sort),
    set: (v) => {
      state.value.sort = v
    }
  })
}

/**
 * The orders worth offering, which is `SORT_ITEMS` minus 得分 when scores are
 * not in play.
 *
 * It lives here rather than in `SortSelect` because it is the other half of
 * `useSortKey`, not a display detail: that getter rewrites 得分 to
 * `SCORELESS_SORT` in exactly the state this drops the option, and the two only
 * stay consistent together. Split across files, a menu could offer a value the
 * getter refuses to read back — which a `USelectMenu` renders as no label at all.
 */
export function useSortItems() {
  const { scoresInPlay } = useVotes()
  return computed(() => SORT_ITEMS.filter(item => item.value !== 'score-desc' || scoresInPlay.value))
}

/**
 * The one definition of a cleared filter set, behind both the panel's 重設 and
 * the links that stand for a single facet (they replace the selection rather
 * than adding to it). Display preferences survive: sort order and 提及 widening
 * are how the visitor reads the list, not part of what they picked — neither
 * counts towards `activeFilterCount` either.
 */
export function clearedFilters(s: FilterState): FilterState {
  return { ...emptyState(), sort: s.sort, includeMentions: s.includeMentions }
}

export function activeFilterCount(s: FilterState) {
  return (s.q ? 1 : 0) + FACET_KEYS.reduce((n, k) => n + s[k].length, 0)
    + (s.yearFrom ? 1 : 0) + (s.yearTo ? 1 : 0)
}

/**
 * Reactive episode filter. Facets combine with AND both across and within a
 * type: every chip narrows. State is mirrored to the URL query so filtered
 * views are shareable.
 */
export function useEpisodeFilter(ds: Ref<CoreDataset | null | undefined>) {
  const router = useRouter()
  const state = useFilterState()
  const sortKey = useSortKey()
  const { scores } = useVotes()

  // hydrate from the arrival URL once (guarded so re-mounts don't clobber
  // edits) — client only, because the prerender pass has no query string and
  // its useState values are baked into the payload: letting it set the flag
  // would ship hydrated=true to every visitor and the real query would never
  // be read
  const hydrated = useState('episode-filter-hydrated', () => false)
  if (import.meta.client && !hydrated.value) {
    const q: Record<string, string> = Object.fromEntries(new URLSearchParams(initialSearch))
    const page = num(q.p)
    Object.assign(state.value, {
      q: typeof q.q === 'string' ? q.q : '',
      characters: fromCsv(q.chars),
      plotlines: fromCsv(q.plots),
      groups: fromCsv(q.groups),
      tags: fromCsv(q.tags),
      writers: fromCsv(q.writers),
      yearFrom: num(q.from),
      yearTo: num(q.to),
      sort: typeof q.sort === 'string' ? (q.sort as SortKey) : DEFAULT_SORT,
      includeMentions: q.mentions === '1',
      page: page && page > 1 ? Math.trunc(page) : 1
    })
    hydrated.value = true
  }

  // A filter change invalidates whatever page was showing. Keyed on the mirrored
  // query rather than on `filtered`, which also changes when the dataset finishes
  // loading — resetting there would discard the page an arriving ?p=3 just set.
  // Registered before the mirror so the reset lands in the same URL update.
  watch(() => JSON.stringify(toQuery(state.value)), () => {
    state.value.page = 1
  })

  // mirror to URL (replace, so we don't spam history)
  watch(state, () => {
    const s = state.value
    router.replace({ query: { ...toQuery(s), p: s.page > 1 ? String(s.page) : undefined } })
  }, { deep: true })

  const activeCount = computed(() => activeFilterCount(state.value))

  const filtered = computed<Episode[]>(() => {
    const data = ds.value
    if (!data) return []
    const s = state.value
    const q = s.q.trim().toLowerCase()
    // `state` is a deep reactive proxy, so each `s.x` below would be a get trap
    // run once per episode. Unwrapping the selections into plain arrays up here
    // — a spread of at most a few ids — takes a pass over 2,868 episodes from
    // ~1.5 ms to ~0.03 ms, which is a keystroke's worth of the omnibox.
    const { includeMentions: mentions, yearFrom, yearTo } = s
    const chars = [...s.characters]
    const plots = [...s.plotlines]
    const groups = [...s.groups]
    const tags = [...s.tags]
    const writers = [...s.writers]
    // Cheapest and most selective first, so the costly ones rarely run: `q`
    // lowercases a string per episode, while a 節日 or 家庭・機構 selection
    // eliminates almost everything (93% of episodes carry no tag at all).
    const out = data.episodes.filter((ep) => {
      if (yearFrom && (ep.year ?? 0) < yearFrom) return false
      if (yearTo && (ep.year ?? 9999) > yearTo) return false
      if (tags.length && !allIn(tags, ep.tagIds)) return false
      if (groups.length && !allIn(groups, ep.groupIds)) return false
      if (writers.length && !allIn(writers, ep.writers)) return false
      if (plots.length && !allIn(plots, ep.plotlineIds)) return false
      if (chars.length && !allIn(chars, ep.characterIds,
        mentions ? ep.mentionedCharacterIds : undefined)) return false
      if (q && !matchesQuery(ep, q)) return false
      return true
    })
    // `sortKey`, not `s.sort`: with 得分 the default, a visitor who can't reach
    // the vote API has to be ordered by what the heading and the control say.
    //
    // `scores.value` is read only in the branch that needs it, so this computed
    // does not depend on the score map in the other orders — otherwise every
    // vote cast anywhere would re-filter and re-sort all 2,868 episodes. In the
    // 得分 branch it necessarily does, which is the cost of the default: a vote
    // moves the episode it was cast on, live, under the visitor who cast it.
    const sort = sortKey.value
    return sort === 'score-desc'
      ? out.sort(bySort(sort, scores.value))
      : out.sort(bySort(sort))
  })

  const pageCount = computed(() => Math.ceil(filtered.value.length / PAGE_SIZE))
  const paged = computed(() =>
    filtered.value.slice((state.value.page - 1) * PAGE_SIZE, state.value.page * PAGE_SIZE))

  // A ?p= can outrun its result set — a link shared from a wider selection, or
  // made against an older dataset. Guarded on `n` because a filter that matches
  // nothing drops the count to 0, and clamping to that would ask for page 0.
  watch(pageCount, (n) => {
    if (n && state.value.page > n) state.value.page = n
  })

  function reset() {
    Object.assign(state.value, clearedFilters(state.value))
  }

  return { state, filtered, paged, pageCount, activeCount, reset }
}
