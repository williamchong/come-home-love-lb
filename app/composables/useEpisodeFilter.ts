import type { CoreDataset } from './useDataset'
import type { Episode } from '~/types'

export type SortKey = 'no-asc' | 'no-desc'

/**
 * Newest first — an unfiltered visit is a browse, and the episodes worth landing
 * on are the ones that just aired, not 2017's. Everything that has to agree with
 * the default reads it from here: the URL mirror omits it, `buildHomeSeed` orders
 * the prerendered seed by it, and the index heads that seed with its heading.
 */
export const DEFAULT_SORT: SortKey = 'no-desc'

/** The sort options offered in the UI, kept beside `SortKey` so they can't drift apart. */
export const SORT_ITEMS: { label: string, value: SortKey }[] = [
  { label: '集數 ↓', value: 'no-desc' },
  { label: '集數 ↑', value: 'no-asc' }
]

/** What an unfiltered list of episodes in each order is called on the page. */
export const SORT_HEADING: Record<SortKey, string> = {
  'no-desc': '最新集數',
  'no-asc': '全部劇集'
}

/**
 * The list's ordering. Shared with the prerendered seed (`buildHomeSeed`), which
 * has to produce exactly what the filter shows in its default order or the
 * handover visibly reshuffles.
 */
export const bySort = (sort: SortKey) => (a: Episode, b: Episode) =>
  (a.no - b.no) * (sort === 'no-desc' ? -1 : 1)

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
    return out.sort(bySort(s.sort))
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
