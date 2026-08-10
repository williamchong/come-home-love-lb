import type { Character, Episode, FeaturedRef, Meta, PlotlineCategory } from '~/types'
import type { EntityTone } from '~/utils/entityTone'
import type { Dataset, TonedPlotline } from './useDataset'
import { CATEGORY_LABEL, TAG_KIND_LABEL } from '~/types'
import { characterTone } from '~/utils/entityTone'
import { TAG_TONES } from '~/utils/tags'
import { DEFAULT_SORT, bySort } from './useEpisodeFilter'
import { loadDataset } from './useDataset'

/**
 * Lean, per-page projections of the dataset.
 *
 * Every route is prerendered (see `siteRoutes` in nuxt.config), and Nuxt
 * serialises each `useAsyncData` result into that route's payload. Handing a
 * page the whole `Dataset` would therefore park ~1.8 MB beside each of 4,300
 * static pages. Each page instead asks for exactly the records it renders — a
 * couple of KB — which is what makes prerendering affordable, and incidentally
 * why a detail page now paints from its payload instead of waiting on three
 * JSON chunks.
 *
 * These run on the server *and* the client: on a cold visit the prerendered
 * payload is already in the HTML, and on client-side navigation the builder
 * falls back to the lazily-loaded full tier. Both produce the same shape, so
 * hydration matches either way.
 *
 * The tag set is deliberately absent from every view — see `app/utils/tags.ts`.
 */

/**
 * Blocking on the server, so prerendered HTML carries its content; lazy on the
 * client, so navigating to a route whose payload isn't cached paints a loading
 * state rather than freezing the previous page behind a ~360 KB (gzipped)
 * dataset download.
 */
const CLIENT_LAZY = { lazy: import.meta.client }

/** A character as a badge or link renders it; `id` + `group` also feed `characterTone`. */
export type CharacterRef = Pick<Character, 'id' | 'name' | 'actor' | 'group'>

/** A plot line as a badge or link renders it, with its episode count pre-summed. */
export interface PlotlineRef {
  id: string
  name: string
  category: PlotlineCategory
  episodeCount: number
  /** Carried rather than re-derived: only the full tier can resolve it. */
  tone: EntityTone
}

/** What a plot-line badge needs — satisfied by `PlotlineRef` and `TonedPlotline` alike. */
export type PlotlineBadge = Pick<PlotlineRef, 'id' | 'name' | 'tone'>

/** Enough of an episode for the prev/next footer links. */
export type EpisodeNav = Pick<Episode, 'no' | 'title'>

/** Exactly the fields `EpisodeCard` renders — the rest of `Episode` is payload weight. */
export type EpisodeCardData = Pick<Episode,
  'no' | 'date' | 'title' | 'tagIds' | 'plotlineIds' | 'focus' | 'protagonists' | 'groupIds'>

const toCharacterRef = (ch: Character): CharacterRef =>
  ({ id: ch.id, name: ch.name, actor: ch.actor, group: ch.group })

const toPlotlineRef = (pl: TonedPlotline): PlotlineRef =>
  ({ id: pl.id, name: pl.name, category: pl.category, episodeCount: pl.episodes.length, tone: pl.tone })

const toEpisodeCardData = (e: Episode): EpisodeCardData => ({
  no: e.no, date: e.date, title: e.title, tagIds: e.tagIds,
  plotlineIds: e.plotlineIds, focus: e.focus, protagonists: e.protagonists, groupIds: e.groupIds
})

/** A run of episode cards plus everything their badges and cast tones resolve against. */
export interface EpisodeCardList {
  episodes: EpisodeCardData[]
  cardPlotlines: PlotlineRef[]
  cardCharacters: CharacterRef[]
}

/**
 * Projects the episodes a page lists, together with the plot lines and roster
 * entries their cards look up — the union over those episodes, not the whole
 * roster. 故事主人翁 tokens are names, and name === id for a roster entry's
 * first occurrence, so they resolve out of the same map as `characterIds`.
 */
function toCardList(ds: Dataset, episodes: Episode[]): EpisodeCardList {
  const plotlineIds = new Set(episodes.flatMap(e => e.plotlineIds))
  const tokens = new Set(episodes.flatMap(e => [...e.focus, ...e.protagonists]))
  return {
    episodes: episodes.map(toEpisodeCardData),
    cardPlotlines: [...plotlineIds].map(id => ds.plotlinesById.get(id)).filter(isPresent).map(toPlotlineRef),
    cardCharacters: [...tokens].map(t => ds.charactersById.get(t)).filter(isPresent).map(toCharacterRef)
  }
}

export interface EpisodeView {
  ep: Episode
  /** Roster entries for the cast *and* the 故事主人翁 tokens, keyed by id in the page. */
  characters: CharacterRef[]
  plotlines: PlotlineRef[]
  prev: EpisodeNav | null
  next: EpisodeNav | null
}

async function buildEpisodeView(no: number): Promise<EpisodeView | null> {
  const ds = await loadDataset()
  const ep = ds.episodesByNo.get(no)
  if (!ep) return null

  const nav = (n: number): EpisodeNav | null => {
    const e = ds.episodesByNo.get(n)
    return e ? { no: e.no, title: e.title } : null
  }
  const ids = new Set([...ep.characterIds, ...ep.focus, ...ep.protagonists])

  return {
    ep,
    characters: [...ids].map(id => ds.charactersById.get(id)).filter(isPresent).map(toCharacterRef),
    plotlines: ep.plotlineIds.map(id => ds.plotlinesById.get(id)).filter(isPresent).map(toPlotlineRef),
    prev: nav(no - 1),
    next: nav(no + 1)
  }
}

export interface CharacterView extends EpisodeCardList {
  ch: Character
  /** Plot lines this character is a member of. */
  plotlines: PlotlineRef[]
}

async function buildCharacterView(id: string): Promise<CharacterView | null> {
  const ds = await loadDataset()
  const ch = ds.charactersById.get(id)
  if (!ch) return null

  const episodes = (ch.episodeNos ?? []).map(n => ds.episodesByNo.get(n)).filter(isPresent)
  return {
    ch,
    plotlines: ds.plotlines.filter(p => p.characters.includes(ch.name)).map(toPlotlineRef),
    ...toCardList(ds, episodes)
  }
}

export interface PlotlineView {
  pl: TonedPlotline
  /** Roster entries behind the member tokens, so `tokenTone` can colour them. */
  members: CharacterRef[]
}

async function buildPlotlineView(id: string): Promise<PlotlineView | null> {
  const ds = await loadDataset()
  const pl = ds.plotlinesById.get(id)
  if (!pl) return null

  return {
    pl,
    members: pl.characters.map(name => ds.charactersById.get(name)).filter(isPresent).map(toCharacterRef)
  }
}

/** A curated 精選 entry with everything its card renders resolved out of the dataset. */
export interface FeaturedItem extends FeaturedRef {
  label: string
  /** Context line under the name — 愛情 / 客串・演員 / the family a character belongs to. */
  meta: string
  episodeCount: number
  /** Optional because `toneTextStyle` takes an unresolved lookup and falls back on its own. */
  tone?: EntityTone
  /** Where the card goes. Only 故事線 and 角色 have pages; a tag opens its filtered list. */
  to: string
}

/**
 * Resolves one `overlay.featured` entry. Returns null rather than throwing when
 * an id is stale, so a dataset refresh that drops an entity quietly loses the
 * card instead of breaking the home page — `build-data.mjs` already warns loudly
 * at the point the reference actually went bad.
 */
function toFeaturedItem(ds: Dataset, f: FeaturedRef): FeaturedItem | null {
  if (f.kind === 'plotline') {
    const pl = ds.plotlinesById.get(f.id)
    if (!pl) return null
    return {
      ...f, label: pl.name, meta: CATEGORY_LABEL[pl.category], episodeCount: pl.episodes.length,
      tone: pl.tone, to: `/plotline/${pl.id}`
    }
  }
  if (f.kind === 'character') {
    const ch = ds.charactersById.get(f.id)
    if (!ch) return null
    return {
      ...f, label: ch.name, meta: ch.actor || ch.group || '角色', episodeCount: ch.episodeNos?.length ?? 0,
      tone: characterTone(ch), to: `/character/${encodeURIComponent(ch.id)}`
    }
  }
  const tag = ds.tagsById.get(f.id)
  if (!tag) return null
  return {
    ...f,
    label: tag.label,
    meta: [TAG_KIND_LABEL[tag.kind], tag.guestActor].filter(Boolean).join('・'),
    episodeCount: tag.episodeNos.length,
    tone: TAG_TONES.get(tag.id),
    // no per-tag page exists, so the card opens the list already filtered to it
    to: `/?tags=${encodeURIComponent(tag.id)}`
  }
}

export interface HomeSeed extends EpisodeCardList {
  /** Only the count the page prints — the rest of `Meta`, `featured` included, is resolved below. */
  meta: Pick<Meta, 'total'>
  featured: FeaturedItem[]
}

async function buildHomeSeed(count: number): Promise<HomeSeed> {
  const ds = await loadDataset()
  // Ordered rather than trusted: the seed has to match what `useEpisodeFilter`
  // shows in its default order, or the handover visibly reshuffles.
  const episodes = [...ds.episodes].sort(bySort(DEFAULT_SORT)).slice(0, count)
  return {
    meta: { total: ds.meta.total },
    // Resolved here rather than in the page so the 精選 row is part of the
    // prerendered payload — it is the home page's first screen, and the tier
    // that could resolve it client-side (characters/plot lines) is the slow one.
    featured: ds.meta.featured.map(f => toFeaturedItem(ds, f)).filter(isPresent),
    ...toCardList(ds, episodes)
  }
}

// A reactive key is enough to refetch on param change: Nuxt watches it with a
// sync-flush watcher, and its own `watch` option explicitly no-ops while a key
// change is in flight. Passing both would be dead weight.
export function useEpisodeViewAsync(no: MaybeRefOrGetter<number>) {
  return useAsyncData(() => `episode-${toValue(no)}`, () => buildEpisodeView(toValue(no)), CLIENT_LAZY)
}

export function useCharacterViewAsync(id: MaybeRefOrGetter<string>) {
  return useAsyncData(() => `character-${toValue(id)}`, () => buildCharacterView(toValue(id)), CLIENT_LAZY)
}

export function usePlotlineViewAsync(id: MaybeRefOrGetter<string>) {
  return useAsyncData(() => `plotline-${toValue(id)}`, () => buildPlotlineView(toValue(id)), CLIENT_LAZY)
}

/**
 * The index page's server-rendered seed: enough episodes to fill the first page
 * so crawlers (and visitors) get real content before the filterable client tier
 * arrives. Deliberately unfiltered — the arrival query is only read on the
 * client, and the seed is replaced the moment `core` resolves.
 */
export function useHomeSeedAsync(count: number) {
  return useAsyncData('home-seed', () => buildHomeSeed(count))
}
