<script setup>
import { SITE_DESCRIPTION, SITE_LOCALE, SITE_TITLE } from '~/types'

// GitHub Pages project sites serve under /<repo>/, and useHead does not apply
// app.baseURL for us — a bare '/favicon.ico' resolves to the domain root. Nuxt
// normalises baseURL to a trailing slash, so this concatenation is safe.
const base = useRuntimeConfig().app.baseURL

// The two pages the ETL parses, spelled out rather than percent-encoded so they
// stay readable — both titles are exactly what `fetch-sources.mjs` pulls.
const WIKIVERSITY_SOURCE = 'https://zh.wikiversity.org/zh-hk/愛·回家之開心速遞集數列表及故事系列'
const WIKIPEDIA_SOURCE = 'https://zh.wikipedia.org/zh-hk/愛·回家之開心速遞'
const ISSUES_URL = 'https://github.com/williamchong/come-home-love-lb/issues'

useHead({
  meta: [
    { name: 'viewport', content: 'width=device-width, initial-scale=1' }
  ],
  // The SVG is the real icon — it stays sharp at every size and swaps its body
  // colour under a dark tab bar. The .ico is rasterised from it as the fallback
  // for browsers that ignore SVG icons, and for anything that blindly fetches
  // /favicon.ico.
  link: [
    { rel: 'icon', type: 'image/svg+xml', href: `${base}favicon.svg` },
    { rel: 'icon', sizes: '48x48', href: `${base}favicon.ico` }
  ],
  htmlAttrs: {
    lang: SITE_LOCALE
  }
})

// Site-level fallbacks; detail pages override them through `usePageSeo`.
//
// There is deliberately no `title:` here — the template already answers an unset
// title with SITE_TITLE, and a static entry spelling that same string out-resolves
// the index page's reactive title so its filtered form never lands. See the note
// on `useSeoMeta` in `pages/index.vue` before adding one back.
useSeoMeta({
  titleTemplate: t => (t && t !== SITE_TITLE ? `${t}` : SITE_TITLE),
  description: SITE_DESCRIPTION,
  ogTitle: SITE_TITLE,
  ogDescription: SITE_DESCRIPTION,
  ogType: 'website',
  ogSiteName: SITE_TITLE,
  ogLocale: 'zh_HK',
  // No card artwork ships with the site yet, and 'summary_large_image' without
  // an og:image renders as a bare link. Swap to the large card once one exists.
  twitterCard: 'summary'
})
</script>

<template>
  <UApp>
    <UHeader :toggle="false">
      <template #left>
        <NuxtLink
          to="/"
          class="font-bold text-highlighted"
        >
          愛·回家之開心速遞 <span class="text-muted font-normal">劇集導航</span>
        </NuxtLink>
      </template>

      <template #right>
        <UColorModeButton />
      </template>
    </UHeader>

    <UMain>
      <NuxtPage />
    </UMain>

    <USeparator />

    <UFooter>
      <template #left>
        <p class="text-sm text-muted">
          資料來源：<ULink
            :to="WIKIVERSITY_SOURCE"
            target="_blank"
            class="underline underline-offset-2 hover:text-highlighted"
          >維基學院</ULink>／<ULink
            :to="WIKIPEDIA_SOURCE"
            target="_blank"
            class="underline underline-offset-2 hover:text-highlighted"
          >維基百科</ULink> · 非官方粉絲項目
        </p>
      </template>

      <template #right>
        <UButton
          :to="ISSUES_URL"
          target="_blank"
          icon="i-simple-icons-github"
          size="xs"
          color="neutral"
          variant="ghost"
        >
          回報問題
        </UButton>
      </template>
    </UFooter>
  </UApp>
</template>
