/**
 * The vote API's wire shapes, shared so the Worker and the browser cannot
 * disagree about them.
 */

/** Up, none, or down. `0` is how a vote is withdrawn — see `POST /api/vote`. */
export type VoteValue = 1 | 0 | -1

/**
 * `subject → [up, down]`, keyed by the full `key:value` subject token.
 *
 * Spelled out (`episodes:1234`, not `e:1234`) despite there being thousands of
 * them: the keys are a run of identical prefixes, which is the one thing gzip
 * removes almost entirely, so the short form would save nothing real and cost a
 * mapping layer between the API and the vocabulary the app already speaks.
 *
 * Only subjects with at least one vote appear, so this starts near-empty and
 * grows towards — never past — the size of the allowlist.
 */
export type ScoreMap = Record<string, [up: number, down: number]>

export interface ScoresResponse {
  /** Bumped if the shape ever changes, so a cached snapshot can be discarded. */
  version: number
  generatedAt: number
  scores: ScoreMap
  /**
   * Whether votes can actually be cast — false when the signing secret is unset.
   *
   * Reported here so the client can hide the controls instead of showing ones
   * that 503 on click. That is the state of every deploy made before
   * `wrangler secret put NUXT_VOTE_SECRET`, so it is a real configuration, not
   * a theoretical one.
   */
  votingEnabled: boolean
}

/** What a cast vote returns: the subject's new totals, and the caller's own vote. */
export interface VoteResponse {
  subject: string
  up: number
  down: number
  mine: VoteValue
}

/** `subject → the caller's own vote`, for restoring UI state on a new device. */
export interface MyVotesResponse {
  votes: Record<string, VoteValue>
  /**
   * Live totals for exactly the subjects in `votes`, which the client lays over
   * the score snapshot.
   *
   * The snapshot is one shared document behind a five-minute TTL, so it can
   * easily predate this visitor's own vote — and a subject nobody had voted on
   * before is *absent* from it rather than merely out of date, which renders as
   * 「–」. So the moment after voting, a refresh showed the vote gone. This
   * response is `no-store` and per-voter, so its totals are always at least as
   * fresh as the snapshot's.
   */
  totals: ScoreMap
}
