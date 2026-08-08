---
name: run-come-home-love-lb
description: Build, run, and drive the 愛·回家之開心速遞 episode-navigator web app. Use when asked to start the dev server, run the app, take a screenshot of the UI, verify a filter/page change in the real browser, or build/preview the static output.
---

Static Nuxt 4 SPA (no backend — it fetches committed JSON from `app/data/`).
Drive it with `.claude/skills/run-come-home-love-lb/driver.mjs` — a
zero-dependency headless-Chrome REPL (CDP over Node's built-in WebSocket,
uses the system Google Chrome). Pipe commands to its stdin; screenshots land
in `.claude/skills/run-come-home-love-lb/screenshots/` (gitignored).

All paths are relative to the repo root.

## Prerequisites

- macOS with Google Chrome at `/Applications/Google Chrome.app` (override
  with `CHROME_BIN=<path>` for another Chromium).
- Node ≥ 22 (driver needs the built-in `WebSocket` global). `node` resolves
  via `~/.local/bin` shims, but **`pnpm` and `corepack` do not** — the pnpm
  shim points at a node version that doesn't have pnpm installed. Put the
  real node bin dir on PATH and go through corepack (the repo pins
  `pnpm@11.9.0` via `packageManager`):

```bash
export PATH="$(node -p 'require("path").dirname(process.execPath)'):$PATH"
corepack pnpm --version   # → 11.9.0
```

## Setup

```bash
corepack pnpm install
```

## Run (agent path)

Start the dev server in the background and poll the port (don't sleep —
first Vite compile can be slow):

```bash
lsof -ti:3000 -sTCP:LISTEN | xargs kill 2>/dev/null   # free the port first
corepack pnpm dev > /tmp/lb-dev.log 2>&1 &
timeout 60 bash -c 'until curl -sf http://localhost:3000 >/dev/null; do sleep 1; done'
```

Then drive it. This is the verified smoke flow — list loads, free-text
filter narrows and mirrors to the URL, episode jump navigates to a detail
page:

```bash
node .claude/skills/run-come-home-love-lb/driver.mjs <<'EOF'
nav http://localhost:3000/
wait-sel a[href^="/episode/"]
screenshot list-loaded
fill input[placeholder="搜尋劇集標題…"] 中秋
wait-for 中秋
url
screenshot filtered
fill input[placeholder="集數"] 2868
submit input[placeholder="集數"]
wait-for myTV SUPER
url
screenshot episode-2868
console-errors
EOF
```

Driver commands (one per line on stdin; `#` comments ignored; any failure
sets a non-zero exit code but the script keeps going):

| command | what it does |
|---|---|
| `nav <url>` | navigate, wait for load event |
| `wait-for <text>` / `wait-sel <sel>` | poll 10 s for body text / a selector |
| `click <sel>` / `fill <sel> <value>` | click / set value + fire `input`+`change` (v-model-safe) |
| `submit <sel>` | `requestSubmit()` the element's enclosing form |
| `press <sel> <key>` | synthetic keydown (does **not** submit forms — use `submit`) |
| `text <sel>` / `count <sel>` / `eval <js>` / `url` | inspect the page |
| `screenshot [name]` | PNG → `.claude/skills/run-come-home-love-lb/screenshots/<name>.png` |
| `console-errors` | page console errors + uncaught exceptions so far |
| `quit` | close Chrome and exit |

**Filter state is URL-addressable** (`useEpisodeFilter` mirrors filters to
the query string), so most filter combinations can be driven by navigation
alone — no clicking needed. Verified example (11 中秋節 episodes):

```bash
node .claude/skills/run-come-home-love-lb/driver.mjs <<'EOF'
nav http://localhost:3000/?tags=festival-%E4%B8%AD%E7%A7%8B%E7%AF%80
wait-sel a[href^="/episode/"]
count a[href^="/episode/"]
screenshot tag-filtered
console-errors
EOF
```

Query params: `q`, `characters`, `plotlines`, `groups`, `tags`, `writers`,
`yearFrom`, `yearTo` (CSV for lists; ids as in `app/data/*.json`, e.g.
`festival-中秋節`). Detail routes: `/episode/<no>`, `/character/<id>`,
`/plotline/<id>`.

Stop the server by killing the port's listener (the `&` PID is only the
pnpm wrapper):

```bash
lsof -ti:3000 -sTCP:LISTEN | xargs kill 2>/dev/null
```

## Build / preview (static output)

```bash
corepack pnpm build      # → .output/public (Nitro github_pages preset)
corepack pnpm preview    # serves the built output on :3000 — same driver flows work
```

## Test

No test runner. The repo's checks are:

```bash
corepack pnpm lint
corepack pnpm typecheck
```

Both must pass before committing (CI runs lint + typecheck + build).
`scripts/**`, `app/data/**` and `.claude/**` are ESLint-ignored.

## Gotchas

- **The dataset loads lazily in two tiers** — the page shell (header, jump
  box, 「載入劇集資料中…」) renders before any episodes exist. `wait-for 集`
  succeeds on the *header* and you screenshot a spinner. Always
  `wait-sel a[href^="/episode/"]` to know the episode list is really there.
- **After an SPA navigation, wait on text unique to the destination page.**
  `wait-for 編劇` after the episode jump matches the *filter panel's* 編劇
  label on the list page you're still on, and `url` then reports the old
  route. `myTV SUPER` only appears on episode detail pages — wait on that.
- **Synthetic Enter doesn't submit forms.** The episode-jump box is a
  `<form @submit.prevent>`; `press … Enter` fires the keydown but native
  form submission doesn't happen for synthetic events. Use
  `submit input[placeholder="集數"]`.
- **Stable selectors are the CJK placeholders** (`集數`,
  `搜尋劇集標題…`) — there are no test ids. Keep the exact full-width
  ellipsis `…` in the search placeholder.
- **`pnpm` on PATH is a broken shim** (`no such file or directory:
  …/v24.15.0/bin/pnpm`). Always go through `corepack pnpm` with the PATH
  line from Prerequisites; plain `corepack` isn't on PATH either without it.

## Troubleshooting

- **`command not found: corepack`** — the PATH export from Prerequisites
  wasn't run in this shell. Shell state doesn't persist between tool calls;
  re-export it in every shell that needs pnpm.
- **Screenshot shows 「載入劇集資料中…」** — you waited on text that exists
  pre-hydration. Use `wait-sel a[href^="/episode/"]` (see Gotchas).
- **`EADDRINUSE` / port 3000 busy** — a previous dev or preview server is
  still up: `lsof -ti:3000 -sTCP:LISTEN | xargs kill`.
