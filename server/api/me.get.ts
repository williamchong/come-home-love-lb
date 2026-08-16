import type { MyVotesResponse, ScoreMap, VoteValue } from '#shared/types/votes'

/**
 * The caller's own votes — and the live totals of the subjects they touched.
 *
 * The client keeps the same answer in localStorage and reads that first — this
 * is the fallback for when that has been cleared but the cookie survives, which
 * is the common case rather than an edge one: the cookie is set over
 * `Set-Cookie` and lasts a year, while script-writable storage is what Safari's
 * ITP wipes after seven quiet days.
 *
 * Never cached, and never batched into the score snapshot: this is the one
 * response that is about a specific person.
 *
 * Being uncached is also why the totals ride along here. `/api/scores` is one
 * document shared by everyone behind a five-minute TTL, so right after voting
 * it still describes the world before that vote — and if nobody had voted on
 * the subject before, it doesn't describe the subject at all, so the control
 * fell back to 「–」 and the vote looked lost. These totals are read per
 * request, so laying them over the snapshot always moves it forward.
 *
 * The join costs one `totals` row per subject the caller has voted on, roughly
 * doubling this route's rows read. That is bounded by one person's own voting
 * and never enters the snapshot's per-colo rebuild budget, which is the number
 * the D1 row allowance is actually sized against.
 *
 * A first-time visitor skips the query entirely. `useVotes` calls this on every
 * hard page load, and `resolveVoter` mints an id for anyone without a valid
 * cookie — so for the majority of traffic this route was putting a D1 round
 * trip on the critical path to learn that an id created microseconds ago has no
 * votes. `issued` is that answer without asking.
 */
export default defineEventHandler(async (event): Promise<MyVotesResponse> => {
  setHeader(event, 'cache-control', 'private, no-store')

  const voter = await resolveVoter(event)
  if (!voter || voter.issued) return { votes: {}, totals: {} }

  const db = votesDb(event)
  // LEFT JOIN so a vote is still reported even if its totals row is somehow
  // missing — the caller's own vote is the thing this route exists to answer.
  const { results } = await db
    .prepare(
      `SELECT v.subject, v.value, t.up, t.down
         FROM votes v LEFT JOIN totals t ON t.subject = v.subject
        WHERE v.voter_id = ?1`
    )
    .bind(voter.id).all<{ subject: string, value: number, up: number | null, down: number | null }>()

  const votes: Record<string, VoteValue> = {}
  const totals: ScoreMap = {}
  for (const row of results) {
    const value = asVoteValue(row.value)
    if (!value) continue
    votes[row.subject] = value
    if (row.up !== null && row.down !== null) totals[row.subject] = [row.up, row.down]
  }
  return { votes, totals }
})
