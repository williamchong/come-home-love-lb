import { episodeAnchor, parseEpisodeAnchor } from '~/utils/episodeLink'

/**
 * Where an arrival row settles, as a scroll margin on the row itself.
 *
 * Both scrolls that can land on it — the browser's native jump on a cold visit,
 * and the one below once the list renders — honour `scroll-margin-top`, so
 * spelling the framing here is what makes the two agree instead of fighting.
 * Deep enough to clear the sticky header and to leave the rows before it in
 * view: arriving at the top edge of a list tells you nothing about where in the
 * story you are.
 */
export const EPISODE_ANCHOR_CLASS = 'scroll-mt-[30vh]'

/** What marks the row once it is there. Shared so both lists ring alike. */
export const EPISODE_ANCHOR_RING = 'ring-2 ring-primary'

/** How long the arrival row keeps its ring. Long enough to find, short enough not to nag. */
const FLASH_MS = 2400

/**
 * Scrolls an episode list to the episode the visitor arrived from, and marks it.
 *
 * A story line's 劇集順序 runs to hundreds of rows and a character's 焦點劇集 to
 * hundreds of cards, so opening one from 第1234集 used to land at the top with no
 * hint of where that episode sits. The links carry `#ep-1234` (`episodeHash`)
 * and this brings the row into view.
 *
 * It cannot be left to the browser, or to Nuxt's own hash handling: both are done
 * by the time `page:loading:end` fires, and a detail view is lazy on the client
 * (`CLIENT_LAZY` in `useDetailView`), so on a client-side navigation the rows
 * don't exist yet at that moment. Hence `episodes` — the list the page renders.
 * Mount covers the prerendered case, where the rows are already in the hydrated
 * HTML; the watcher covers the navigation case, where they arrive later.
 *
 * Returns the episode to ring, which the page binds on the matching row. Landing
 * mid-list with nothing marked reads as a mis-scroll rather than an arrival.
 */
export function useEpisodeAnchor(episodes: MaybeRefOrGetter<readonly { no: number }[]>) {
  const route = useRoute()
  const highlighted = ref<number | null>(null)
  // Nothing to scroll while prerendering, and no watcher worth registering.
  if (import.meta.client) {
    // Per hash, not per episode: re-running on every list change would grab the
    // scroll back from the visitor when the full tier resolves behind them.
    let handled: string | null = null
    let timer: ReturnType<typeof setTimeout> | undefined

    const reveal = () => {
      if (route.hash === handled) return
      const no = parseEpisodeAnchor(route.hash)
      if (no === null) return
      // Absent means the list hasn't rendered yet — or this episode isn't in it,
      // which a stale link or a plot line that names an episode by range without
      // listing it can both produce. Either way, leave the page where it is.
      const el = document.getElementById(episodeAnchor(no))
      if (!el) return
      handled = route.hash
      // Instant, because smooth-scrolling past two hundred rows is a
      // multi-second animation through nothing.
      //
      // `start`, not `center`, so this agrees with the browser: a cold visit to
      // a `#ep-1234` link is scrolled natively long before any of this runs, and
      // a second, different scroll a beat later reads as the page lurching. Both
      // honour the row's `scroll-mt`, which is where the framing actually lives
      // — it also keeps the native jump clear of the sticky header, which no
      // amount of scrolling from here could fix in time.
      el.scrollIntoView({ block: 'start' })
      highlighted.value = no
      clearTimeout(timer)
      timer = setTimeout(() => (highlighted.value = null), FLASH_MS)
    }

    onMounted(reveal)
    watch(() => [route.hash, toValue(episodes)], reveal, { flush: 'post' })
    onScopeDispose(() => clearTimeout(timer))
  }

  return highlighted
}
