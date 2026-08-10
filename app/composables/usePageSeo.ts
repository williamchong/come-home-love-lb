import type { MaybeRefOrGetter } from 'vue'

/**
 * A page's title and description, plus the Open Graph pair that mirrors them.
 *
 * The mirroring is the point: nuxt-seo-utils does *not* derive og:title /
 * og:description from title / description, so a page that sets only the latter
 * silently inherits app.vue's site-level social card.
 */
export function usePageSeo(title: MaybeRefOrGetter<string>, description: MaybeRefOrGetter<string | undefined>) {
  useSeoMeta({
    title: () => toValue(title),
    description: () => toValue(description),
    ogTitle: () => toValue(title),
    ogDescription: () => toValue(description)
  })
}

/** The 劇集導航 → subject crumb trail every detail page carries. */
export function homeBreadcrumb(subject: string) {
  return defineBreadcrumb({
    itemListElement: [
      { name: '劇集導航', item: '/' },
      { name: subject }
    ]
  })
}
