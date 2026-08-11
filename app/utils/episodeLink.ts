/**
 * Link to an episode, keeping the visitor inside the list they were browsing.
 *
 * `token` is a `key:value` facet token; the episode page reads it back out of
 * `?list=` to decide what prev/next follow (see `usePlaylist`). Without one the
 * link stays a plain path, which is also what the sequential default means.
 */
export const episodeLink = (no: number, token?: string | null) =>
  (token ? { path: `/episode/${no}`, query: { list: token } } : `/episode/${no}`)

/** Spelled once, so the id an anchor writes and the hash a link points at agree. */
const ANCHOR_PREFIX = 'ep-'

/** DOM id for an episode's row in any list that renders one. */
export const episodeAnchor = (no: number) => `${ANCHOR_PREFIX}${no}`

/**
 * `#ep-1234` — how a page links *back* into a list at the episode it came from.
 *
 * A hash rather than a query parameter, deliberately: it never reaches the
 * server, so it adds no indexable variant and leaves canonicals and the sitemap
 * exactly as they were (the same reason `usePlaylist` had to justify `?list=`).
 */
export const episodeHash = (no: number) => `#${episodeAnchor(no)}`

/** The episode a `#ep-1234` hash names, or null for anything else. */
export function parseEpisodeAnchor(hash: string): number | null {
  if (!hash.startsWith(`#${ANCHOR_PREFIX}`)) return null
  const no = hash.slice(ANCHOR_PREFIX.length + 1)
  return /^\d+$/.test(no) ? Number(no) : null
}
