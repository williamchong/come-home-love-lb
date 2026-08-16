import type { H3Event } from 'h3'
import type { ScoreMap, ScoresResponse } from '#shared/types/votes'

/**
 * `max-age` is for the browser, `s-maxage` for Cloudflare's cache, and
 * `stale-while-revalidate` keeps a lapsed copy serving while one request
 * refreshes it — so a cold minute never puts every visitor onto D1 at once.
 */
const CACHE_CONTROL = 'public, max-age=60, s-maxage=300, stale-while-revalidate=900'

/**
 * How long a cached snapshot is served for, checked here rather than left to
 * the cache.
 *
 * `Cache-Control` above is for the browser and the CDN. The Cache API is a
 * different thing: `match()` hands back whatever was stored, and under
 * `wrangler dev` an entry with `s-maxage=60` was still being returned long
 * after that — so a snapshot written once would have been served forever, and
 * every vote would look like it did nothing to everyone but the voter. Rather
 * than depend on how a given runtime reads those headers, the response carries
 * the moment it was built and this compares against it.
 */
const SNAPSHOT_TTL_MS = 300_000
const BUILT_AT_HEADER = 'x-built-at'

/**
 * The rebuild currently running in this isolate, if any.
 *
 * Module scope is per-isolate — the same scope `signingKey` uses in
 * `server/utils/voter.ts` — and that is exactly the scope the problem has. The
 * cache write below is deferred to `waitUntil`, so it lands *after* the
 * response; without this, every request arriving between the TTL lapsing and
 * that write completing ran its own full scan of `totals`. The cost model above
 * counts one rebuild per TTL per colo, which made it a floor rather than a
 * ceiling: forty visitors landing together at rollover meant forty scans.
 *
 * It bounds concurrent scans within an isolate, not across a colo — two
 * isolates can still rebuild at once. That is a much smaller multiple than the
 * one it removes, and pinning it further would mean moving the snapshot out of
 * D1 entirely (the KV escape hatch described above).
 */
let rebuilding: Promise<Snapshot> | undefined

/** The serialised body plus the moment it was built, which rides in a header. */
interface Snapshot {
  body: string
  generatedAt: number
}

/**
 * Built once and turned into a `Response` per consumer, rather than one
 * `Response` cloned: a body can only be read once, and handing the same object
 * to several awaiting requests plus the cache write is precisely how that gets
 * violated. A string has no such problem.
 */
function snapshotResponse(snapshot: Snapshot) {
  return new Response(snapshot.body, {
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': CACHE_CONTROL,
      [BUILT_AT_HEADER]: String(snapshot.generatedAt)
    }
  })
}

/**
 * The scan itself. Safe to share across requests despite capturing one
 * request's `event`: it is used only to reach the D1 binding, which is the
 * isolate's rather than the request's, and the request that starts a rebuild
 * always awaits it — so its context outlives the I/O it began.
 */
async function buildSnapshot(event: H3Event): Promise<Snapshot> {
  const db = votesDb(event)
  // Subjects that have been voted on and back to zero keep a row; skipping them
  // keeps the snapshot to what actually has a score to show.
  const { results } = await db
    .prepare('SELECT subject, up, down FROM totals WHERE up > 0 OR down > 0')
    .all<{ subject: string, up: number, down: number }>()

  const scores: ScoreMap = {}
  for (const row of results) scores[row.subject] = [row.up, row.down]

  const generatedAt = Date.now()
  const body: ScoresResponse = {
    version: 1,
    generatedAt,
    scores,
    // Cached along with the scores, so enabling voting takes up to one TTL to
    // reach everyone. Acceptable: it changes once, at setup.
    votingEnabled: Boolean(useRuntimeConfig(event).voteSecret)
  }
  return { body: JSON.stringify(body), generatedAt }
}

/**
 * Every subject's running totals, in one snapshot.
 *
 * One document rather than a lookup per card because the list sorts by score:
 * ordering 2,868 episodes needs all of them at once, and 4,387 subjects come to
 * ~65 KB — around 15 KB gzipped, since the keys are a run of shared prefixes.
 *
 * **The cache is load-bearing, not an optimisation, and the TTL is sized from
 * the bill.** D1 charges rows read against 5M a day. Uncached, every visitor
 * costs one row per voted subject. Cached, the cost is one rebuild per TTL *per
 * colo that sees traffic* — it scales with geography, not with traffic, which
 * is what makes it survivable, but it is not free:
 *
 *   1 colo × (86,400 s ÷ TTL) rebuilds × (rows in `totals`)
 *
 * At a 60 s TTL and every one of the 4,387 subjects voted on, that is 6.3M rows
 * a day from a *single* busy colo — over budget on its own. At 300 s it is
 * 1.26M, which leaves room for several colos even fully saturated. `totals`
 * only grows as subjects get their first vote, so the real figure starts far
 * below that, but the ceiling is what the TTL has to be chosen against.
 *
 * The escape hatch, if several busy regions ever coincide with a saturated
 * table: rebuild into Workers KV on a cron and serve from there, which pins the
 * D1 cost to a schedule instead of to the number of colos.
 *
 * A `Response` is returned rather than an object because it has to be cached
 * verbatim, and read back verbatim — built here from `buildSnapshot`'s string
 * rather than cloned, so the cache write and every coalesced reader each get a
 * body of their own. Nothing here touches the voter cookie: a `Set-Cookie` on a
 * shared cached body would hand one visitor's identity to everyone who came
 * after them.
 */
export default defineEventHandler(async (event) => {
  const cf = event.context.cloudflare
  const cache = edgeCache()
  const cacheKey = cf?.request

  let stale: Response | undefined
  if (cache && cacheKey) {
    const hit = await cache.match(cacheKey)
    // Read from a header, not the body: parsing up to 65 KB of JSON just to
    // find out it is still fresh would cost more than the query it saves.
    const builtAt = Number(hit?.headers.get(BUILT_AT_HEADER))
    if (hit && builtAt && Date.now() - builtAt < SNAPSHOT_TTL_MS) return hit
    stale = hit
  }

  // A lapsed copy in hand and a rebuild already running: serve the lapsed copy
  // rather than queue behind the scan. This is what `stale-while-revalidate` in
  // the header was meant to buy and cannot, since the freshness decision above
  // is deliberately taken here instead of by the runtime. Five minutes plus a
  // few hundred ms is not a different answer to a visitor; a slower response is.
  if (stale && rebuilding) return stale

  // Whoever creates the rebuild owns writing it back, so N coalesced readers
  // don't queue N identical `cache.put`s behind one query.
  const owner = !rebuilding
  const snapshot = await (rebuilding ??= buildSnapshot(event)
    .finally(() => { rebuilding = undefined }))

  // `waitUntil` so the write doesn't delay the response it is copying.
  if (owner && cache && cacheKey && cf) cf.context.waitUntil(cache.put(cacheKey, snapshotResponse(snapshot)))
  return snapshotResponse(snapshot)
})
