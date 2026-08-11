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
- Viewport defaults to 1280×900; set `WINDOW_SIZE=390,844` (or any `w,h`) to
  drive the mobile layout — the sticky filter bar, the `UDrawer` bottom sheet
  and the `lg:` breakpoint only appear at the size you launch with.
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

Then drive it. This is the verified smoke flow — list loads, the omnibox's
free-text row narrows the list and mirrors to the URL, and a bare episode
number navigates to a detail page. Everything searchable goes through the one
palette: the page has a single text field, and the filter panel offers a
button that opens the same one:

```bash
node .claude/skills/run-come-home-love-lb/driver.mjs <<'EOF'
nav http://localhost:3000/
wait-for 年份
screenshot list-loaded
click button[aria-label="搜尋"]
wait-sel input[placeholder^="搜尋角色"]
fill input[placeholder^="搜尋角色"] 中秋
wait-for 搜尋標題
eval [...document.querySelectorAll('[role=option]')].find(e=>e.innerText.includes('搜尋標題')).click()
wait-for 篩選結果
url
screenshot filtered
click button[aria-label="搜尋"]
fill input[placeholder^="搜尋角色"] 2868
wait-for 第 2868 集
eval [...document.querySelectorAll('[role=option]')].find(e=>e.innerText.includes('第 2868 集')).click()
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

- **The dataset loads lazily in two tiers, behind a prerendered seed.** The
  first paint already has 48 real episode cards (the seed), so
  `wait-sel a[href^="/episode/"]` and `wait-for 集` both succeed while the
  page is still a static list with no sidebar and nothing filterable. Wait on
  something only the *full* tier renders: `wait-for 年份` (the filter panel's
  year row) on desktop. On mobile that row lives inside the drawer, so wait
  on the sticky bar's 篩選 button instead and open the drawer.
- **After an SPA navigation, wait on text unique to the destination page.**
  `wait-for 編劇` after the episode jump matches the *filter panel's* 編劇
  label on the list page you're still on, and `url` then reports the old
  route. `myTV SUPER` only appears on episode detail pages — wait on that.
- **Synthetic Enter doesn't reach the palette's rows.** `press … Enter` on
  the palette input fires a keydown the component doesn't act on. Click the
  row instead — `[role=option]` elements, matched by their text (see the
  smoke flow). `submit` is still there for any real `<form @submit.prevent>`.
- **Stable selectors are the aria-labels and CJK placeholders** —
  `button[aria-label="搜尋"]` opens the palette, its input matches
  `input[placeholder^="搜尋角色"]` (prefix-match it: the full placeholder
  ends in a full-width `…` and lists every searchable kind), and a chip's
  remove button is `button[aria-label^="移除篩選"]`. There are no test ids.
- **`pnpm` on PATH is a broken shim** (`no such file or directory:
  …/v24.15.0/bin/pnpm`). Always go through `corepack pnpm` with the PATH
  line from Prerequisites; plain `corepack` isn't on PATH either without it.
- **`FilterPanel` is mounted twice** — desktop sidebar *and* mobile drawer —
  so a bare `document.querySelectorAll('button')` hits the hidden instance
  first and returns a 0×0 rect. On mobile, scope every filter-panel query to
  the drawer: `document.querySelector('[role=dialog]').querySelectorAll(…)`.
  Clicking the hidden copy opens a popover anchored at (0,0), which reads as
  a positioning bug that isn't there.

## Troubleshooting

- **`command not found: corepack`** — the PATH export from Prerequisites
  wasn't run in this shell. Shell state doesn't persist between tool calls;
  re-export it in every shell that needs pnpm.
- **Screenshot shows 「載入劇集資料中…」** — you waited on text that exists
  pre-hydration. Use `wait-sel a[href^="/episode/"]` (see Gotchas).
- **`EADDRINUSE` / port 3000 busy** — a previous dev or preview server is
  still up: `lsof -ti:3000 -sTCP:LISTEN | xargs kill`.
