import type { Character } from '../types'

/**
 * Shortest bio that still says something. 615 roster entries are one-line
 * footnotes — 「已去世，僅於回憶中出現」 — with no episodes of their own.
 */
const MIN_INDEXABLE_BIO = 20

/**
 * Whether a character page carries enough of its own text to earn an index slot.
 *
 * Shared deliberately: nuxt.config calls it to decide which characters the
 * sitemap advertises, and the character page calls it to decide whether to
 * render `noindex`. Splitting the rule would let the two drift, and a page the
 * sitemap promotes while the page itself refuses indexing is a crawl error.
 */
export function isIndexableCharacter(ch: Pick<Character, 'bio' | 'episodeNos'>, inPlotline: boolean): boolean {
  return Boolean(ch.episodeNos?.length) || inPlotline || ch.bio.length >= MIN_INDEXABLE_BIO
}
