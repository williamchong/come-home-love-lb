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
  }
})
