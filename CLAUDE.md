# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A static, backend-free SPA cataloguing every episode of the TVB sitcom 《愛·回家之開心速遞》(2,800+ episodes), letting users filter which episodes to rewatch by character, story line / CP, festival, cameo, milestone, family/organisation, writer, year, or free text. Nuxt 4 + Nuxt UI 4 + Tailwind 4, deployed to GitHub Pages.

## Commands

```bash
pnpm install
pnpm dev          # dev server at http://localhost:3000
pnpm build        # static output → .output/public (Nitro github_pages preset); prerenders ~4,300 routes, several minutes
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
- `lib/wikitext.mjs` — the wikitext primitives (`cleanText`, `splitTableRows`, `splitRowCells`, `isHeaderRow`, `parseRowGrid`, `parseCellAttrs`, `parseUbl`, `extractEpisodeRefs`, `trimEdgePunct`). Table parsing must handle `rowspan` carry-over across rows: `parseRowGrid` does this generically (any column, plus `colspan`) and is how the character table is read — feed it data rows only, since header rows corrupt the span bookkeeping. `parseEpisodes` still carries spans inline because its tables interleave year headers.
- `build-data.mjs` — parses episodes / plotlines / characters, then **cross-links** them and emits `app/data/*.json`. Cross-linking is the core logic: each episode collects `characterIds`/`groupIds`/`plotlineIds`/`tagIds` from three sources — (1) the per-episode 故事主人翁 column, (2) plot-line membership (episode-number ranges only — deliberately *not* each plot line's full roster, which would over-tag), and (3) 第N集 references mined from character bios. Names resolve to character IDs via a first-occurrence `nameToId` map plus `overlay.aliases`; unresolved group-like tokens (matching `GROUP_LIKE`) become groups. Tags are built from festival keyword scans over titles plus the curated cameo/milestone entries in the overlay. There is deliberately **no 地點 tag kind**; the `buildTags` note explains why, and why plot lines cover those arcs better.

**2. Nuxt app (`app/`)** — reads the committed JSON, filters client-side. No runtime network calls.
- `composables/useDataset.ts` — **tiered loading**. `CoreDataset` (episodes + tags + meta + their facets) loads first so the list renders quickly; `Dataset` extends it with characters/plotlines/groups + their facets for the facet panel and detail pages. Both are cached in module-level promises (`loadCore`/`loadDataset`), consumed via `useCoreDatasetAsync`/`useDatasetAsync` (`composables/useDatasetAsync.ts`, `{ lazy: true, server: false }`).
- `composables/useEpisodeFilter.ts` — the filter engine. **Facets combine with AND across types, OR within a type.** Filter state is app-wide shared `useState` and is **mirrored to the URL query** (so filtered views are shareable); it hydrates from the query once on load. Free-text `q` matches episode title + protagonist tokens. The result page (`p`) lives in the same state so links keep their place; it resets on a filter change (keyed on the mirrored query, *not* on the result list, which also changes when the dataset finishes loading). Default sort is newest first (`DEFAULT_SORT`), and the default is the value omitted from the URL.
- `composables/useFacetIndex.ts` — flattens **every** facet type (角色 / 故事線 / 節日 / 客串 / 里程碑 / 家庭・機構 / 編劇) into one grouped, count-sorted index, so there is one vocabulary rather than a dropdown per type. Nothing is capped or filtered here: the panel's browse block takes the head of each section, the omnibox searches all of it, and `byToken` resolves a chip's label even for an option neither is showing. Each option is modelled as a `key:value` token; `useFacetTokens` is a writable computed that projects the five separate `FilterState` arrays into one flat token list and back, which is why `useEpisodeFilter` and the URL query format are untouched by the merged UI.
- `composables/useOmnibox.ts` + `components/SearchOmnibox.vue` — **the one search surface**, and the reason the depth is findable at all. 191 plot lines and ~440 facet options can't be represented by the 8 精選 cards or by a menu preview, and the previous 新增篩選 combobox hid the whole vocabulary behind a click and a listbox ~8 rows tall — 安凌線 (67 集) ranks 16th of 191, so nothing but typing ever reached it. The page therefore carries an always-visible field that opens a `UCommandPalette` (⌘K) answering facets, episode titles, and a bare episode number (which is what the old 跳至集數 form was) from one box; the panel's 新增篩選 and the mobile drawer open the same palette, and the drawer closes behind it rather than stacking two overlays on a phone. Groups are `ignoreFilter`, i.e. matching happens in `rank()` here and not in the component's Fuse index — that is what keeps ordering count-then-relevance and keeps an option's token, hue and icon identical to the panel's. Selecting a facet **adds** to the filter, exactly as the panel's chips do.
- `composables/useDetailView.ts` — **lean per-page projections**, and the reason prerendering is affordable. Nuxt serialises every `useAsyncData` result into that route's payload, so handing a detail page the whole `Dataset` would park ~1.8 MB beside each of 4,300 static pages. Each builder returns only the records the page renders (`CharacterRef`/`PlotlineRef`/`EpisodeCardData` rather than full entities), which lands an episode payload at ~1.26 KB and the whole site's payloads at 6.6 MB (a plot line's `tone` is ~6% of that — it is carried because a lean payload has no roster to re-derive it from). `buildArcs` is the same trade made again: an episode page could step through its story lines only if it had their episode lists, which would cost ~7.3 KB a page (19.5 MB site-wide), so each line is resolved down to *just* this episode's neighbours in it — 776 KB site-wide (12% of the budget, 136 B gzipped a page), and prerenderable. Unlike the tiers above these run on the server too (`lazy` on the client only), so prerendered HTML carries real content while client-side navigation still paints a loading state instead of blocking on the dataset. `useHomeSeedAsync` does the same for the index page's newest 48 cards, plus the resolved 精選 row. Anything rendered *before* `core` arrives must look the same on the server and the client — the prerendered HTML is always unfiltered while the client has read the arrival query by first render, so gating that markup on `activeCount` mismatches on a shared `/?plots=…` link.
- `composables/usePlaylist.ts` — **what prev/next follows on an episode page**. The default is ±1 by number, which is all a prerendered page can promise; but only 7% of story-line-adjacent episodes are also numerically adjacent, so a visitor following an arc needs something else. Entry points (a plot line's 劇集順序, a character's 焦點劇集, a list filtered to exactly one facet) hand their list along as `?list=<key>:<value>` — the same `facetToken` vocabulary the omnibox and the panel use, so every facet is also a playlist. Resolution is **client-only by construction** (`useAsyncData({ server: false })`): a prerendered page is one file for every query string, so its HTML can only show the sequential default and the list takes over a tick later. Plot-line lists are answered straight out of the page's own `arcs` without touching the dataset; the other kinds await the full tier. Canonical URLs drop the query, so this adds no indexable variants — verify that still holds before adding query params anywhere else.
- `types/index.ts` — the single source of truth for the data-model shapes the JSON conforms to (`Episode`, `Character`, `Plotline`, `Tag`, `Group`, `Meta`) plus display constants (`CATEGORY_LABEL`, `TAG_KIND_LABEL`, `FACET_COLOR`).
- `pages/` — `index.vue` (omnibox + 精選 + list + filter panel) and dynamic detail routes `episode/[no]`, `character/[id]`, `plotline/[id]`. `FilterPanel` is mounted twice — a desktop sidebar and a mobile `UDrawer` — both bound to the same shared state; sorting lives in `SortSelect` next to the results rather than in the panel.

### SEO (`@nuxtjs/seo`)

GitHub Pages serves an unknown path as `404.html` **with an HTTP 404 status**, so anything not prerendered is invisible to crawlers. `siteRoutes()` in `nuxt.config.ts` therefore enumerates every episode / character / plot line straight out of `app/data/` — Nitro's `crawlLinks` can't find them, because a crawl starting at `/` only sees a loading shell.

Things worth knowing before changing any of it:
- **`site.url` is the origin only** (`https://comehomelovelb.williamchong.cloud`). nuxt-site-config joins it with `app.baseURL`; spelling a path in both doubles it. CI passes it via `NUXT_SITE_URL`.
- **Prerender routes live under `$production`.** At the top level their 4,300 entries get inlined into Nuxt's virtual route-rules module and Rollup blows its parser stack on every `pnpm dev`.
- **Sitemap URLs are passed decoded**, because `@nuxtjs/sitemap` escapes each `<loc>` itself; handing it encoded paths yields `%25E4%25B8%2581…`.
- **`app/utils/indexable.ts` is shared on purpose.** nuxt.config uses it to pick which characters the sitemap advertises; `character/[id].vue` uses the same predicate for `useRobotsRule()`. ~616 roster footnotes are served but `noindex, follow`, so a page the sitemap promotes can never be one that refuses indexing. Pass `useRobotsRule` a directive **string**: its object form drops false-valued keys, so `{ index: false }` silently emits nothing rather than `noindex`.
- **`app/utils/tags.ts` imports the tag set statically** rather than routing it through each view. `tagTones` spaces hues across all 17 tags, so every page showing one badge needs them all — carried in payloads that cost ~16 MB across the site and set a 4 KB floor under every page.
- `nuxt-og-image` and `nuxt-link-checker` are **off**: per-route OG images would mean 4,300 satori renders with a font that has no CJK glyphs, and link-checking every prerendered page adds minutes to CI.

### The curated overlay (`data/overlay.json`)

The **only** hand-maintained data file; everything else in `app/data/` is generated. Add entries here when a tag can't be derived automatically:
- `episodeFixes` — correct mislabelled/duplicate episode numbers from the source.
- `aliases` — nickname → canonical character name, used during cross-linking to resolve tokens.
- `nicknames` — canonical name → searchable nickname list (surfaced as facet search aliases).
- `cameos` — named guest arcs (label + actor + episodes).
- `milestones` — named events linked to a parent plot line.
- `featured` — the home page's 精選 row, in display order: `{ kind: plotline|character|tag, ref, emoji }`. `resolveFeatured` in `build-data.mjs` turns each `ref` (a plot-line/character *name*, or a tag *label*) into an id and warns on anything that stops resolving, so a renamed entity is a build warning rather than a card that vanishes.

Character search aliases are assembled in `build-data.mjs` (`attachAliases`) from `nicknames`, reversed `aliases`, the 諧音 homophone pun, and an English name auto-extracted from the start of many bios.

## Conventions

- Package manager is **pnpm** (`packageManager` pinned). Node 22 in CI.
- ESLint uses Nuxt's flat config with stylistic rules: **no comma dangle**, 1tbs brace style. Match the terse, comment-rich style of the existing scripts.
- The site is served from the custom domain `comehomelovelb.williamchong.cloud`, i.e. **from the root**, so `app.baseURL` is `/`. The deploy workflow still derives `NUXT_APP_BASE_URL` (Pages base path, trailing slash) and `NUXT_SITE_URL` (Pages origin) from `actions/configure-pages`, which reads them from the repo's Pages settings — so the custom domain is configured there and nowhere else, and the wiring falls back to `/come-home-love-lb/` on `github.io` if it's ever removed. `public/CNAME` records the domain in-repo (GitHub Actions deploys read the setting, not the file). Locally both default to `/` and the production origin.
- This is a non-official fan project; episode/character data is sourced from the wikis and © their rights holders.
