# 愛·回家之開心速遞 劇集導航

A filterable episode catalog for the TVB sitcom 《愛·回家之開心速遞》(*Come Home Love: Lo and Behold*, 2,800+ episodes). Pick episodes to rewatch by **character, story line / CP, festival, cameo, milestone, location, family/organisation, writer, year, or free text** — fully static, no backend.

Built with Nuxt 4 + Nuxt UI 4 + Tailwind 4. Deployed to GitHub Pages at <https://comehomelovelb.williamchong.cloud>.

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

### Search engines

Although the app filters client-side, it is **not** shipped as a bare SPA shell. `pnpm build` prerenders every episode, character and plot-line page to its own static HTML file — around 4,300 of them — each with its own title, description, canonical URL and schema.org data, alongside a `sitemap.xml`, courtesy of [`@nuxtjs/seo`](https://nuxt.com/modules/seo). This matters on GitHub Pages specifically: it answers any path it has no file for with `404.html` *and an HTTP 404 status*, so an un-prerendered deep link is unindexable no matter what the JavaScript later renders.

The site is served from its own domain, <https://comehomelovelb.williamchong.cloud>, so it also owns `/robots.txt` — generated at build time and pointing crawlers at `sitemap.xml`. (Under the old `<user>.github.io/<repo>/` project-page URL it couldn't: only `https://<host>/robots.txt` is ever consulted, and that path belonged to a different repo.)

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

Pushing to `master` triggers `.github/workflows/deploy.yml`, which builds the static site and publishes it. Two one-time settings:

- **Settings → Pages → Source: GitHub Actions**.
- **Settings → Pages → Custom domain: `comehomelovelb.williamchong.cloud`**, plus a DNS `CNAME` record pointing it at `williamchong.github.io`, then **Enforce HTTPS**.

The build reads both the origin and the base path from those Pages settings (`actions/configure-pages`), so the custom domain is the only place the URL is configured: with it set the site builds for the root, without it it falls back to `/come-home-love-lb/` on `github.io`.

## License

The **code** in this repository is © 2026 William Chong and licensed under the
[GNU General Public License v3.0 or later](LICENSE). Every dependency it ships to the browser is
MIT / ISC / BSD / Apache-2.0 / CC0, all of which are GPLv3-compatible.

The **data** is not the author's to relicense and is excluded from the above: `app/data/*.json` is
derived from the [wiki sources](#data-sources) above, and stays under
[CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/) with attribution to them.

---

> Non-official fan project. All episode/character data © their respective rights holders; sourced from 維基學院 / 維基百科.
