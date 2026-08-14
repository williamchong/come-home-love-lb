// Runs `wrangler dev` — the only way to exercise anything under `server/` —
// against a *route-free* copy of the build output.
//
// `wrangler dev` cannot start against `.output/public` itself. Its assets
// watcher opens a descriptor per directory, and the prerender emits one
// directory per route: 4,401 of them. chokidar throws EMFILE, wrangler logs
// "Assets directory watcher hit a platform limit and has been disabled" — and
// then never spawns workerd, so the port is never bound. Confirmed on wrangler
// 4.122.0 and 4.123.0, and with a stub Worker, so it is the asset tree and not
// the Nitro bundle. Raising `ulimit -n` does not help.
//
// The fix is to hand wrangler only the assets that are *not* prerendered pages.
// Every route tree is a plain top-level directory (`episode/`, `character/`,
// …); everything Nuxt and Nitro emit for the client is `_`-prefixed (`_nuxt/`,
// `_fonts/`, `_scripts/`, `__sitemap__/`). Copying the files plus the
// `_`-prefixed directories leaves 8 directories, which the watcher handles, and
// it is self-maintaining — a new route kind is skipped without touching this.
//
// What you get: `/_nuxt/*` and the fonts are served from the assets store as in
// production, so the client bundle loads and the page hydrates; every page
// route misses the store and falls through to the Worker, which renders it with
// Nuxt SSR. That is closer to source than the prerendered copy, and `server/`
// is live throughout.

import { cpSync, existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { join } from 'node:path'

const SOURCE = '.output/public'
const DEST = '.wrangler/dev-assets'

if (!existsSync(SOURCE)) {
  console.error(`${SOURCE} does not exist — run \`pnpm build\` first.`)
  process.exit(1)
}

rmSync(DEST, { recursive: true, force: true })
mkdirSync(DEST, { recursive: true })

let copied = 0
for (const entry of readdirSync(SOURCE, { withFileTypes: true })) {
  // Prerendered routes are the directories that are not `_`-prefixed.
  if (entry.isDirectory() && !entry.name.startsWith('_')) continue
  cpSync(join(SOURCE, entry.name), join(DEST, entry.name), { recursive: true })
  copied++
}

console.log(`${DEST}: ${copied} entries copied, page routes left to the Worker.`)

spawn('wrangler', ['dev', '--assets', DEST, ...process.argv.slice(2)], {
  stdio: 'inherit',
  shell: true
}).on('exit', code => process.exit(code ?? 0))
