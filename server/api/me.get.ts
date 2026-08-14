import type { MyVotesResponse, VoteValue } from '#shared/types/votes'

/**
 * The caller's own votes, so the controls can show what they already chose.
 *
 * The client keeps the same answer in localStorage and reads that first — this
 * is the fallback for when that has been cleared but the cookie survives, which
 * is the common case rather than an edge one: the cookie is set over
 * `Set-Cookie` and lasts a year, while script-writable storage is what Safari's
 * ITP wipes after seven quiet days.
 *
 * Never cached, and never batched into the score snapshot: this is the one
 * response that is about a specific person.
 */
export default defineEventHandler(async (event): Promise<MyVotesResponse> => {
  setHeader(event, 'cache-control', 'private, no-store')

  const voter = await resolveVoter(event)
  if (!voter) return { votes: {} }

  const db = votesDb(event)
  const { results } = await db
    .prepare('SELECT subject, value FROM votes WHERE voter_id = ?1')
    .bind(voter).all<{ subject: string, value: number }>()

  const votes: Record<string, VoteValue> = {}
  for (const row of results) {
    const value = asVoteValue(row.value)
    if (value) votes[row.subject] = value
  }
  return { votes }
})
