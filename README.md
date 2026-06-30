# 愛·回家之開心速遞 劇集導航

A filterable episode catalog for the TVB sitcom 《愛·回家之開心速遞》(*Come Home Love: Lo and Behold*, 2,800+ episodes). Pick episodes to rewatch by **character, story line / CP, festival, cameo, milestone, location, family/organisation, writer, year, or free text** — fully static, no backend.

Built with Nuxt 4 + Nuxt UI 4 + Tailwind 4. Deployed to GitHub Pages.

## How it works

The site is a static SPA over a pre-built dataset. There is **no live scraping at runtime** — data is parsed offline from open wiki sources into JSON committed under `app/data/`, and the app filters it client-side.

```
scripts/fetch-sources.mjs   → caches raw wikitext to scripts/.cache/ (gitignored)
scripts/build-data.mjs      → parses + cross-links + applies overlay → app/data/*.json
data/overlay.json           → hand-curated tags (cameos, milestones, aliases, locations)
app/                        → Nuxt app reading app/data/*.json
```

### Data sources

- **維基學院 (Wikiversity)** — episode list + 故事系列 (the curated plot-line index) and the full character roster (角色列表). Primary source; clean `?action=raw` wikitext.
- **維基百科 (Wikipedia)** — supplementary cast notes and the 歐陽bobby cameo arc 《波比與群姐的前世今生》.

`app/data/*.json` (generated) and `data/overlay.json` (curated) are committed, so a normal `pnpm build` needs no network access.

## Refreshing the data

Run locally whenever the wiki sources update (e.g. new episodes air):

```bash
node scripts/fetch-sources.mjs   # download + cache raw wikitext
node scripts/build-data.mjs      # regenerate app/data/*.json (prints a validation report)
```

The build report flags episode-count gaps, duplicate numbers (source typos — patch them in `data/overlay.json` → `episodeFixes`), and tag coverage. Commit the regenerated `app/data/*.json`.

### Editing the curated overlay

`data/overlay.json` is the only hand-maintained data file. Add to it when a "soft" tag can't be derived automatically:

- **cameos** — named guest arcs (label + actor + episodes), e.g. 歐陽bobby.
- **milestones** — named events linked to a parent plot line, e.g. 龔水結婚 (eps 1458–1461) inside 龔水戀.
- **locations** — recurring fictional settings (島大, 橙不忍島, the joke islands…); matched to characters whose bio names them.
- **aliases** — nickname → canonical name, e.g. 崔auntie → 崔李悟璋.
- **episodeFixes** — correct mislabelled rows from the source.

## Development

```bash
pnpm install
pnpm dev          # http://localhost:3000
pnpm lint
pnpm typecheck
pnpm build        # static output in .output/public
```

## Deployment

Pushing to `main` triggers `.github/workflows/deploy.yml`, which builds the static site (with the correct GitHub Pages base path) and publishes it. Enable **Settings → Pages → Source: GitHub Actions** once.

---

> Non-official fan project. All episode/character data © their respective rights holders; sourced from 維基學院 / 維基百科.
