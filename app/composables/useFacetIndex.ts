import type { Dataset, FacetOption } from './useDataset'
import type { EntityTone } from '~/utils/entityTone'
import { tagTones, tokenTone } from '~/utils/entityTone'
import type { FacetColor } from '~/types'
import { FACET_COLOR, TAG_KIND_LABEL } from '~/types'
import { FACET_KEYS, emptyFacets, type FacetKey, type FilterState } from './useEpisodeFilter'

const isFacetKey = (v: string): v is FacetKey => (FACET_KEYS as readonly string[]).includes(v)

/**
 * `key:value` — the single string every selection, wherever made, is modelled as.
 *
 * Delegates to `subjectToken` (`shared/utils/subject.ts`) rather than spelling
 * the template again, so a chip and a vote can never name one entity two ways.
 * The call is also the check that keeps them compatible: it only compiles while
 * every `FacetKey` is a `SubjectKey`.
 */
export const facetToken = (key: FacetKey, value: string) => subjectToken(key, value)

/**
 * The filter half of `parseSubject` — same split, narrower vocabulary. Built on
 * it rather than repeating the parse, so `episodes:1234` resolves as a subject
 * and is rejected here, which is exactly the distinction worth keeping.
 */
export function parseToken(token: string): { key: FacetKey, value: string } | null {
  const parsed = parseSubject(token)
  return parsed && isFacetKey(parsed.key) ? { key: parsed.key, value: parsed.value } : null
}

export interface FacetItem extends FacetOption {
  token: string
  /** Section heading, also indexed for search so typing「節日」lists them all. */
  section: string
  icon: string
  /** Set only on sections that colour the whole concept — otherwise `tone` is. */
  color?: FacetColor
  tone?: EntityTone
}

/** One facet type's options, as the panel and the omnibox both group them. */
export interface FacetSection {
  label: string
  icon: string
  items: FacetItem[]
}

interface Section {
  key: FacetKey
  label: string
  icon: string
  options: (ds: Dataset) => FacetOption[]
  /** Exactly one of these: a hue per entity, or one colour for the concept. */
  tone?: (ds: Dataset, value: string) => EntityTone | undefined
  color?: FacetColor
}

const tagTone = (ds: Dataset, id: string) => tagTones(ds.tags).get(id)
// 角色 facet values are roster ids, 家庭・機構 values raw 故事主人翁 tokens —
// both are what tokenTone resolves, so members and their family share a hue
const charTone = (ds: Dataset, id: string) => tokenTone(id, ds.charactersById)
const groupTone = (ds: Dataset, label: string) => tokenTone(label, ds.charactersById, true)
// resolved with the roster in `useDataset`, so a line shares its cast's hue
const plotTone = (ds: Dataset, id: string) => ds.plotlinesById.get(id)?.tone

/**
 * What each section is called. Exported because the label is load-bearing beyond
 * display: three sections share `key: 'tags'`, so it is the only thing telling
 * them apart, and the omnibox captions its example rows with it.
 */
export const SECTION_LABEL = {
  characters: '角色',
  plotlines: '故事線 / CP',
  festival: TAG_KIND_LABEL.festival,
  cameo: TAG_KIND_LABEL.cameo,
  milestone: TAG_KIND_LABEL.milestone,
  groups: '家庭 / 機構',
  writers: '編劇'
} as const

/** Display order, in the panel's browse block and in the palette's groups alike. */
const SECTIONS: Section[] = [
  { key: 'characters', label: SECTION_LABEL.characters, icon: 'i-lucide-user', options: ds => ds.facets.characters, tone: charTone },
  { key: 'plotlines', label: SECTION_LABEL.plotlines, icon: 'i-lucide-heart', options: ds => ds.facets.plotlines, tone: plotTone },
  { key: 'tags', label: SECTION_LABEL.festival, icon: 'i-lucide-party-popper', options: ds => ds.facets.tagsByKind.festival, tone: tagTone },
  { key: 'tags', label: SECTION_LABEL.cameo, icon: 'i-lucide-star', options: ds => ds.facets.tagsByKind.cameo, tone: tagTone },
  { key: 'tags', label: SECTION_LABEL.milestone, icon: 'i-lucide-flag', options: ds => ds.facets.tagsByKind.milestone, tone: tagTone },
  { key: 'groups', label: SECTION_LABEL.groups, icon: 'i-lucide-users', options: ds => ds.facets.groups, tone: groupTone },
  { key: 'writers', label: SECTION_LABEL.writers, icon: 'i-lucide-pen-line', options: ds => ds.facets.writers, color: FACET_COLOR.writer }
]

/**
 * What the head of each section means: how often a facet appears, or how well
 * it is liked. Shared state so the panel's toggle also reorders the omnibox,
 * which ranks over this same index.
 */
export type FacetOrder = 'count' | 'score'

export const useFacetOrder = () => useState<FacetOrder>('facet-order', () => 'count')

/**
 * Every facet option from every type, grouped by section and sorted within one.
 * Nothing here is capped or filtered: the panel's browse block takes the head of
 * each section, the omnibox searches the whole of it.
 *
 * Count is the default and stays so. It is a real answer to "who is this show
 * about", it is available before any network call, and on day one every score is
 * zero — an empty ordering is worse than a meaningful one. 得分 is the other
 * question: 熊大偉 appearing in 700 episodes is not the same as being loved.
 *
 * `ds` may be null while the full tier is still loading — the omnibox is
 * reachable before it lands, and answers episode numbers and titles meanwhile.
 */
export function useFacetIndex(ds: MaybeRefOrGetter<Dataset | null | undefined>) {
  const order = useFacetOrder()
  const { net } = useVotes()

  const sections = computed<FacetSection[]>(() => {
    const data = toValue(ds)
    if (!data) return []
    // Read inside the branch that uses it, so a count-ordered panel does not
    // re-sort every section each time a vote lands anywhere on the site.
    const byScore = order.value === 'score'
      ? (a: FacetItem, b: FacetItem) => (net(b.token) ?? 0) - (net(a.token) ?? 0) || b.count - a.count
      : undefined

    return SECTIONS
      .map((s) => {
        const items = s.options(data).map((o): FacetItem => ({
          ...o,
          token: facetToken(s.key, o.value),
          section: s.label,
          icon: s.icon,
          tone: s.tone?.(data, o.value),
          color: s.color
        }))
        // Options arrive count-sorted from `useDataset`; only re-sort when the
        // question changed.
        return { label: s.label, icon: s.icon, items: byScore ? items.sort(byScore) : items }
      })
      .filter(s => s.items.length)
  })

  // Indexed over the *whole* set: a chip has to resolve its label even when its
  // option sits outside the browse block's head-of-section slice.
  const byToken = computed(() => {
    const map = new Map<string, FacetItem>()
    for (const s of sections.value) for (const item of s.items) map.set(item.token, item)
    return map
  })

  return { sections, byToken }
}

/**
 * The active facet selections as a flat token list — one writable projection of
 * the five separate `FilterState` arrays, so every surface that adds or drops a
 * filter (the panel's chips and browse block, the omnibox, the `?list=` playlist
 * check on the index) speaks the same vocabulary.
 */
export function useFacetTokens(state: Ref<FilterState>) {
  return computed<string[]>({
    get: () => FACET_KEYS.flatMap(key => state.value[key].map(v => facetToken(key, v))),
    set: (tokens) => {
      const next = emptyFacets()
      for (const t of tokens) {
        const parsed = parseToken(t)
        if (parsed) next[parsed.key].push(parsed.value)
      }
      Object.assign(state.value, next)
    }
  })
}
