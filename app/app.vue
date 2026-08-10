<script setup>
import { SITE_DESCRIPTION, SITE_LOCALE, SITE_TITLE } from '~/types'

// GitHub Pages project sites serve under /<repo>/, and useHead does not apply
// app.baseURL for us — a bare '/favicon.ico' resolves to the domain root. Nuxt
// normalises baseURL to a trailing slash, so this concatenation is safe.
const favicon = `${useRuntimeConfig().app.baseURL}favicon.ico`

useHead({
  meta: [
    { name: 'viewport', content: 'width=device-width, initial-scale=1' }
  ],
  link: [
    { rel: 'icon', href: favicon }
  ],
  htmlAttrs: {
    lang: SITE_LOCALE
  }
})

// Site-level fallbacks; detail pages override them through `usePageSeo`.
useSeoMeta({
  title: SITE_TITLE,
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
          資料來源：維基學院／維基百科 · 非官方粉絲項目
        </p>
      </template>
    </UFooter>
  </UApp>
</template>
