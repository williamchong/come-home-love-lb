import type { Episode, Character, Plotline, Tag, Group, Meta, TagKind } from '~/types'
import { CATEGORY_LABEL } from '~/types'

export interface FacetOption {
  value: string
  label: string
  count: number
  meta?: string
  aliases?: string[] // extra searchable terms (names + nicknames)
}

/** First tier: everything the episode list + filtering + tag facets need (~106 KB gz). */
export interface CoreDataset {
  episodes: Episode[]
  episodesByNo: Map<number, Episode>
  tags: Tag[]
  tagsById: Map<string, Tag>
  meta: Meta
  facets: {
    writers: FacetOption[]
    years: FacetOption[]
    tagsByKind: Record<TagKind, FacetOption[]>
  }
}

/** Second tier: adds the character/plot-line/group data used by facets, presets and detail pages. */
export interface Dataset extends CoreDataset {
  characters: Character[]
  charactersById: Map<string, Character>
  plotlines: Plotline[]
  plotlinesById: Map<string, Plotline>
  groups: Group[]
  facets: CoreDataset['facets'] & {
    characters: FacetOption[]
    plotlines: FacetOption[]
    groups: FacetOption[]
  }
}

// Count occurrences of each value across an array-valued episode field.
function countField(episodes: Episode[], key: keyof Episode) {
  const map = new Map<string, number>()
  for (const ep of episodes) {
    const v = ep[key]
    if (Array.isArray(v)) for (const item of v) map.set(String(item), (map.get(String(item)) || 0) + 1)
  }
  return map
}

let _corePromise: Promise<CoreDataset> | null = null
let _fullPromise: Promise<Dataset> | null = null

async function buildCore(): Promise<CoreDataset> {
  const [e, t, m] = await Promise.all([
    import('~/data/episodes.json'),
    import('~/data/tags.json'),
    import('~/data/meta.json')
  ])
  const episodes = e.default as unknown as Episode[]
  const tags = t.default as unknown as Tag[]
  const meta = m.default as unknown as Meta

  const episodesByNo = new Map(episodes.map(x => [x.no, x]))
  const tagsById = new Map(tags.map(x => [x.id, x]))

  const writers: FacetOption[] = [...countField(episodes, 'writers').entries()]
    .map(([label, n]) => ({ value: label, label, count: n }))
    .sort((a, b) => b.count - a.count)

  const yearMap = new Map<string, number>()
  for (const ep of episodes) if (ep.year) yearMap.set(String(ep.year), (yearMap.get(String(ep.year)) || 0) + 1)
  const years: FacetOption[] = [...yearMap.entries()]
    .map(([y, n]) => ({ value: y, label: `${y}`, count: n }))
    .sort((a, b) => Number(a.value) - Number(b.value))

  const tagsByKind = { festival: [], cameo: [], milestone: [], special: [], location: [] } as Record<TagKind, FacetOption[]>
  for (const tag of tags) {
    tagsByKind[tag.kind].push({ value: tag.id, label: tag.label, count: tag.episodeNos.length, meta: tag.guestActor || undefined })
  }
  for (const kind of Object.keys(tagsByKind) as TagKind[]) tagsByKind[kind].sort((a, b) => b.count - a.count)

  return { episodes, episodesByNo, tags, tagsById, meta, facets: { writers, years, tagsByKind } }
}

async function buildFull(): Promise<Dataset> {
  const core = await loadCore()
  const [c, p, g] = await Promise.all([
    import('~/data/characters.json'),
    import('~/data/plotlines.json'),
    import('~/data/groups.json')
  ])
  const characters = c.default as unknown as Character[]
  const plotlines = p.default as unknown as Plotline[]
  const groups = g.default as unknown as Group[]

  const charactersById = new Map(characters.map(x => [x.id, x]))
  const plotlinesById = new Map(plotlines.map(x => [x.id, x]))

  const plotCounts = countField(core.episodes, 'plotlineIds')
  const groupCounts = countField(core.episodes, 'groupIds')

  const characterFacets: FacetOption[] = [...countField(core.episodes, 'characterIds').entries()]
    .map(([id, n]) => {
      const ch = charactersById.get(id)
      return { value: id, label: ch?.name || id, count: n, meta: ch?.actor || undefined, aliases: ch?.aliases }
    })
    .sort((a, b) => b.count - a.count)

  const plotlineFacets: FacetOption[] = plotlines
    .map(pl => ({
      value: pl.id,
      label: pl.name,
      count: plotCounts.get(pl.id) || pl.episodes.length,
      meta: CATEGORY_LABEL[pl.category],
      // CP names rarely contain member names, so also index members' names +
      // nicknames. charactersById is id-keyed, but id === name for a name's
      // first (facet-relevant) occurrence, so the bare-name lookup is intended;
      // group/minor tokens just contribute their literal name.
      aliases: pl.characters.flatMap(charName => [charName, ...(charactersById.get(charName)?.aliases ?? [])])
    }))
    .sort((a, b) => b.count - a.count)

  const groupFacets: FacetOption[] = [...groupCounts.entries()]
    .map(([label, n]) => ({ value: label, label, count: n }))
    .sort((a, b) => b.count - a.count)

  return {
    ...core,
    characters, charactersById, plotlines, plotlinesById, groups,
    facets: { ...core.facets, characters: characterFacets, plotlines: plotlineFacets, groups: groupFacets }
  }
}

/** Core tier — episodes/tags/meta + facets derived from them. Cached app-wide. */
export function loadCore(): Promise<CoreDataset> {
  if (!_corePromise) _corePromise = buildCore()
  return _corePromise
}

/** Full tier — core plus characters/plot lines/groups + their facets. Cached app-wide. */
export function loadDataset(): Promise<Dataset> {
  if (!_fullPromise) _fullPromise = buildFull()
  return _fullPromise
}
