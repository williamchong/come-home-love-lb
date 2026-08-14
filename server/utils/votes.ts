import type { H3Event } from 'h3'
import type { VoteValue } from '#shared/types/votes'

/** Built once per isolate from `runtimeConfig`, which was parsed at startup. */
let votableSubjects: Set<string> | undefined

/**
 * Is this a subject the catalogue actually contains?
 *
 * The list is generated in `nuxt.config.ts` from the same JSON the pages are
 * built from. Without this check the table accepts any string, and the score
 * snapshot — which every visitor downloads — becomes the way that garbage is
 * served back out.
 */
export function isVotableSubject(event: H3Event, subject: string) {
  votableSubjects ??= new Set(useRuntimeConfig(event).voteSubjects)
  return votableSubjects.has(subject)
}

/**
 * How many subjects one voter may have voted on in the trailing hour.
 *
 * Counted over live rows, so withdrawing a vote frees its slot — which lets
 * someone toggle one subject forever, but toggling nets out to zero and changes
 * no score. What it does bound is the interesting abuse: sweeping hundreds of
 * subjects in one pass.
 */
export const HOURLY_VOTE_LIMIT = 60
export const RATE_WINDOW_MS = 60 * 60 * 1000

/** Narrows an arbitrary JSON value to a vote, or `null` if it isn't one. */
export function asVoteValue(value: unknown): VoteValue | null {
  return value === 1 || value === 0 || value === -1 ? value : null
}
