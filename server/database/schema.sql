-- Votes on episodes and facets. Applied by hand, not by a migration runner:
--   pnpm exec wrangler d1 execute come-home-love-lb-votes --file server/database/schema.sql
-- with --local for the dev copy under .wrangler/, --remote for production.

-- One row per (voter, subject). The primary key IS the dedup rule: a repeat
-- vote is an UPDATE (switching up<->down) or a DELETE (undoing), never a second
-- INSERT, so no amount of retrying or double-clicking can inflate a score.
-- WITHOUT ROWID because the table is nothing but its key.
CREATE TABLE IF NOT EXISTS votes (
  voter_id   TEXT    NOT NULL,
  subject    TEXT    NOT NULL,
  value      INTEGER NOT NULL CHECK (value IN (-1, 1)),
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (voter_id, subject)
) WITHOUT ROWID;

-- Running totals, maintained by the same batch that writes the vote.
--
-- Denormalised because D1 bills *rows read*. Deriving the snapshot with
-- SUM(...) GROUP BY subject would scan every vote row on each cache miss, so
-- the cost of serving scores would grow with the number of votes ever cast.
-- Read from here it is one row per subject that has any vote at all, and it
-- stops growing once every subject has been voted on at least once.
CREATE TABLE IF NOT EXISTS totals (
  subject TEXT    PRIMARY KEY,
  up      INTEGER NOT NULL DEFAULT 0,
  down    INTEGER NOT NULL DEFAULT 0
) WITHOUT ROWID;

-- `vote.post.ts` recounts a subject's totals from its rows on every vote, which
-- without this is a full table scan: the primary key is ordered by voter_id
-- first, so it cannot answer `WHERE subject = ?`.
--
-- `value` is in the index, not just `subject`, and that halves the recount's
-- bill. The table is WITHOUT ROWID, so an index entry is the indexed columns
-- plus the PK — `(subject, value, voter_id)`. Indexed on `subject` alone it
-- would carry no `value`, and the recount's SUM(CASE WHEN value = 1 ...) would
-- have to seek back into the PK b-tree once per matching row. D1 bills both
-- accesses as rows read, so a subject with 200 votes cost ~400 rows per vote
-- instead of ~200. With `value` present the aggregate is answered from the
-- index alone.
--
-- Dropped first so this file stays idempotent *and* self-migrating: it is
-- applied by hand, and CREATE INDEX IF NOT EXISTS would silently keep an older
-- definition of the same name on a database that already has one.
DROP INDEX IF EXISTS votes_by_subject;
CREATE INDEX votes_by_subject ON votes (subject, value);

-- The hourly rate-limit count in `vote.post.ts`:
--   SELECT COUNT(*) FROM votes WHERE voter_id = ?1 AND updated_at > ?2
--
-- voter_id alone would indeed be redundant — it is the primary key's *leading*
-- column, so the PK's own b-tree answers `WHERE voter_id = ?` as a range scan,
-- which is why `GET /api/me` needs nothing here. But `updated_at` is not a
-- seekable prefix of that key, so without this index the count range-scans
-- every row the voter has *ever* written and filters them in memory: somebody
-- who has voted on 2,000 subjects paid 2,000 rows read on every subsequent
-- vote, forever, to answer a question about the last hour. Equality on
-- voter_id plus a range on updated_at makes it a bounded, covering scan.
--
-- The cost is one more index row written per vote, against a 100k/day
-- row-write allowance that a vote otherwise spends ~2 of.
CREATE INDEX IF NOT EXISTS votes_by_voter_time ON votes (voter_id, updated_at);
