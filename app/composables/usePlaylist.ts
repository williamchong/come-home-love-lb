import type { EntityTone } from '~/utils/entityTone'
import type { Dataset } from './useDataset'
import type { ArcNav, EpisodePosition } from './useDetailView'
import type { FacetKey } from './useEpisodeFilter'
import { characterTone, familyTone } from '~/utils/entityTone'
import { TAG_TONES } from '~/utils/tags'
import { loadDataset } from './useDataset'
import { episodeNav, positionIn } from './useDetailView'
import { parseToken } from './useFacetIndex'

/**
 * The list an episode page steps through, when the visitor arrived inside one.
 *
 * Sequence is the episode page's default: ±1 by number, which is what a bare
 * /episode/N means and the only thing a prerendered page can promise. A visitor
 * who got there *through* something — a story line's 劇集順序, a character's
 * 焦點劇集, a filtered list, a shared link — was already following a narrower
 * list, and `?list=` carries it across so prev/next keep following it.
 *
 * The token is `key:value`, the same pair `facetToken` builds for the filter
 * menu, so every facet the catalogue can filter by is also a playlist and no
 * second vocabulary is needed.
 */
export interface Playlist extends EpisodePosition {
  token: string
  /** The episode this was resolved around — see `usePlaylistAsync`. */
  no: number
  label: string
  /** The list's own page or filtered view. */
  to: string
  tone?: EntityTone
}

interface PlaylistSource {
  label: string
  to: string
  tone?: EntityTone
  nos: number[]
}

/**
 * One resolver per facet, as a table rather than an if-chain so that adding a
 * `FacetKey` is a type error here instead of silently falling through to the
 * writer scan.
 *
 * The query keys are spelled out because `toQuery` does not simply echo the
 * state keys (plotlines → plots, characters → chars); these two coincide.
 */
const SOURCES: Record<FacetKey, (ds: Dataset, value: string) => PlaylistSource | null> = {
  plotlines: (ds, value) => {
    const pl = ds.plotlinesById.get(value)
    return pl ? { label: pl.name, to: `/plotline/${pl.id}`, tone: pl.tone, nos: pl.episodes.map(e => e.no) } : null
  },
  characters: (ds, value) => {
    const ch = ds.charactersById.get(value)
    return ch
      ? {
          label: ch.name, to: `/character/${encodeURIComponent(ch.id)}`,
          tone: characterTone(ch), nos: ch.episodeNos ?? []
        }
      : null
  },
  tags: (ds, value) => {
    const tag = ds.tagsById.get(value)
    return tag
      ? {
          label: tag.label, to: `/?tags=${encodeURIComponent(tag.id)}`,
          tone: TAG_TONES.get(tag.id), nos: tag.episodeNos
        }
      : null
  },
  // 家庭・機構 and 編劇 have no page of their own and no precomputed episode
  // list, so they are scanned — one pass over 2,868 records, only on the visits
  // that actually arrived inside one.
  groups: (ds, value) => ({
    label: value,
    to: `/?groups=${encodeURIComponent(value)}`,
    tone: familyTone(value),
    nos: ds.episodes.filter(e => e.groupIds.includes(value)).map(e => e.no)
  }),
  writers: (ds, value) => ({
    label: value,
    to: `/?writers=${encodeURIComponent(value)}`,
    nos: ds.episodes.filter(e => e.writers.includes(value)).map(e => e.no)
  })
}

async function buildPlaylist(token: string | null, no: number, arcs: ArcNav[]): Promise<Playlist | null> {
  if (!token) return null
  const parsed = parseToken(token)
  if (!parsed) return null

  // Fast path: `buildArcs` already resolved every story line this episode can
  // be stepped through, and it rode in on the prerendered payload. A cold
  // visitor following a 故事線 therefore pays nothing for the first step.
  if (parsed.key === 'plotlines') {
    const arc = arcs.find(a => a.id === parsed.value)
    if (arc) {
      const { id, name, ...position } = arc
      return { token, no, label: name, to: `/plotline/${id}`, ...position }
    }
  }

  const ds = await loadDataset()
  const source = SOURCES[parsed.key](ds, parsed.value)
  if (!source) return null
  const position = positionIn(source.nos, no, episodeNav(ds))
  // A list that doesn't contain this episode is a stale or hand-edited link.
  // Falling back to null just puts the page back on ±1.
  if (!position) return null
  return { token, no, label: source.label, to: source.to, tone: source.tone, ...position }
}

/**
 * Client-only by construction: a prerendered page is one file for every query
 * string, so its HTML can only ever show the sequential default. Resolving the
 * playlist through `useAsyncData({ server: false })` means the first client
 * render still matches that HTML and the list takes over a tick later — the
 * same progressive fill-in the episode cards use for tones and badges.
 *
 * Nuxt seeds a new key's data with the *previous* key's value, so the result
 * carries the `no` it was resolved around and the page discards a stale one
 * rather than flashing the last episode's position while this one loads.
 */
export function usePlaylistAsync(no: MaybeRefOrGetter<number>, arcs: MaybeRefOrGetter<ArcNav[]>) {
  const route = useRoute()
  const token = computed(() => (typeof route.query.list === 'string' ? route.query.list : null))
  return useAsyncData(
    () => `playlist-${token.value ?? ''}-${toValue(no)}`,
    () => buildPlaylist(token.value, toValue(no), toValue(arcs)),
    { server: false, lazy: true }
  )
}
