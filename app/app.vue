<script setup>
useHead({
  meta: [
    { name: 'viewport', content: 'width=device-width, initial-scale=1' }
  ],
  link: [
    { rel: 'icon', href: '/favicon.ico' }
  ],
  htmlAttrs: {
    lang: 'zh-Hant'
  }
})

const title = '愛·回家之開心速遞 劇集導航'
const description = '篩選 2800+ 集《愛·回家之開心速遞》，依角色、故事線、CP、節日、客串、里程碑、地點快速找到想重溫的劇集。'

useSeoMeta({
  title,
  titleTemplate: t => (t && t !== title ? `${t}` : title),
  description,
  ogTitle: title,
  ogDescription: description,
  twitterCard: 'summary_large_image'
})
</script>

<template>
  <UApp>
    <UHeader>
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
