import type { CommandPaletteGroup, CommandPaletteItem } from '@nuxt/ui'
import type { CoreDataset } from './useDataset'
import type { FacetItem, FacetSection } from './useFacetIndex'
import { SECTION_LABEL, useFacetTokens } from './useFacetIndex'
import { SCORELESS_SORT, bySort, matchesTitle, useFilterState } from './useEpisodeFilter'
import { FACET_TEXT_CLASS } from '~/types'

/**
 * Open/search state for the one omnibox on the page. It is opened from three
 * places — the page's own search field, the sidebar panel and the mobile drawer
 * — so the pair is shared state rather than props threaded through each of them.
 */
export function useOmnibox() {
  const open = useState('omnibox-open', () => false)
  const term = useState('omnibox-term', () => '')
  return {
    open,
    term,
    /** Open it on a blank term — every entry point is "I want to search now". */
    show: () => {
      term.value = ''
      open.value = true
    }
  }
}

/** Rows per group. Seven sections plus 劇集 means the whole answer stays scannable. */
const PER_GROUP = 5

/**
 * Shown before anything is typed, because an empty palette teaches nothing and
 * the whole point of this surface is that the vocabulary is wider than the eight
 * 精選 cards below it. These are search *terms*, not ids: a renamed entity makes
 * an example return nothing rather than break.
 */
const EXAMPLES: { term: string, kind: string }[] = [
  { term: '安凌線', kind: SECTION_LABEL.plotlines },
  { term: '金城安', kind: SECTION_LABEL.characters },
  { term: '聖誕節', kind: SECTION_LABEL.festival },
  { term: '2853', kind: '集數' }
]

const norm = (s: string) => s.trim().toLowerCase()

/** One test for "this is an episode number", so lookup and ordering can't disagree. */
const isEpisodeNo = (q: string) => /^\d+$/.test(q)

/**
 * How well a facet option answers `q`, lowest first; -1 for no match. The tiers
 * are what keeps 安凌線 above 平安夜 when you type 安: a whole-label hit outranks
 * one buried in an alias, and only then does the order the section arrived in
 * break the tie — best-liked first, falling back to most-frequent.
 *
 * The fields are the ones the old menu handed `filter-fields`, section included,
 * so typing 節日 still lists every festival.
 */
function rank(item: FacetItem, q: string): number {
  const label = item.label.toLowerCase()
  if (label === q) return 0
  if (label.startsWith(q)) return 1
  if (label.includes(q)) return 2
  const aliases = item.aliases ?? []
  if (aliases.some(a => a.toLowerCase() === q)) return 3
  if (aliases.some(a => a.toLowerCase().includes(q))) return 4
  if (item.meta?.toLowerCase().includes(q)) return 5
  if (item.section.toLowerCase().includes(q)) return 6
  return -1
}

/**
 * Everything the palette can answer with, as `UCommandPalette` groups.
 *
 * Groups are `ignoreFilter`, i.e. the component renders them verbatim: matching
 * happens here instead of in its Fuse index, so the ordering stays the
 * section-order-then-relevance one the rest of the app uses — whatever
 * `useFacetOrder` currently means, 得分 by default — and so the same option
 * carries the same token, hue and icon as it does in the panel.
 */
export function useOmniboxGroups(
  core: Ref<CoreDataset | null | undefined>,
  sections: Ref<FacetSection[]>
) {
  const { open, term } = useOmnibox()
  const state = useFilterState()
  const tokens = useFacetTokens(state)

  // Picking a facet adds to the selection, exactly as the panel's chips do —
  // the palette is another way into the same filter, not a separate search.
  function addFacet(token: string) {
    if (!tokens.value.includes(token)) tokens.value = [...tokens.value, token]
    open.value = false
  }

  function searchTitles(q: string) {
    state.value.q = q
    open.value = false
  }

  // Explicit navigation rather than an item `to`: the row is reachable by
  // keyboard, and closing has to happen either way.
  function go(path: string) {
    open.value = false
    return navigateTo(path)
  }

  // The hue is resolved here rather than in the slot, where the palette types
  // its items as `any` and a colour key can't be checked against FACET_COLOR.
  const facetItem = (item: FacetItem): CommandPaletteItem => ({
    label: item.label,
    slot: 'facet',
    icon: item.icon,
    meta: item.meta,
    count: item.count,
    tone: item.tone,
    textClass: item.color ? FACET_TEXT_CLASS[item.color] : undefined,
    onSelect: () => addFacet(item.token)
  })

  /** 集數 first when the term is one, then titles — this is the old 跳至集數 form. */
  const episodeItems = computed<CommandPaletteItem[]>(() => {
    const ds = core.value
    const q = norm(term.value)
    if (!ds || !q) return []
    const exact = isEpisodeNo(q) ? ds.episodesByNo.get(Number(q)) : undefined
    const matches = ds.episodes
      .filter(ep => ep.no !== exact?.no && matchesTitle(ep, q))
      .sort(bySort(SCORELESS_SORT))
      .slice(0, exact ? PER_GROUP - 1 : PER_GROUP)
    return [...(exact ? [exact] : []), ...matches].map(ep => ({
      label: ep.title,
      prefix: `第 ${ep.no} 集 · `,
      icon: 'i-lucide-tv',
      onSelect: () => go(`/episode/${ep.no}`)
    }))
  })

  return computed<CommandPaletteGroup[]>(() => {
    const q = norm(term.value)
    if (!q) {
      return [{
        id: 'examples',
        label: '試試搜尋',
        ignoreFilter: true,
        items: EXAMPLES.map(e => ({
          label: e.term,
          suffix: e.kind,
          icon: 'i-lucide-search',
          onSelect: () => {
            term.value = e.term
          }
        }))
      }]
    }

    const facets: CommandPaletteGroup[] = sections.value
      .map(s => ({
        id: s.label,
        label: s.label,
        ignoreFilter: true,
        items: s.items
          .map(item => ({ item, r: rank(item, q) }))
          .filter(x => x.r >= 0)
          // sort is stable, so options keep the section's own order within a tier
          .sort((a, b) => a.r - b.r)
          .slice(0, PER_GROUP)
          .map(x => facetItem(x.item))
      }))
      .filter(g => g.items.length)

    // The way out of the facet vocabulary entirely: hand the term to the
    // title/protagonist search the list already runs.
    const episodes: CommandPaletteGroup = {
      id: 'episodes',
      label: '劇集',
      ignoreFilter: true,
      items: [...episodeItems.value, {
        // Named for what the filter does, which is wider than the rows above it:
        // those preview the title half so every one visibly contains the term.
        label: `搜尋標題／主人翁含「${term.value.trim()}」的劇集`,
        icon: 'i-lucide-search',
        onSelect: () => searchTitles(term.value.trim())
      }]
    }

    // A number is an answer, not a facet — put it where the eye lands first.
    return isEpisodeNo(q) ? [episodes, ...facets] : [...facets, episodes]
  })
}
