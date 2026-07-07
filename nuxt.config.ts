// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  modules: [
    '@nuxt/eslint',
    '@nuxt/ui'
  ],

  devtools: {
    enabled: true
  },

  css: ['~/assets/css/main.css'],

  // GitHub Pages project pages serve under /<repo>/. Set the NUXT_APP_BASE_URL
  // env var in CI (Nuxt maps it to app.baseURL automatically); defaults to '/'.

  routeRules: {
    '/': { prerender: true }
  },

  compatibilityDate: '2026-06-30',

  // Emits a static site to .output/public with a 404.html SPA fallback and
  // .nojekyll, so deep links (/episode/123, /character/…) work on GitHub Pages.
  nitro: {
    preset: 'github_pages'
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
  }
})
