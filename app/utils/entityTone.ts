import type { Character, Tag, TagKind } from '~/types'

/**
 * Deterministic per-entity colours: every tag, character and family gets its
 * *own* tone, while kindred entities stay in one hue neighbourhood — a family's
 * members share the family hue (their id only nudges lightness), and a tag
 * kind's tags spread across that kind's range. Facet types with nothing to vary
 * by keep a single concept colour instead (`FACET_COLOR` in types/index.ts).
 * Rendered as inline `light-dark()` styles — Nuxt UI colour aliases generate
 * per-component CSS and cannot scale to hundreds of entities.
 */
export interface EntityTone {
  hue: number
  /** oklch chroma — near 0 mutes the one-off/guest pool to keep lists calm. */
  chroma: number
  /** Per-entity lightness offset, so family members differ yet rhyme. */
  dl: number
}

/** FNV-1a → [0, 1): stable across sessions and dataset refreshes. */
function hash01(s: string): number {
  let h = 0x811C9DC5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0) / 2 ** 32
}

/** The catch-all roster pool: hundreds of one-off guests, kept muted. */
const UNIT_POOL = '單元角色／特別演出'

/** Hand-pinned hues so the core families read at a glance; the rest hash. */
const FAMILY_HUE: Record<string, number> = {
  '熊家': 40,
  '龍家': 190,
  '接龍集團（威龍商業大廈）': 255,
  '香港島大學（HKIU）': 150
}

/**
 * Canonical family behind a 故事主人翁 group token, so the token shares the
 * members' tone: 熊氏一家 → 熊家, 接龍集團保安部眾員工 → 接龍集團….
 */
function familyKey(token: string): string {
  const clan = token.match(/^(.+?)氏一家$/)
  if (clan) return `${clan[1]}家`
  const base = token.replace(/[「」]/g, '').replace(/(網店)?眾?[男女]?(員工|職員|學生)$/, '') || token
  for (const label of Object.keys(FAMILY_HUE)) {
    if (base.startsWith(label.replace(/（.*$/, ''))) return label
  }
  return base
}

/** Tone of a family / roster group (also used for group tokens on cards). */
export function familyTone(groupLabel: string): EntityTone {
  if (groupLabel === UNIT_POOL) return { hue: 260, chroma: 0.02, dl: 0 }
  const hue = FAMILY_HUE[groupLabel] ?? Math.round(hash01(groupLabel) * 360)
  return { hue, chroma: 0.13, dl: 0 }
}

/** A character keeps the family hue; their own id nudges lightness only. */
export function characterTone(ch: Pick<Character, 'id' | 'group'>): EntityTone {
  const base = familyTone(ch.group ?? ch.id)
  return { ...base, dl: Math.round((hash01(ch.id) - 0.5) * 14) }
}

/**
 * Tone of a raw 故事主人翁 token (episode `focus` / `protagonists`), which is a
 * character name or a group name — both of which double as their own id. Pass
 * `isGroup` for tokens the episode lists in `groupIds`; anything else unknown to
 * the roster (a one-off crowd token) stays untoned.
 */
export function tokenTone(token: string, charactersById: ReadonlyMap<string, Pick<Character, 'id' | 'group'>>, isGroup = false): EntityTone | undefined {
  const ch = charactersById.get(token)
  if (ch) return characterTone(ch)
  return isGroup ? familyTone(familyKey(token)) : undefined
}

/** Hue range per tag kind, so all e.g. 節日 tags stay one tone family. */
const TAG_RANGE: Record<TagKind, [number, number]> = {
  festival: [25, 145],
  cameo: [195, 285],
  milestone: [330, 360],
  special: [0, 0]
}

/** Cached per `tags` array: the dataset is built once, but every card asks for it. */
const tagToneCache = new WeakMap<Tag[], Map<string, EntityTone>>()

/** Every tag gets its own hue, evenly spaced inside its kind's range. */
export function tagTones(tags: Tag[]): Map<string, EntityTone> {
  const cached = tagToneCache.get(tags)
  if (cached) return cached

  const byKind = new Map<TagKind, Tag[]>()
  for (const t of tags) {
    const list = byKind.get(t.kind)
    if (list) list.push(t)
    else byKind.set(t.kind, [t])
  }
  const map = new Map<string, EntityTone>()
  for (const [kind, list] of byKind) {
    const [lo, hi] = TAG_RANGE[kind]
    for (const [i, t] of list.sort((a, b) => a.id.localeCompare(b.id)).entries()) {
      map.set(t.id, kind === 'special'
        ? { hue: 0, chroma: 0, dl: 0 }
        : { hue: Math.round(lo + (i + 0.5) / list.length * (hi - lo)), chroma: 0.13, dl: 0 })
    }
  }
  tagToneCache.set(tags, map)
  return map
}

/**
 * Inline colours matching Nuxt UI's `soft` badge look, themed via light-dark().
 * For *static* badges only — an inline background beats Tailwind's `hover:bg-*`,
 * so interactive surfaces (chips, links) take `toneTextStyle` over a neutral
 * variant instead, keeping their hover state intact.
 *
 * Both take an optional tone and return undefined for it, so callers can hand
 * over an unresolved lookup and let the element fall back to its Nuxt UI colour.
 */
export function toneBadgeStyle(t?: EntityTone | null) {
  if (!t) return undefined
  return {
    backgroundColor: `oklch(65% ${t.chroma} ${t.hue} / 0.16)`,
    color: `light-dark(oklch(${44 + t.dl}% ${t.chroma + 0.02} ${t.hue}), oklch(${80 + t.dl}% ${t.chroma} ${t.hue}))`
  }
}

/** Inline text colour for a tone; icons inherit it via `currentColor`. */
export function toneTextStyle(t?: EntityTone | null) {
  if (!t) return undefined
  return { color: `light-dark(oklch(${46 + t.dl}% ${t.chroma + 0.03} ${t.hue}), oklch(${76 + t.dl}% ${t.chroma} ${t.hue}))` }
}
