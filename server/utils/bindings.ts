import type { H3Event } from 'h3'

/**
 * The Cloudflare surface this app touches, declared rather than imported.
 *
 * Both `wrangler types` and `@cloudflare/workers-types` publish these — as
 * **ambient globals**, which is what makes them unusable here:
 *
 * - Nitro generates route types so `$fetch('/api/scores')` is typed from the
 *   handler, which pulls every `server/` file into the *app* TypeScript project
 *   as well. Workerd globals would have to be visible there too — meaning the
 *   browser build would be typed against workerd's `Response`, `fetch` and
 *   friends instead of the DOM's.
 * - They declare `CacheStorage` as an abstract *class*, which cannot merge with
 *   `lib.webworker`'s `interface CacheStorage`. `caches.default` therefore fails
 *   to typecheck whichever package supplies it.
 *
 * So this names the handful of members actually in use. It is a smaller
 * commitment than it looks: D1's query surface is stable and this is exactly
 * the part of it the app depends on, spelled out in one place where a change in
 * that dependency shows up as a type error rather than a runtime surprise.
 */
export interface D1Statement {
  bind(...values: unknown[]): D1Statement
  first<T>(): Promise<T | null>
  all<T>(): Promise<{ results: T[] }>
}

export interface D1Database {
  prepare(query: string): D1Statement
  /** Runs as a single transaction — see the batched write in `vote.post.ts`. */
  batch<T>(statements: D1Statement[]): Promise<{ results: T[] }[]>
}

/** Cloudflare's shared per-colo cache, which is not the `CacheStorage` in lib.dom. */
export interface EdgeCache {
  match(request: Request): Promise<Response | undefined>
  put(request: Request, response: Response): Promise<void>
}

interface WorkerBindings {
  DB?: D1Database
}

/**
 * The D1 binding, or a 503.
 *
 * Absent means the Worker is running without its database — `nuxt dev`, which
 * has no Cloudflare bindings at all, or a deploy made before
 * `wrangler d1 create`. The app treats any vote failure as "voting is
 * unavailable" and carries on filtering, so a clear status beats a crash.
 */
export function votesDb(event: H3Event): D1Database {
  const db = (event.context.cloudflare?.env as WorkerBindings | undefined)?.DB
  if (!db) throw createError({ statusCode: 503, statusMessage: 'Vote storage is unavailable' })
  return db
}

/**
 * `caches.default`, reached through a cast for the class-vs-interface reason
 * above. Undefined outside a Worker, so callers fall back to no caching rather
 * than failing.
 */
export function edgeCache(): EdgeCache | undefined {
  return (globalThis as { caches?: { default?: EdgeCache } }).caches?.default
}
