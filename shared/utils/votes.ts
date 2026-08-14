import type { ScoreMap } from '#shared/types/votes'

/**
 * What a `[up, down]` tally is worth as one number.
 *
 * Shared because "the score" has to mean the same thing in the two places that
 * read it independently — the number under the thumbs, and the comparator that
 * orders 2,868 episodes by it. `undefined` rather than `0` for an unvoted
 * subject: the control shows「–」for "nobody has voted", which is not the same
 * as a subject that has been voted up and back down again.
 */
export const netScore = (tally: ScoreMap[string] | undefined) =>
  (tally ? tally[0] - tally[1] : undefined)
