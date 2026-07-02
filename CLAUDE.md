# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A static, backend-free SPA cataloguing every episode of the TVB sitcom 《愛·回家之開心速遞》(2,800+ episodes), letting users filter which episodes to rewatch by character, story line / CP, festival, cameo, milestone, location, family/organisation, writer, year, or free text. Nuxt 4 + Nuxt UI 4 + Tailwind 4, deployed to GitHub Pages.

## Commands

```bash
pnpm install
pnpm dev          # dev server at http://localhost:3000
pnpm build        # static output → .output/public (Nitro github_pages preset)
pnpm preview      # serve the built output
pnpm lint         # eslint . (scripts/** and app/data/** are ignored)
pnpm typecheck    # nuxt typecheck (vue-tsc)
```

CI (`.github/workflows/ci.yml`) runs lint + typecheck + build on every push; run all three locally before committing. `.github/workflows/deploy.yml` builds and publishes to GitHub Pages **on push to `master`** (not `main`).

### Refreshing the dataset

The app reads pre-built JSON; regenerate it only when the wiki sources change (e.g. new episodes air). These are plain Node scripts (no test runner in this repo):

```bash
node scripts/fetch-sources.mjs   # download raw wikitext → scripts/.cache/ (gitignored)
node scripts/build-data.mjs      # parse + cross-link + apply overlay → app/data/*.json
```

`build-data.mjs` prints a validation report (episode count, number gaps, duplicate numbers, tag coverage). Duplicate/mislabelled episode numbers are source typos — fix them via `data/overlay.json → episodeFixes`, not by editing generated JSON. Commit the regenerated `app/data/*.json`.

## Architecture

Two independent halves. Know which one you're editing.

**1. Offline ETL (`scripts/`, plain `.mjs`, ESLint-ignored, not in the app bundle)**
- `fetch-sources.mjs` — pulls `action=raw` wikitext from 維基學院 (Wikiversity: episode list + 故事系列 plot-line index + 角色列表 character roster) and 維基百科 (Wikipedia: cast notes + the 波比與群姐 cameo arc). Raw wikitext is parsed instead of HTML because it's far more stable.
- `lib/wikitext.mjs` — the wikitext primitives (`cleanText`, `splitTableRows`, `splitRowCells`, `parseCellAttrs`, `parseUbl`, `extractEpisodeRefs`, `trimEdgePunct`). Table parsing must handle `rowspan` carry-over across rows.
- `build-data.mjs` — parses episodes / plotlines / characters, then **cross-links** them and emits `app/data/*.json`. Cross-linking is the core logic: each episode collects `characterIds`/`groupIds`/`plotlineIds`/`tagIds` from three sources — (1) the per-episode 故事主人翁 column, (2) plot-line membership (episode-number ranges only — deliberately *not* each plot line's full roster, which would over-tag), and (3) 第N集 references mined from character bios. Names resolve to character IDs via a first-occurrence `nameToId` map plus `overlay.aliases`; unresolved group-like tokens (matching `GROUP_LIKE`) become groups. Tags are built from festival keyword scans over titles plus the curated cameo/milestone/location entries in the overlay.

**2. Nuxt app (`app/`)** — reads the committed JSON, filters client-side. No runtime network calls.
- `composables/useDataset.ts` — **tiered loading**. `CoreDataset` (episodes + tags + meta + their facets) loads first so the list renders quickly; `Dataset` extends it with characters/plotlines/groups + their facets for the facet panel, presets, and detail pages. Both are cached in module-level promises (`loadCore`/`loadDataset`), consumed via `useCoreDatasetAsync`/`useDatasetAsync` (`composables/useDatasetAsync.ts`, `{ lazy: true, server: false }`).
- `composables/useEpisodeFilter.ts` — the filter engine. **Facets combine with AND across types, OR within a type.** Filter state is app-wide shared `useState` and is **mirrored to the URL query** (so filtered views are shareable); it hydrates from the query once on load. Free-text `q` matches episode title + protagonist tokens.
- `types/index.ts` — the single source of truth for the data-model shapes the JSON conforms to (`Episode`, `Character`, `Plotline`, `Tag`, `Group`, `Meta`) plus display constants (`CATEGORY_LABEL`, `TAG_COLOR`).
- `pages/` — `index.vue` (list + filter panel) and dynamic detail routes `episode/[no]`, `character/[id]`, `plotline/[id]`.

### The curated overlay (`data/overlay.json`)

The **only** hand-maintained data file; everything else in `app/data/` is generated. Add entries here when a tag can't be derived automatically:
- `episodeFixes` — correct mislabelled/duplicate episode numbers from the source.
- `aliases` — nickname → canonical character name, used during cross-linking to resolve tokens.
- `nicknames` — canonical name → searchable nickname list (surfaced as facet search aliases).
- `cameos` — named guest arcs (label + actor + episodes).
- `milestones` — named events linked to a parent plot line.
- `locations` — recurring fictional settings, matched to characters whose bio names them.
- `featured` — curated preset filters.

Character search aliases are assembled in `build-data.mjs` (`attachAliases`) from `nicknames`, reversed `aliases`, the 諧音 homophone pun, and an English name auto-extracted from the start of many bios.

## Conventions

- Package manager is **pnpm** (`packageManager` pinned). Node 22 in CI.
- ESLint uses Nuxt's flat config with stylistic rules: **no comma dangle**, 1tbs brace style. Match the terse, comment-rich style of the existing scripts.
- GitHub Pages serves under `/<repo>/`; the deploy workflow sets `NUXT_APP_BASE_URL` to the Pages base path (with trailing slash). Locally it defaults to `/`.
- This is a non-official fan project; episode/character data is sourced from the wikis and © their rights holders.
