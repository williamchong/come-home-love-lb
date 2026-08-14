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

/**
 * A 404 status for a detail page whose subject does not exist.
 *
 * Every real entity is prerendered, so a request only reaches the Worker for a
 * URL that was mistyped, invented, or left behind by a rename — and the Worker
 * happily renders the page's friendly 找不到… body for it. Under a **200**,
 * that is a soft 404: the previous host answered an unknown path with a 404
 * status of its own, and without this every wrong URL becomes indexable.
 *
 * Server-side only, and prerendering never reaches it — the routes are
 * enumerated from the very data these pages read, so `missing` is false for
 * every one of them. On the client the status line was sent long ago.
 *
 * A plain boolean, not a ref: callers await their subject before reaching here,
 * SSR runs setup exactly once, and there is no re-render to track — a reactive
 * signature would promise a contract nothing can exercise.
 */
export function useMissingSubjectStatus(missing: boolean) {
  const event = import.meta.server ? useRequestEvent() : undefined
  if (event && missing) setResponseStatus(event, 404)
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
