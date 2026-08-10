/**
 * Link to an episode, keeping the visitor inside the list they were browsing.
 *
 * `token` is a `key:value` facet token; the episode page reads it back out of
 * `?list=` to decide what prev/next follow (see `usePlaylist`). Without one the
 * link stays a plain path, which is also what the sequential default means.
 */
export const episodeLink = (no: number, token?: string | null) =>
  (token ? { path: `/episode/${no}`, query: { list: token } } : `/episode/${no}`)
