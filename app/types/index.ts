// Shared data-model types for the episode explorer. The JSON in app/data/ is
// produced by scripts/build-data.mjs and conforms to these shapes.

export type PlotlineCategory = 'family' | 'friendship' | 'work' | 'romance' | 'festival'
export type CharacterType = 'regular' | 'special'
export type TagKind = 'festival' | 'cameo' | 'milestone' | 'special' | 'location'

export interface Episode {
  no: number
  date: string
  year: number | null
  title: string
  writers: string[]
  protagonists: string[] // raw 故事主人翁 tokens (characters and groups)
  focus: string[] // spotlighted characters from （但以…為主線）
  characterIds: string[] // resolved characters appearing in this episode
  groupIds: string[] // resolved family/organisation groups
  plotlineIds: string[]
  tagIds: string[]
  summary?: string // aggregated from plot-line 簡介 where available
}

export interface Character {
  id: string
  name: string
  actor: string | null
  group: string | null
  subgroup: string | null
  type: CharacterType
  bio: string
  episodeRefs: number[] // explicit 第N集 references mined from the bio
  homophone: string | null // 角色名字諧音 (name pun)
  aliases?: string[] // searchable nicknames (curated + homophone)
  roles?: string[] // for cameo/special: the role names played
  episodeNos?: number[] // resolved episodes this character appears in
}

export interface Group {
  id: string
  label: string
}

export interface PlotlineEpisode {
  no: number
  title: string
}

export interface Plotline {
  id: string
  category: PlotlineCategory
  categoryLabel: string
  name: string
  characters: string[]
  summary: string
  episodes: PlotlineEpisode[]
}

export interface Tag {
  id: string
  kind: TagKind
  label: string
  episodeNos: number[]
  title?: string
  parentPlotlineId?: string | null
  guestActor?: string | null
  summary?: string
  characterIds?: string[] // for location tags: characters originating there
}

export interface Meta {
  total: number
  maxNo: number
  firstDate: string
  lastDate: string
  generatedFrom: string[]
}

/** Short Chinese label per plot-line category (the long form lives on Plotline.categoryLabel). */
export const CATEGORY_LABEL: Record<PlotlineCategory, string> = {
  family: '親情',
  friendship: '友情',
  work: '拍檔／上司下屬',
  romance: '愛情',
  festival: '節日'
}

/** Nuxt UI badge colour per tag kind. */
export const TAG_COLOR = {
  festival: 'warning',
  cameo: 'info',
  milestone: 'error',
  location: 'success',
  special: 'neutral'
} as const satisfies Record<TagKind, string>
