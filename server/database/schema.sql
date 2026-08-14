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
-- There is deliberately no index on voter_id. `GET /api/me` and the rate-limit
-- count both filter on it alone, and that is the primary key's *leading* column
-- — the PK's own b-tree already answers them as a range scan, so a second index
-- would only add a row to write on every vote.
CREATE INDEX IF NOT EXISTS votes_by_subject ON votes (subject);
