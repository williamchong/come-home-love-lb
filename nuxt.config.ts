import { readFileSync } from 'node:fs'
import type { Character, Episode, Plotline, Tag } from './app/types'
import { SITE_DESCRIPTION, SITE_LOCALE, SITE_TITLE } from './app/types'
import { isIndexableCharacter } from './app/utils/indexable'
import { subjectToken } from './shared/utils/subject'

// https://nuxt.com/docs/api/configuration/nuxt-config

const readData = <T>(name: string): T =>
  JSON.parse(readFileSync(new URL(`./app/data/${name}.json`, import.meta.url), 'utf8')) as T

/**
 * The files a crawler asks for that no page emits — @nuxtjs/robots and
 * @nuxtjs/sitemap answer these themselves.
 *
 * Under the old static preset they fell out of the build as files. A server
 * preset registers them as routes instead, so they must be named here or they
 * become the only routine traffic that invokes the Worker — and rebuilding a
 * 3,687-URL, 365 KB sitemap per request is not what the free plan's 10 ms CPU
 * budget is for. Prerendered, they are served from the asset store like
 * everything else: free, uncapped, and off the Worker entirely.
 *
 * The last two spell out @nuxtjs/sitemap's *default* `sitemapName` and `xsl`.
 * Override either in the `sitemap` block below and this list has to follow, or
 * that route quietly drops off the manifest and back onto the Worker.
 */
const CRAWLER_ROUTES = ['/robots.txt', '/sitemap.xml', '/__sitemap__/style.xsl']

// Read once at module scope: `siteRoutes` enumerates pages out of these and
// `voteSubjects` enumerates votable ids, and parsing ~1.8 MB twice a build buys
// nothing.
const episodes = readData<Episode[]>('episodes')
const characters = readData<Character[]>('characters')
const plotlines = readData<Plotline[]>('plotlines')
const tags = readData<Tag[]>('tags')

const distinct = (values: string[]) => [...new Set(values)]

/**
 * 家庭・機構 and 編劇 have no file of their own — the facet *is* whatever the
 * episodes name, which is exactly how `useDataset` counts them into
 * `facets.groups` / `facets.writers`. Derived once here because three things
 * need the same list: the pages to prerender, the sitemap, and the vote
 * allowlist. (`groups.json` is not that list: it is loaded by the full tier and
 * read by nothing, and its labels don't match these tokens.)
 */
const groupLabels = distinct(episodes.flatMap(e => e.groupIds))
const writerNames = distinct(episodes.flatMap(e => e.writers))

/**
 * Every subject a vote may name, as `key:value`, inlined into the Worker via
 * `runtimeConfig` so `POST /api/vote` can reject anything else.
 *
 * Without it the table fills with arbitrary strings from anyone holding curl,
 * and the score snapshot — which every visitor downloads — is what carries them
 * back out. It is built from the same files the pages are built from, so a
 * renamed entity can't leave a votable id behind.
 *
 * Inlined as *config* rather than imported by the route on purpose: config is
 * evaluated with the Worker's global scope, against the 1 s startup budget,
 * where importing `episodes.json` from the handler would put a 1 MB parse
 * inside a request's 10 ms.
 *
 * 家庭・機構 comes from `episode.groupIds`, not `groups.json` — the latter is
 * loaded by the full dataset tier but read by nothing, while `groupIds` is what
 * `useDataset` counts into `facets.groups` and therefore what a chip carries.
 */
function voteSubjects(): string[] {
  return [
    ...episodes.map(e => subjectToken('episodes', e.no)),
    ...characters.map(c => subjectToken('characters', c.id)),
    ...plotlines.map(p => subjectToken('plotlines', p.id)),
    ...tags.map(t => subjectToken('tags', t.id)),
    ...groupLabels.map(g => subjectToken('groups', g)),
    ...writerNames.map(w => subjectToken('writers', w))
  ]
}

/**
 * Build-time route enumeration, shared by the prerenderer and the sitemap.
 *
 * Nitro's `crawlLinks` cannot discover any of these: the lists are painted from
 * JSON at runtime, so a crawl starting at `/` only ever sees the loading shell.
 * They are read straight out of the generated data instead, and every episode,
 * character and plot line gets its own prerendered HTML file. Why prerender all
 * of them rather than render on demand is a cost question — see the `nitro`
 * block below.
 */
function siteRoutes() {
  // Plot lines list members by name, and name === id on the roster, so a
  // membership lookup doubles as "this character is worth linking to".
  const inPlotline = new Set(plotlines.flatMap(p => p.characters))
  // The page itself applies the same predicate to decide whether to render
  // `noindex` — see app/utils/indexable.ts.
  const indexableCharacters = characters.filter(c => isIndexableCharacter(c, inPlotline.has(c.name)))

  const episodeRoutes = episodes.map(e => `/episode/${e.no}`)
  const plotlineRoutes = plotlines.map(p => `/plotline/${p.id}`)
  // The facets that finally have somewhere to be. Ids and labels carry CJK,
  // spaces and brackets, so both lists below encode or decode per their own
  // rule — same as the character routes.
  const facetPaths = [
    ...tags.map(t => `/tag/${t.id}`),
    ...groupLabels.map(g => `/group/${g}`),
    ...writerNames.map(w => `/writer/${w}`)
  ]

  return {
    /**
     * Everything to prerender — thin pages included, so that no URL 404s. Ids
     * carry spaces and dots ('Dr. KC', 'Hard Disk'), encoded here exactly as
     * the in-app <NuxtLink to="/character/…"> encodes them.
     */
    prerender: [
      ...CRAWLER_ROUTES,
      ...episodeRoutes,
      ...plotlineRoutes,
      ...characters.map(c => `/character/${encodeURIComponent(c.id)}`),
      ...facetPaths.map(p => p.split('/').map(encodeURIComponent).join('/'))
    ],
    /**
     * The subset worth indexing. Left **decoded**: @nuxtjs/sitemap escapes each
     * <loc> itself, so handing it an encoded path yields %25E4%25B8%2581….
     */
    sitemap: [
      '/',
      ...episodeRoutes,
      ...plotlineRoutes,
      ...indexableCharacters.map(c => `/character/${c.id}`),
      ...facetPaths
    ]
  }
}

const routes = siteRoutes()

export default defineNuxtConfig({
  modules: [
    '@nuxt/eslint',
    '@nuxt/scripts',
    '@nuxt/ui',
    '@nuxtjs/seo'
  ],

  $production: {
    // Only `nuxt build` prerenders. Left at the top level, these 4,300 entries
    // get inlined into Nuxt's virtual route-rules module, and Rollup blows its
    // parser stack on the resulting object literal every time dev starts.
    nitro: {
      prerender: {
        routes: routes.prerender
      }
    },

    // Google Analytics via the Nuxt Scripts registry — production builds only,
    // so dev-server sessions don't pollute the property.
    // `trigger` is required: without it a registry entry only registers config
    // defaults for the composable and the script is never loaded globally.
    // `proxy` must stay off — it rewrites the collection domains to a Nitro
    // route, and GitHub Pages is static, so the beacons would just 404.
    scripts: {
      registry: {
        googleAnalytics: {
          id: 'G-51ZC433EZX',
          trigger: 'onNuxtReady',
          proxy: false
        }
      }
    }
  },

  devtools: {
    enabled: true
  },

  css: ['~/assets/css/main.css'],

  // A Worker owns its whole hostname, so the site always serves from the root
  // and `app.baseURL` stays at its '/' default. The NUXT_APP_BASE_URL plumbing
  // this replaced existed only because a GitHub Pages *project* site serves
  // under /<repo>/ — there is no such fallback to cope with here.

  /**
   * `url` is the **origin only**. nuxt-site-config joins it with `app.baseURL`
   * to build canonicals and sitemap entries, and its de-duplication only fires
   * when the origin ends with the base *including* its trailing slash — so
   * spelling a path here as well would double it (…/come-home-love-lb/come-home-love-lb/).
   */
  site: {
    url: 'https://comehomelovelb.williamchong.cloud',
    name: SITE_TITLE,
    description: SITE_DESCRIPTION,
    defaultLocale: SITE_LOCALE
  },

  /**
   * Server-only — none of this reaches the browser (that would need `public`).
   *
   * `voteSecret` signs the anonymous voter cookie; set it in production with
   * `wrangler secret put NUXT_VOTE_SECRET`. Empty here so a local `wrangler dev`
   * starts without ceremony — `server/utils/voter.ts` refuses to issue or trust
   * a cookie signed with an empty key, so an unset secret disables voting
   * rather than accepting forged ids.
   */
  runtimeConfig: {
    voteSecret: '',
    voteSubjects: voteSubjects()
  },

  routeRules: {
    '/': { prerender: true }
  },

  compatibilityDate: '2026-06-30',

  /**
   * Cloudflare Workers: prerendered HTML lands in `.output/public` and is served
   * from the asset store, while `.output/server` answers `/api/*`.
   *
   * The split is what keeps this free. With `assets` configured and
   * `run_worker_first` left at its default `false`, Cloudflare matches the asset
   * manifest *before* invoking the Worker — a page view is served without ever
   * running it, and asset requests are neither billed nor capped. So the free
   * plan's 100k requests/day is a budget for votes alone rather than something
   * page traffic competes for. Flipping `run_worker_first` on, or letting a
   * route escape the manifest, silently moves every page view onto that meter.
   *
   * Everything is still prerendered — see `siteRoutes` above. That is now a
   * choice rather than a requirement (GitHub Pages forced it by answering
   * unknown paths with a 404 status): the free plan allows 10 ms CPU per
   * invocation, and SSR here would have to evaluate ~1.8 MB of JSON and rebuild
   * the dataset before Vue renders a byte.
   */
  nitro: {
    preset: 'cloudflare_module',
    prerender: {
      // Every route is enumerated in `siteRoutes` (added under $production
      // above); crawling would only re-walk them.
      crawlLinks: false
    }
  },

  eslint: {
    config: {
      stylistic: {
        commaDangle: 'never',
        braceStyle: '1tbs'
      }
    }
  },

  // GitHub Pages is static — there's no Nitro server to answer @nuxt/icon's
  // default `serverBundle: 'local'` API route, and the app renders its icons
  // client-side (data composables run with `server: false`). Bundle the icons
  // into the client JS instead so nothing is fetched at runtime.
  // `scan` picks up every `i-<collection>-*` literal in our own `.vue` templates
  // — `i-lucide-*` throughout, plus the one `i-simple-icons-*` in the footer;
  // `icons` adds Nuxt UI's component-internal defaults (check, loader-circle,
  // …) which live in node_modules and so are invisible to the scanner.
  icon: {
    clientBundle: {
      scan: true,
      icons: [
        'lucide:arrow-down',
        'lucide:arrow-left',
        'lucide:arrow-right',
        'lucide:arrow-up',
        'lucide:arrow-up-right',
        'lucide:check',
        'lucide:chevron-down',
        'lucide:chevron-left',
        'lucide:chevron-right',
        'lucide:chevron-up',
        'lucide:chevrons-left',
        'lucide:chevrons-right',
        'lucide:circle-alert',
        'lucide:circle-check',
        'lucide:circle-x',
        'lucide:copy',
        'lucide:copy-check',
        'lucide:ellipsis',
        'lucide:eye',
        'lucide:eye-off',
        'lucide:file',
        'lucide:folder',
        'lucide:folder-open',
        'lucide:grip-vertical',
        'lucide:hash',
        'lucide:info',
        'lucide:lightbulb',
        'lucide:loader-circle',
        'lucide:menu',
        'lucide:minus',
        'lucide:monitor',
        'lucide:moon',
        'lucide:panel-left-close',
        'lucide:panel-left-open',
        'lucide:plus',
        'lucide:rotate-ccw',
        'lucide:search',
        'lucide:square',
        'lucide:sun',
        'lucide:terminal',
        'lucide:triangle-alert',
        'lucide:upload',
        'lucide:x'
      ]
    }
  },

  // Dev-time only: checking every link on 4,300 prerendered pages would add
  // minutes to CI for a report nobody reads there.
  linkChecker: {
    enabled: false
  },

  // Per-route OG images would mean rendering 4,300 of them at build time, and
  // satori's bundled font carries no CJK glyphs, so every one would come out as
  // tofu boxes. Social cards stay text-only until a static card image exists.
  ogImage: {
    enabled: false
  },

  robots: {
    /**
     * Only https://<host>/robots.txt is ever consulted, and the Worker owns the
     * whole hostname, so the file is unconditionally ours to emit — which is
     * also what lets it advertise sitemap.xml. This was previously gated on the
     * base URL because @nuxtjs/robots refuses (with a build ERROR) to emit one
     * under a base path, which a GitHub Pages project site would have forced.
     */
    robotsTxt: true,
    // Nothing here is private. The thin roster pages call useRobotsRule() to
    // mark themselves noindex; see app/pages/character/[id].vue.
    disallow: []
  },

  seo: {
    // app.vue owns the title template; the module's route-name inference would
    // otherwise relabel pages that deliberately set their own.
    fallbackTitle: false,
    // Needs the optional @unhead/bundler peer, which isn't installed; leaving it
    // on only prints a warning on every build.
    treeShakeUseSeoMeta: false
  },

  sitemap: {
    // `routes.sitemap` is the curated list; without this the module would also
    // fold in its own prerender scan and re-add the noindex pages.
    excludeAppSources: true,
    urls: () => routes.sitemap
  }
})
