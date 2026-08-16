import type { VoteResponse } from '#shared/types/votes'

/**
 * Cast, change, or withdraw one vote. `value` is `1`, `-1`, or `0` to withdraw.
 *
 * Deduplication is the primary key on `votes`, not anything in here: a repeat
 * vote can only ever UPDATE or DELETE the caller's existing row, so retries and
 * double-clicks are idempotent by construction rather than by checking.
 *
 * The write is a batch, which D1 runs as one transaction — a vote and the total
 * it moves are never half-applied. Totals are **recounted** from `votes` inside
 * that batch rather than moved by a delta: a delta is O(1) and wrong under
 * concurrency, for the reasons set out in full at the recount itself. Do not
 * "optimise" it back — read that comment first.
 */
export default defineEventHandler(async (event): Promise<VoteResponse> => {
  const body = await readBody<{ subject?: unknown, value?: unknown }>(event)
  const subject = typeof body?.subject === 'string' ? body.subject : ''
  const value = asVoteValue(body?.value)

  if (value === null) throw createError({ statusCode: 400, statusMessage: 'value must be 1, 0 or -1' })
  if (!isVotableSubject(event, subject)) throw createError({ statusCode: 400, statusMessage: 'Unknown subject' })

  const voter = await resolveVoter(event)
  if (!voter) throw createError({ statusCode: 503, statusMessage: 'Voting is not configured' })

  const db = votesDb(event)
  const now = Date.now()

  // Two independent reads, so they overlap rather than queue: what this voter
  // already said about this subject, and how much they have been voting.
  //
  // Both are skipped outright for an id `resolveVoter` just minted, which is
  // most first votes: it cannot have a row on this subject and cannot have
  // spent an hourly budget, so the queries can only return what is assumed
  // below. Their cost is not incidental — the second one counts over this
  // voter's whole history (see `votes_by_voter_time` in schema.sql).
  const [previous, recent] = voter.issued
    ? [null, null]
    : await Promise.all([
        db.prepare('SELECT value FROM votes WHERE voter_id = ?1 AND subject = ?2')
          .bind(voter.id, subject).first<{ value: number }>(),
        db.prepare('SELECT COUNT(*) AS n FROM votes WHERE voter_id = ?1 AND updated_at > ?2')
          .bind(voter.id, now - RATE_WINDOW_MS).first<{ n: number }>()
      ])

  const before = asVoteValue(previous?.value) ?? 0

  // Only a *new* subject counts against the budget. Changing your mind about
  // something you already voted on, or taking a vote back, is never rate
  // limited — the limit exists to stop one voter sweeping the catalogue.
  if (before === 0 && value !== 0 && (recent?.n ?? 0) >= HOURLY_VOTE_LIMIT) {
    throw createError({ statusCode: 429, statusMessage: 'Too many votes just now — try again later' })
  }

  // Nothing to change. Returned before the write so a client that is merely out
  // of step can't create an all-zero totals row for a subject nobody has voted on.
  if (before === value) {
    const current = await db.prepare('SELECT up, down FROM totals WHERE subject = ?1')
      .bind(subject).first<{ up: number, down: number }>()
    return { subject, up: current?.up ?? 0, down: current?.down ?? 0, mine: value }
  }

  const write = value === 0
    ? db.prepare('DELETE FROM votes WHERE voter_id = ?1 AND subject = ?2').bind(voter.id, subject)
    : db.prepare(
        `INSERT INTO votes (voter_id, subject, value, updated_at) VALUES (?1, ?2, ?3, ?4)
         ON CONFLICT (voter_id, subject) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
      ).bind(voter.id, subject, value, now)

  // Totals are **recounted from the rows**, inside the same transaction as the
  // write, rather than moved by a delta computed from the read above.
  //
  // A delta is O(1) and wrong under concurrency: two requests for the same
  // subject can both read `before = 0` before either commits, both decide
  // "+1 up", and both apply it — leaving `totals` inflated against a `votes`
  // table the primary key correctly kept to one row. Batch atomicity protects
  // one request's write; it does nothing about a read taken outside it. A
  // double-click that beats the client guard, a retry, or a trivial script all
  // hit this.
  //
  // Recounting costs the rows for this subject instead of one, which is what
  // `votes_by_subject` exists for, and it is self-healing: any total that has
  // already drifted is corrected by the next vote on it. At this site's scale
  // (tens to hundreds of votes per subject) that is far cheaper than the
  // snapshot query it feeds.
  //
  // The `WHERE` is required, not incidental: SQLite cannot parse
  // `INSERT … SELECT … ON CONFLICT` without one to close the SELECT.
  const [, tallied] = await db.batch<{ up: number, down: number }>([
    write,
    db.prepare(
      `INSERT INTO totals (subject, up, down)
       SELECT ?1,
              COALESCE(SUM(CASE WHEN value = 1 THEN 1 ELSE 0 END), 0),
              COALESCE(SUM(CASE WHEN value = -1 THEN 1 ELSE 0 END), 0)
         FROM votes WHERE subject = ?1
       ON CONFLICT (subject) DO UPDATE SET up = excluded.up, down = excluded.down
       RETURNING up, down`
    ).bind(subject)
  ])

  const row = tallied?.results[0]
  return { subject, up: row?.up ?? 0, down: row?.down ?? 0, mine: value }
})
