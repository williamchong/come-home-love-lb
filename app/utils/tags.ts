import type { Tag } from '~/types'
import tagsData from '~/data/tags.json'
import { byId } from './byId'
import { tagTones } from './entityTone'

/**
 * The whole tag set, imported statically rather than projected per page.
 *
 * There are only 18 tags (3 KB), but `tagTones` spaces hues across the *entire*
 * set, so any page showing one badge needs all of them. Carrying that through
 * each prerendered route's payload cost ~3.9 KB × 4,300 routes — roughly 16 MB,
 * and it set the floor for every payload on the site. As a static import it is
 * one shared, browser-cached chunk instead.
 *
 * `import('~/data/tags.json')` in `useDataset` resolves to this same module, so
 * `CoreDataset.tags` and `TAGS` are the same array — one `tagTones` cache entry
 * serves both tiers.
 */
export const TAGS = tagsData as unknown as Tag[]

export const TAGS_BY_ID = byId(TAGS)

/** Per-tag tone. Constant, so it is resolved once rather than per component. */
export const TAG_TONES = tagTones(TAGS)
