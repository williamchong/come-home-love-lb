import type { Dataset, FacetOption } from './useDataset'
import type { EntityTone } from '~/utils/entityTone'
import { tagTones, tokenTone } from '~/utils/entityTone'
import type { FacetColor } from '~/types'
import { FACET_COLOR, TAG_KIND_LABEL } from '~/types'
import { FACET_KEYS, emptyFacets, type FacetKey, type FilterState } from './useEpisodeFilter'

const isFacetKey = (v: string): v is FacetKey => (FACET_KEYS as readonly string[]).includes(v)

/** `key:value` — the single string the merged combobox models every selection as. */
export const facetToken = (key: FacetKey, value: string) => `${key}:${value}`

/** Split on the *first* colon only: group and writer values are raw labels. */
export function parseToken(token: string): { key: FacetKey, value: string } | null {
  const i = token.indexOf(':')
  if (i < 0) return null
  const key = token.slice(0, i)
  return isFacetKey(key) ? { key, value: token.slice(i + 1) } : null
}

export interface FacetItem extends FacetOption {
  type?: never
  token: string
  /** Section heading, also indexed for search so typing「節日」lists them all. */
  section: string
  icon: string
  /** Set only on sections that colour the whole concept — otherwise `tone` is. */
  color?: FacetColor
  tone?: EntityTone
}

/** A section heading row. USelectMenu renders `type: 'label'` items as headings. */
export interface FacetLabel {
  type: 'label'
  label: string
  token?: never
  meta?: never
  count?: never
  icon?: never
  section?: never
  aliases?: never
  color?: never
  tone?: never
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

/** Menu order. Sections are display-only groupings: several map to the same `key`. */
const SECTIONS: Section[] = [
  { key: 'characters', label: '角色', icon: 'i-lucide-user', options: ds => ds.facets.characters, tone: charTone },
  { key: 'plotlines', label: '故事線 / CP', icon: 'i-lucide-heart', options: ds => ds.facets.plotlines, tone: plotTone },
  { key: 'tags', label: TAG_KIND_LABEL.festival, icon: 'i-lucide-party-popper', options: ds => ds.facets.tagsByKind.festival, tone: tagTone },
  { key: 'tags', label: TAG_KIND_LABEL.cameo, icon: 'i-lucide-star', options: ds => ds.facets.tagsByKind.cameo, tone: tagTone },
  { key: 'tags', label: TAG_KIND_LABEL.milestone, icon: 'i-lucide-flag', options: ds => ds.facets.tagsByKind.milestone, tone: tagTone },
  { key: 'groups', label: '家庭 / 機構', icon: 'i-lucide-users', options: ds => ds.facets.groups, tone: groupTone },
  { key: 'writers', label: '編劇', icon: 'i-lucide-pen-line', options: ds => ds.facets.writers, color: FACET_COLOR.writer }
]

/** Fields USelectMenu matches the search box against. */
export const FACET_FILTER_FIELDS = ['label', 'meta', 'aliases', 'section']

/**
 * Options listed per section before anything is typed. Building all ~440 rows
 * costs about a second of layout on a throttled phone to fill a listbox only
 * ~8 rows tall. Options are sorted by episode count, so the head of each list is
 * also the part worth browsing; typing lifts the cap.
 */
const PREVIEW_PER_SECTION = 8

/**
 * Every facet option from every type, as one grouped list for `USelectMenu`.
 * A `{ type: 'label' }` row heads each group; Nuxt UI's group filter drops a
 * group entirely once only its heading is left, so search self-prunes.
 */
export function useFacetIndex(ds: MaybeRefOrGetter<Dataset>, searchTerm?: MaybeRefOrGetter<string>) {
  const sections = computed(() => {
    const data = toValue(ds)
    return SECTIONS
      .map(s => ({
        label: s.label,
        icon: s.icon,
        items: s.options(data).map((o): FacetItem => ({
          ...o,
          token: facetToken(s.key, o.value),
          section: s.label,
          icon: s.icon,
          tone: s.tone?.(data, o.value),
          color: s.color
        }))
      }))
      .filter(s => s.items.length)
  })

  const groups = computed<(FacetItem | FacetLabel)[][]>(() => {
    // Once there's a search term, hand over everything and let USelectMenu filter.
    const capped = !toValue(searchTerm)
    return sections.value.map(({ label, items }) => {
      const shown = capped ? items.slice(0, PREVIEW_PER_SECTION) : items
      const rest = items.length - shown.length
      return [
        { type: 'label', label } satisfies FacetLabel,
        ...shown,
        ...(rest ? [{ type: 'label', label: `⋯ 另有 ${rest} 個，輸入以搜尋` } satisfies FacetLabel] : [])
      ]
    })
  })

  // Indexed over the *uncapped* set: a chip has to resolve its label even when
  // its option sits outside the preview.
  const byToken = computed(() => {
    const map = new Map<string, FacetItem>()
    for (const s of sections.value) for (const item of s.items) map.set(item.token, item)
    return map
  })

  // `sections` is the uncapped set the other two are derived from; the panel's
  // browse block takes its own slice of it, so the directory and the menu can
  // never disagree on a label, hue or token.
  return { sections, groups, byToken }
}

/**
 * The active facet selections as a flat token list — a single `v-model` over the
 * five separate `FilterState` arrays, so one combobox can drive them all.
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
