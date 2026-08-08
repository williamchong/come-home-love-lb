import type { CoreDataset } from './useDataset'
import type { Episode } from '~/types'

export type SortKey = 'no-asc' | 'no-desc'

/** The sort options offered in the UI, kept beside `SortKey` so they can't drift apart. */
export const SORT_ITEMS: { label: string, value: SortKey }[] = [
  { label: '集數 ↑', value: 'no-asc' },
  { label: '集數 ↓', value: 'no-desc' }
]

/**
 * The `FilterState` fields holding facet selections. Every one is an OR-set of
 * ids filtered the same way, so they are enumerated once here rather than spelled
 * out at each site that has to walk them all.
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
}

function emptyState(): FilterState {
  return { q: '', ...emptyFacets(), yearFrom: null, yearTo: null, sort: 'no-asc', includeMentions: false }
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

/** Shared, app-wide filter state (so the panel and the list edit the same object). */
export function useFilterState() {
  return useState<FilterState>('episode-filter', emptyState)
}

export function activeFilterCount(s: FilterState) {
  return (s.q ? 1 : 0) + FACET_KEYS.reduce((n, k) => n + s[k].length, 0)
    + (s.yearFrom ? 1 : 0) + (s.yearTo ? 1 : 0)
}

/**
 * Reactive episode filter. Facets combine with AND across types and OR within a
 * type. State is mirrored to the URL query so filtered views are shareable.
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
    Object.assign(state.value, {
      q: typeof q.q === 'string' ? q.q : '',
      characters: fromCsv(q.chars),
      plotlines: fromCsv(q.plots),
      groups: fromCsv(q.groups),
      tags: fromCsv(q.tags),
      writers: fromCsv(q.writers),
      yearFrom: num(q.from),
      yearTo: num(q.to),
      sort: typeof q.sort === 'string' ? (q.sort as SortKey) : 'no-asc',
      includeMentions: q.mentions === '1'
    })
    hydrated.value = true
  }

  // mirror to URL (replace, so we don't spam history)
  watch(state, () => {
    const s = state.value
    router.replace({
      query: {
        q: s.q || undefined,
        chars: csv(s.characters),
        plots: csv(s.plotlines),
        groups: csv(s.groups),
        tags: csv(s.tags),
        writers: csv(s.writers),
        from: s.yearFrom ?? undefined,
        to: s.yearTo ?? undefined,
        sort: s.sort === 'no-asc' ? undefined : s.sort,
        mentions: s.includeMentions ? '1' : undefined
      }
    })
  }, { deep: true })

  const activeCount = computed(() => activeFilterCount(state.value))

  const someIn = (sel: string[], have: string[]) => sel.some(s => have.includes(s))

  const filtered = computed<Episode[]>(() => {
    const data = ds.value
    if (!data) return []
    const s = state.value
    const q = s.q.trim().toLowerCase()
    const out = data.episodes.filter((ep) => {
      if (q && !ep.title.toLowerCase().includes(q) && !ep.protagonists.some(p => p.toLowerCase().includes(q))) return false
      if (s.characters.length && !someIn(s.characters, ep.characterIds)
        && !(s.includeMentions && someIn(s.characters, ep.mentionedCharacterIds))) return false
      if (s.plotlines.length && !someIn(s.plotlines, ep.plotlineIds)) return false
      if (s.groups.length && !someIn(s.groups, ep.groupIds)) return false
      if (s.tags.length && !someIn(s.tags, ep.tagIds)) return false
      if (s.writers.length && !someIn(s.writers, ep.writers)) return false
      if (s.yearFrom && (ep.year ?? 0) < s.yearFrom) return false
      if (s.yearTo && (ep.year ?? 9999) > s.yearTo) return false
      return true
    })
    const dir = s.sort === 'no-desc' ? -1 : 1
    return out.sort((a, b) => (a.no - b.no) * dir)
  })

  function reset() {
    Object.assign(state.value, emptyState())
  }

  return { state, filtered, activeCount, reset }
}
