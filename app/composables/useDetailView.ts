import type { Character, Episode, FeaturedRef, Meta, PlotlineCategory } from '~/types'
import type { EntityTone } from '~/utils/entityTone'
import type { Dataset, TonedPlotline } from './useDataset'
import { CATEGORY_LABEL, TAG_KIND_LABEL } from '~/types'
import { characterTone } from '~/utils/entityTone'
import { TAG_TONES } from '~/utils/tags'
import { SCORELESS_SORT, bySort } from './useEpisodeFilter'
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

/** Where an episode sits in an ordered list, and what is either side of it. */
export interface EpisodePosition {
  /** 1-based. */
  index: number
  total: number
  prev: EpisodeNav | null
  next: EpisodeNav | null
}

/** Reads an episode back out of the dataset in the shape a prev/next link needs. */
export const episodeNav = (ds: Dataset) => (n: number): EpisodeNav | null => {
  const e = ds.episodesByNo.get(n)
  return e ? { no: e.no, title: e.title } : null
}

/**
 * Position of `no` within a list of episode numbers. Always ascending — watch
 * order — however the list that produced it happened to be sorted.
 */
export function positionIn(nos: number[], no: number, nav: (n: number) => EpisodeNav | null): EpisodePosition | null {
  const sorted = [...new Set(nos)].sort((a, b) => a - b)
  const at = sorted.indexOf(no)
  if (at < 0) return null
  return {
    index: at + 1,
    total: sorted.length,
    prev: at > 0 ? nav(sorted[at - 1]!) : null,
    next: at < sorted.length - 1 ? nav(sorted[at + 1]!) : null
  }
}

/**
 * One story line containing this episode, with its neighbours *inside that line*
 * already resolved — the playlist this episode sits in, rather than the episode
 * that happens to have aired next.
 */
export interface ArcNav extends EpisodePosition {
  id: string
  name: string
}

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
  /** Story-line neighbours, most specific arc first. Empty for an unlinked episode. */
  arcs: ArcNav[]
  prev: EpisodeNav | null
  next: EpisodeNav | null
}

/**
 * Resolves each plot line this episode belongs to down to *just* the episodes
 * either side of it.
 *
 * Only 7% of within-arc adjacent pairs are also numerically adjacent, so `no ± 1`
 * — what this page shipped before — almost never continues the story you are
 * actually following. The ordered lists that answer it are already on the plot
 * line (`Plotline.episodes`), but handing them to the page would cost ~7.3 KB
 * per episode, or 19.5 MB across the site against a ~6.1 MB total today.
 * Resolving them to two `EpisodeNav`s here costs ~130 B per arc and, unlike
 * anything derived from filter state, survives into the prerendered payload —
 * which is what lets a cold shared link carry the nav at all.
 *
 * Festivals are the one thing "smallest wins" gets wrong, and they arrive by two
 * doors. Festival *tags* aren't arcs at all — 端午節 is seven episodes spread
 * over seven years — and the one multi-episode 里程碑 sits inside its parent plot
 * line anyway, so tags are left out entirely. Festival *plot lines* are real
 * (故事系列 indexes them) but they are also the smallest category, so untouched
 * they would take the primary slot from every actual story: 第1458集 燁水婚前派對
 * would step to next Christmas, 357 episodes away, instead of on through the
 * wedding. They stay available, ranked last.
 *
 * 95% of episodes (2,725) come out with at least one arc; the rest keep ±1.
 */
function buildArcs(ds: Dataset, ep: Episode, nav: (n: number) => EpisodeNav | null): ArcNav[] {
  return ep.plotlineIds
    .map(id => ds.plotlinesById.get(id))
    .filter(isPresent)
    .map((pl) => {
      // Read back through `nav` rather than the plot line's own {no,title}
      // copy, so a label always matches the page it opens.
      //
      // Cross-linking assigns an episode to a plot line by number *range*, so a
      // line can legitimately name this episode without listing it — in which
      // case there is no position to report and nothing to step through.
      const pos = positionIn(pl.episodes.map(e => e.no), ep.no, nav)
      if (!pos) return null
      return {
        id: pl.id,
        name: pl.name,
        // Ranking only; both are stripped below. The page reads a plot line's
        // category off `plotlines`, which it already has.
        seasonal: pl.category === 'festival',
        gap: Math.min(
          pos.prev ? ep.no - pos.prev.no : Infinity,
          pos.next ? pos.next.no - ep.no : Infinity
        ),
        ...pos
      }
    })
    .filter(isPresent)
    // A one-episode line, or one this episode caps, has no step left in it.
    .filter(a => a.prev || a.next)
    // Story before season, then whichever line picks up soonest, then the more
    // specific one. Ranking by size instead reads well but behaves badly: it
    // prefers a 9-episode line two characters share across the whole run to the
    // 148-episode romance that continues in the very next episode. Closing the
    // gap is what "keep watching this" means — it halves the median step (20 →
    // 13) and the p90 (149 → 77) against ranking by size.
    //
    // Uncapped, because this list is two things at once: the page shows the
    // head of it as suggestions, but `usePlaylist` also answers a
    // `?list=plotlines:…` out of it. Capping would leave a URL naming a real
    // line the page can't step through without pulling the whole dataset.
    // 1.70 arcs per episode on average keeps that cheap.
    .sort((a, b) => Number(a.seasonal) - Number(b.seasonal) || a.gap - b.gap || a.total - b.total)
    .map(({ seasonal, gap, ...arc }) => arc)
}

async function buildEpisodeView(no: number): Promise<EpisodeView | null> {
  const ds = await loadDataset()
  const ep = ds.episodesByNo.get(no)
  if (!ep) return null

  const nav = episodeNav(ds)
  const ids = new Set([...ep.characterIds, ...ep.focus, ...ep.protagonists])

  return {
    ep,
    characters: [...ids].map(id => ds.charactersById.get(id)).filter(isPresent).map(toCharacterRef),
    plotlines: ep.plotlineIds.map(id => ds.plotlinesById.get(id)).filter(isPresent).map(toPlotlineRef),
    arcs: buildArcs(ds, ep, nav),
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
  /**
   * The `key:value` subject this card stands for, so the row can order itself by
   * what people voted for. Resolved here, in the payload, rather than derived on
   * the page: `FeaturedKind` is singular (`plotline`) and a subject key is plural
   * (`plotlines`), and this is the one place that already knows which catalogue
   * each entry came out of.
   */
  token: string
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
      tone: pl.tone, to: `/plotline/${pl.id}`, token: subjectToken('plotlines', pl.id)
    }
  }
  if (f.kind === 'character') {
    const ch = ds.charactersById.get(f.id)
    if (!ch) return null
    return {
      ...f, label: ch.name, meta: ch.actor || ch.group || '角色', episodeCount: ch.episodeNos?.length ?? 0,
      tone: characterTone(ch), to: `/character/${encodeURIComponent(ch.id)}`,
      token: subjectToken('characters', ch.id)
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
    to: `/tag/${encodeURIComponent(tag.id)}`,
    token: subjectToken('tags', tag.id)
  }
}

/**
 * The facet kinds that have a page of their own but no entity behind them —
 * everything the panel offers except 角色 and 故事線, which have real records.
 */
export type FacetViewKey = 'tags' | 'groups' | 'writers'

/**
 * A facet's own page: what it is called, and every episode carrying it.
 *
 * 節日 / 客串 / 里程碑 / 家庭・機構 / 編劇 were filters and nothing else — 迎新年
 * and 波比與群姐 could narrow the list but had nowhere to *be*, so nothing linked
 * to them, the sitemap couldn't offer them, and there was no surface to vote on.
 * One shape covers all five: they differ only in how their episodes are found.
 */
export interface FacetView extends EpisodeCardList {
  label: string
  /** Context line under the title — 節日, 客串・演員 … Empty where there is none. */
  meta: string
  /** Free text under the heading, where the source has any. */
  summary?: string
  /**
   * The `key:value` token this page stands for. One string doing three jobs:
   * the filter it links to, the playlist its cards hand on, and the vote
   * subject — which is the whole reason `facetToken` and `subjectToken` are the
   * same vocabulary.
   */
  token: string
  tone?: EntityTone
}

/** How each kind finds its episodes. Keyed so the three routes share one builder. */
const FACET_EPISODES: Record<FacetViewKey, (ds: Dataset, value: string) => Episode[]> = {
  tags: (ds, id) => (ds.tagsById.get(id)?.episodeNos ?? []).map(n => ds.episodesByNo.get(n)).filter(isPresent),
  // 家庭・機構 and 編劇 have no record of their own — the facet *is* the set of
  // episodes naming them, exactly as `useDataset` counts them into its facets.
  groups: (ds, label) => ds.episodes.filter(e => e.groupIds.includes(label)),
  writers: (ds, name) => ds.episodes.filter(e => e.writers.includes(name))
}

async function buildFacetView(key: FacetViewKey, value: string): Promise<FacetView | null> {
  const ds = await loadDataset()
  // Prerendered, so there is no score map to order by — see `SCORELESS_SORT`.
  const episodes = FACET_EPISODES[key](ds, value).sort(bySort(SCORELESS_SORT))
  const tag = key === 'tags' ? ds.tagsById.get(value) : undefined

  // A tag is only real if the tag set knows it; a group or writer is real if any
  // episode names it. Either way, no episodes means no page.
  if (key === 'tags' && !tag) return null
  if (!episodes.length) return null

  return {
    label: tag?.label ?? value,
    meta: tag ? [TAG_KIND_LABEL[tag.kind], tag.guestActor].filter(Boolean).join('・') : FACET_VIEW_META[key],
    summary: tag?.summary,
    token: facetToken(key, value),
    tone: tag ? TAG_TONES.get(tag.id) : (key === 'groups' ? tokenTone(value, ds.charactersById, true) : undefined),
    ...toCardList(ds, episodes)
  }
}

/** Fallback context line for the kinds with no record to describe them. */
const FACET_VIEW_META: Record<FacetViewKey, string> = {
  tags: TAG_KIND_LABEL.special,
  groups: '家庭 / 機構',
  writers: '編劇'
}

export function useFacetViewAsync(key: FacetViewKey, value: MaybeRefOrGetter<string>) {
  return useAsyncData(() => `${key}-${toValue(value)}`, () => buildFacetView(key, toValue(value)), CLIENT_LAZY)
}

export interface HomeSeed extends EpisodeCardList {
  /** Only the count the page prints — the rest of `Meta`, `featured` included, is resolved below. */
  meta: Pick<Meta, 'total'>
  featured: FeaturedItem[]
}

async function buildHomeSeed(count: number): Promise<HomeSeed> {
  const ds = await loadDataset()
  // Ordered rather than trusted: the seed has to match what `useEpisodeFilter`
  // shows, or the handover visibly reshuffles. It asks for `SCORELESS_SORT`
  // rather than the default now that the default is 得分 — this runs at deploy
  // time, and the two agree until the first snapshot lands on the client.
  const episodes = [...ds.episodes].sort(bySort(SCORELESS_SORT)).slice(0, count)
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
