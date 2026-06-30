import type { Episode, Character, Plotline, Tag, Group, Meta, TagKind } from '~/types'
import { CATEGORY_LABEL } from '~/types'

export interface FacetOption {
  value: string
  label: string
  count: number
  meta?: string
}

export interface Dataset {
  episodes: Episode[]
  episodesByNo: Map<number, Episode>
  characters: Character[]
  charactersById: Map<string, Character>
  plotlines: Plotline[]
  plotlinesById: Map<string, Plotline>
  tags: Tag[]
  tagsById: Map<string, Tag>
  groups: Group[]
  meta: Meta
  facets: {
    characters: FacetOption[]
    plotlines: FacetOption[]
    groups: FacetOption[]
    writers: FacetOption[]
    years: FacetOption[]
    tagsByKind: Record<TagKind, FacetOption[]>
  }
}

let _promise: Promise<Dataset> | null = null

async function build(): Promise<Dataset> {
  const [e, c, p, t, g, m] = await Promise.all([
    import('~/data/episodes.json'),
    import('~/data/characters.json'),
    import('~/data/plotlines.json'),
    import('~/data/tags.json'),
    import('~/data/groups.json'),
    import('~/data/meta.json')
  ])
  const episodes = e.default as unknown as Episode[]
  const characters = c.default as unknown as Character[]
  const plotlines = p.default as unknown as Plotline[]
  const tags = t.default as unknown as Tag[]
  const groups = g.default as unknown as Group[]
  const meta = m.default as unknown as Meta

  const episodesByNo = new Map(episodes.map(x => [x.no, x]))
  const charactersById = new Map(characters.map(x => [x.id, x]))
  const plotlinesById = new Map(plotlines.map(x => [x.id, x]))
  const tagsById = new Map(tags.map(x => [x.id, x]))

  // ---- facet option lists (counted over episodes) ----
  const count = (key: keyof Episode) => {
    const map = new Map<string, number>()
    for (const ep of episodes) {
      const v = ep[key]
      if (Array.isArray(v)) for (const item of v) map.set(String(item), (map.get(String(item)) || 0) + 1)
    }
    return map
  }
  const charCounts = count('characterIds')
  const plotCounts = count('plotlineIds')
  const groupCounts = count('groupIds')
  const writerCounts = count('writers')

  const characterFacets: FacetOption[] = [...charCounts.entries()]
    .map(([id, n]) => {
      const ch = charactersById.get(id)
      return { value: id, label: ch?.name || id, count: n, meta: ch?.actor || undefined }
    })
    .sort((a, b) => b.count - a.count)

  const plotlineFacets: FacetOption[] = plotlines
    .map(pl => ({ value: pl.id, label: pl.name, count: plotCounts.get(pl.id) || pl.episodes.length, meta: CATEGORY_LABEL[pl.category] }))
    .sort((a, b) => b.count - a.count)

  const groupFacets: FacetOption[] = [...groupCounts.entries()]
    .map(([label, n]) => ({ value: label, label, count: n }))
    .sort((a, b) => b.count - a.count)

  const writerFacets: FacetOption[] = [...writerCounts.entries()]
    .map(([label, n]) => ({ value: label, label, count: n }))
    .sort((a, b) => b.count - a.count)

  const yearMap = new Map<string, number>()
  for (const ep of episodes) if (ep.year) yearMap.set(String(ep.year), (yearMap.get(String(ep.year)) || 0) + 1)
  const yearFacets: FacetOption[] = [...yearMap.entries()]
    .map(([y, n]) => ({ value: y, label: `${y}`, count: n }))
    .sort((a, b) => Number(a.value) - Number(b.value))

  const tagsByKind = { festival: [], cameo: [], milestone: [], special: [], location: [] } as Record<TagKind, FacetOption[]>
  for (const tag of tags) {
    tagsByKind[tag.kind].push({ value: tag.id, label: tag.label, count: tag.episodeNos.length, meta: tag.guestActor || undefined })
  }
  for (const kind of Object.keys(tagsByKind) as TagKind[]) tagsByKind[kind].sort((a, b) => b.count - a.count)

  return {
    episodes, episodesByNo, characters, charactersById, plotlines, plotlinesById, tags, tagsById, groups, meta,
    facets: { characters: characterFacets, plotlines: plotlineFacets, groups: groupFacets, writers: writerFacets, years: yearFacets, tagsByKind }
  }
}

/** Loads the (large) generated dataset once and caches the promise app-wide. */
export function loadDataset(): Promise<Dataset> {
  if (!_promise) _promise = build()
  return _promise
}
