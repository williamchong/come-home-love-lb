import { readFileSync } from 'node:fs'
import type { Character, Episode, Plotline } from './app/types'
import { SITE_DESCRIPTION, SITE_LOCALE, SITE_TITLE } from './app/types'
import { isIndexableCharacter } from './app/utils/indexable'

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
  const episodes = readData<Episode[]>('episodes')
  const characters = readData<Character[]>('characters')
  const plotlines = readData<Plotline[]>('plotlines')

  // Plot lines list members by name, and name === id on the roster, so a
  // membership lookup doubles as "this character is worth linking to".
  const inPlotline = new Set(plotlines.flatMap(p => p.characters))
  // The page itself applies the same predicate to decide whether to render
  // `noindex` — see app/utils/indexable.ts.
  const indexableCharacters = characters.filter(c => isIndexableCharacter(c, inPlotline.has(c.name)))

  const episodeRoutes = episodes.map(e => `/episode/${e.no}`)
  const plotlineRoutes = plotlines.map(p => `/plotline/${p.id}`)

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
      ...characters.map(c => `/character/${encodeURIComponent(c.id)}`)
    ],
    /**
     * The subset worth indexing. Left **decoded**: @nuxtjs/sitemap escapes each
     * <loc> itself, so handing it an encoded path yields %25E4%25B8%2581….
     */
    sitemap: [
      '/',
      ...episodeRoutes,
      ...plotlineRoutes,
      ...indexableCharacters.map(c => `/character/${c.id}`)
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
