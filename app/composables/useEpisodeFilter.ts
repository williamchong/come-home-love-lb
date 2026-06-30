import type { CoreDataset } from './useDataset'
import type { Episode } from '~/types'

export type SortKey = 'no-asc' | 'no-desc'

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
}

function emptyState(): FilterState {
  return { q: '', characters: [], plotlines: [], groups: [], tags: [], writers: [], yearFrom: null, yearTo: null, sort: 'no-asc' }
}

const csv = (v: string[]) => (v.length ? v.join(',') : undefined)
const fromCsv = (v: unknown) => (typeof v === 'string' && v.length ? v.split(',') : [])
const num = (v: unknown) => (typeof v === 'string' && v.length ? Number(v) : null)

/** Shared, app-wide filter state (so the panel and the list edit the same object). */
export function useFilterState() {
  return useState<FilterState>('episode-filter', emptyState)
}

export function activeFilterCount(s: FilterState) {
  return (s.q ? 1 : 0) + s.characters.length + s.plotlines.length + s.groups.length
    + s.tags.length + s.writers.length + (s.yearFrom ? 1 : 0) + (s.yearTo ? 1 : 0)
}

/**
 * Reactive episode filter. Facets combine with AND across types and OR within a
 * type. State is mirrored to the URL query so filtered views are shareable.
 */
export function useEpisodeFilter(ds: Ref<CoreDataset | null | undefined>) {
  const route = useRoute()
  const router = useRouter()
  const state = useFilterState()

  // hydrate from URL once (guarded so re-mounts don't clobber edits)
  const hydrated = useState('episode-filter-hydrated', () => false)
  if (!hydrated.value) {
    const q = route.query
    Object.assign(state.value, {
      q: typeof q.q === 'string' ? q.q : '',
      characters: fromCsv(q.chars),
      plotlines: fromCsv(q.plots),
      groups: fromCsv(q.groups),
      tags: fromCsv(q.tags),
      writers: fromCsv(q.writers),
      yearFrom: num(q.from),
      yearTo: num(q.to),
      sort: typeof q.sort === 'string' ? (q.sort as SortKey) : 'no-asc'
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
        sort: s.sort === 'no-asc' ? undefined : s.sort
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
      if (s.characters.length && !someIn(s.characters, ep.characterIds)) return false
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
