import { readFileSync } from 'node:fs'
import type { Character, Episode, Plotline } from './app/types'
import { SITE_DESCRIPTION, SITE_LOCALE, SITE_TITLE } from './app/types'
import { isIndexableCharacter } from './app/utils/indexable'

// https://nuxt.com/docs/api/configuration/nuxt-config

const readData = <T>(name: string): T =>
  JSON.parse(readFileSync(new URL(`./app/data/${name}.json`, import.meta.url), 'utf8')) as T

/**
 * Build-time route enumeration, shared by the prerenderer and the sitemap.
 *
 * GitHub Pages answers an unknown path with 404.html **and an HTTP 404 status**,
 * so a route that isn't prerendered is not merely slow to index — it is invisible
 * to crawlers, and a dead end for anyone following a shared link. Every episode,
 * character and plot line therefore gets its own static HTML file.
 *
 * Nitro's `crawlLinks` cannot discover any of them: the lists are painted from
 * JSON at runtime, so a crawl starting at `/` only ever sees the loading shell.
 * The routes are read straight out of the generated data instead.
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

  // GitHub Pages project pages serve under /<repo>/. Set the NUXT_APP_BASE_URL
  // env var in CI (Nuxt maps it to app.baseURL automatically); defaults to '/'.

  /**
   * `url` is the **origin only**. nuxt-site-config joins it with `app.baseURL`
   * to build canonicals and sitemap entries, and its de-duplication only fires
   * when the origin ends with the base *including* its trailing slash — so
   * spelling the repo path here as well yields …/come-home-love-lb/come-home-love-lb/.
   * CI passes the Pages origin via NUXT_SITE_URL.
   */
  site: {
    url: 'https://williamchong.github.io',
    name: SITE_TITLE,
    description: SITE_DESCRIPTION,
    defaultLocale: SITE_LOCALE
  },

  routeRules: {
    '/': { prerender: true }
  },

  compatibilityDate: '2026-06-30',

  // Emits a static site to .output/public with a 404.html SPA fallback and
  // .nojekyll, so deep links (/episode/123, /character/…) work on GitHub Pages.
  nitro: {
    preset: 'github_pages',
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
  // `scan` picks up every `i-lucide-*` literal in our own `.vue` templates;
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
     * Only https://<host>/robots.txt is ever consulted, and on a GitHub Pages
     * *project* site that file belongs to the user-site repo, not this one — so
     * @nuxtjs/robots refuses (with a build ERROR) to emit one under a base URL.
     * Skip it there and keep it for root deployments, e.g. a custom domain.
     * Per-page robots meta tags are unaffected; the sitemap has to be handed to
     * Search Console directly rather than advertised in robots.txt.
     */
    robotsTxt: (process.env.NUXT_APP_BASE_URL || '/') === '/',
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
