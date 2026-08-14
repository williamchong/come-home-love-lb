/**
 * What a vote can be cast on, as one string.
 *
 * The shape is `key:value`, deliberately the same one `facetToken` already used
 * for filter chips (`app/composables/useFacetIndex.ts`) — a character is spelled
 * `characters:熊樹根` whether it is narrowing a list or receiving a vote, so the
 * omnibox, the URL query, the playlist and the API all speak one vocabulary.
 *
 * It lives in `shared/` because it is the one thing the browser and the Worker
 * genuinely both need: the app builds these tokens, the API validates them.
 *
 * `episodes` is the addition. Episodes are not a facet — you cannot filter the
 * list down to one episode, you open it — so `FACET_KEYS` does not carry them
 * and `parseToken` rejects `episodes:1234` as a filter. Both remain true; this
 * is the wider set, not a replacement.
 */
export const SUBJECT_KEYS = ['episodes', 'characters', 'plotlines', 'groups', 'tags', 'writers'] as const

export type SubjectKey = typeof SUBJECT_KEYS[number]

const isSubjectKey = (v: string): v is SubjectKey => (SUBJECT_KEYS as readonly string[]).includes(v)

export const subjectToken = (key: SubjectKey, value: string | number) => `${key}:${value}`

/**
 * Split on the *first* colon only — group and writer values are raw labels, and
 * nothing stops a writer's name containing one. Mirrors `parseToken`.
 */
export function parseSubject(token: string): { key: SubjectKey, value: string } | null {
  const i = token.indexOf(':')
  if (i < 0) return null
  const key = token.slice(0, i)
  return isSubjectKey(key) ? { key, value: token.slice(i + 1) } : null
}
