// Parse cached wikitext into normalised JSON consumed by the Nuxt app.
// Run: node scripts/fetch-sources.mjs && node scripts/build-data.mjs
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  cleanText, parseUbl, parseCellAttrs, splitTableRows, splitRowCells, extractEpisodeRefs
} from './lib/wikitext.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const CACHE = join(__dirname, '.cache')
const OUT = join(__dirname, '..', 'app', 'data')

const read = name => readFile(join(CACHE, name), 'utf8')

// ---------------------------------------------------------------------------
// Episode list (集數列表): 15 wikitables, columns 集數/首播日期/主題/編劇/故事主人翁
// ---------------------------------------------------------------------------
function parseProtagonists(raw) {
  // e.g. "熊氏一家（但以熊樹根、熊若水、熊心如為主線）" -> tokens + focus
  const focusMatch = /（[^（）]*?以(.+?)為主[線缐]）/.exec(raw)
  const focus = focusMatch ? focusMatch[1].split(/[、，,]/).map(s => s.trim()).filter(Boolean) : []
  const head = raw.replace(/（[^（）]*）/g, '') // drop all parentheticals
  const tokens = head.split(/[、，,]/).map(s => s.trim()).filter(Boolean)
  return { tokens, focus }
}

function parseEpisodes(wikitext) {
  const listPart = wikitext.slice(
    wikitext.indexOf('==集數列表=='),
    wikitext.indexOf('==故事系列==')
  )
  const tables = listPart.match(/\{\|[\s\S]*?\n\|\}/g) || []
  const episodes = []
  for (const table of tables) {
    const rows = splitTableRows(table)
    const carry = [null, null, null, null, null]
    let year = null
    for (const row of rows) {
      const trimmed = row.replace(/^\s+/, '')
      if (trimmed.startsWith('!') || trimmed.startsWith('{|') || trimmed.startsWith('|+')) {
        const ym = /(\d{4})年/.exec(trimmed)
        if (ym) year = Number(ym[1])
        continue
      }
      const cells = splitRowCells(row)
      const logical = []
      let ci = 0
      for (let col = 0; col < 5; col++) {
        if (carry[col] && carry[col].remaining > 0) {
          logical[col] = carry[col].value
          carry[col].remaining--
          continue
        }
        const rawCell = cells[ci++]
        if (rawCell == null) { logical[col] = ''; continue }
        const { rowspan, content } = parseCellAttrs(rawCell)
        const val = cleanText(content)
        logical[col] = val
        if (rowspan > 1) carry[col] = { value: val, remaining: rowspan - 1 }
      }
      const [noStr, date, title, writerCell, protagCell] = logical
      const noMatch = /^(\d+)/.exec((noStr || '').trim())
      if (!noMatch) continue
      const no = Number(noMatch[1])
      const writers = writerCell ? writerCell.split(/[、，,／/]/).map(s => s.trim()).filter(Boolean) : []
      const { tokens, focus } = parseProtagonists(protagCell || '')
      episodes.push({ no, date, year, title, writers, protagonists: tokens, focus })
    }
  }
  episodes.sort((a, b) => a.no - b.no)
  return episodes
}

// ---------------------------------------------------------------------------
// Story series (故事系列): the pre-curated plot-line index, 5 categories.
// ---------------------------------------------------------------------------
const PLOTLINE_CATEGORIES = [
  { key: 'family', heading: '===親情系列===', label: '親情系列' },
  { key: 'friendship', heading: '===友情系列===', label: '友情系列' },
  { key: 'work', heading: '===工作拍檔／上司下屬系列===', label: '工作拍檔／上司下屬系列' },
  { key: 'romance', heading: '===愛情系列===', label: '愛情系列' },
  { key: 'festival', heading: '===節日特別篇===', label: '節日特別篇' }
]

function sectionBetween(text, startHeading, endIndex) {
  const start = text.indexOf(startHeading)
  if (start === -1) return ''
  return text.slice(start + startHeading.length, endIndex)
}

function slug(prefix, i) {
  return `${prefix}-${i}`
}

function parsePlotlines(wikitext) {
  const seriesStart = wikitext.indexOf('==故事系列==')
  const seriesEnd = (() => {
    // next level-2 heading (==X==) after the category subsections (===X===)
    const m = /\n==[^=]/.exec(wikitext.slice(seriesStart + 6))
    return m ? seriesStart + 6 + m.index : wikitext.length
  })()
  const series = wikitext.slice(seriesStart, seriesEnd)

  const plotlines = []
  for (let c = 0; c < PLOTLINE_CATEGORIES.length; c++) {
    const cat = PLOTLINE_CATEGORIES[c]
    const nextHeading = PLOTLINE_CATEGORIES[c + 1]?.heading
    const end = nextHeading ? series.indexOf(nextHeading) : series.length
    const body = sectionBetween(series, cat.heading, end < 0 ? series.length : end)
    const table = (body.match(/\{\|[\s\S]*?\n\|\}/) || [])[0]
    if (!table) continue
    const rows = splitTableRows(table)
    let idx = 0
    for (const row of rows) {
      const trimmed = row.replace(/^\s+/, '')
      if (trimmed.startsWith('!') || trimmed.startsWith('{|')) continue
      // cells: 主人翁 || {{ubl nums}} || {{ubl titles}} || 簡介
      const cells = splitRowCells(row)
      if (cells.length < 2) continue
      const ownerRaw = cleanText(parseCellAttrs(cells[0]).content)
      const lines = ownerRaw.split('\n').map(s => s.trim()).filter(Boolean)
      const characters = (lines[0] || '').split(/[、，,]/).map(s => s.trim()).filter(Boolean)
      const name = lines[1] || lines[0] || ''

      const numsCell = cells[1] || ''
      const titlesCell = cells[2] || ''
      const nums = numsCell.includes('{{ubl')
        ? parseUbl(numsCell, numsCell.indexOf('{{ubl') + 2).items
        : [cleanText(numsCell)]
      const titles = titlesCell.includes('{{ubl')
        ? parseUbl(titlesCell, titlesCell.indexOf('{{ubl') + 2).items
        : [cleanText(titlesCell)]
      const summary = cells.length >= 4 ? cleanText(parseCellAttrs(cells[cells.length - 1]).content) : ''

      const episodes = nums
        .map((n, i) => ({ no: Number(n), title: titles[i] || '' }))
        .filter(e => Number.isFinite(e.no))
      if (!episodes.length) continue
      plotlines.push({
        id: slug(cat.key, idx++),
        category: cat.key,
        categoryLabel: cat.label,
        name,
        characters,
        summary,
        episodes
      })
    }
  }
  return plotlines
}

// ---------------------------------------------------------------------------
// Character list (角色列表): roster grouped by family/organisation, plus the
// 單元角色／特別演出 (unit/special-guest) section. Columns: 演員/角色/簡要介紹.
// ---------------------------------------------------------------------------
function actorName(raw) {
  // strip rowspan attrs, "(年輕版由X飾演)" notes, wiki links -> plain actor name
  const cleaned = cleanText(parseCellAttrs(raw).content)
  return cleaned.replace(/（[^（）]*）/g, '').replace(/\s+/g, '').trim()
}

function parseCharacters(wikitext) {
  const lines = wikitext.split('\n')
  const characters = []
  const groupSet = new Map() // label -> {id,label}
  let group = null
  let sub = null
  let buf = null
  const idCounts = new Map()

  const flush = () => {
    if (!buf) return
    const table = buf.join('\n')
    const isSpecial = group?.label?.includes('單元') || group?.label?.includes('特別')
    const rows = splitTableRows(table)
    const addCharacter = (display, fields) => {
      let id = display
      if (idCounts.has(id)) { const c = idCounts.get(id) + 1; idCounts.set(id, c); id = `${display}-${c}` } else idCounts.set(id, 1)
      characters.push({ id, name: display, group: group?.label || null, subgroup: sub, ...fields })
    }
    const cameos = [] // special section: one entry per explicit-actor block
    let cameo = null
    let lastActor = ''
    for (const row of rows) {
      const trimmed = row.replace(/^\s+/, '')
      if (trimmed.startsWith('!') || trimmed.startsWith('{|') || trimmed.startsWith('|+')) continue
      const cells = splitRowCells(row)
      const actorRaw = cells[0] ?? '' // blank on rowspan-continuation rows
      const actor = actorRaw ? actorName(actorRaw) : lastActor
      if (actorRaw) lastActor = actor
      const name = cleanText(parseCellAttrs(cells[1] ?? '').content)
      const bio = cleanText(parseCellAttrs(cells[2] ?? '').content)
      if (!name && !bio) continue

      if (isSpecial) {
        // collapse each guest actor's rowspan block into a single cameo entry
        if (actorRaw || !cameo) { cameo = { actor: actor || null, name: actor || name, roles: [], bios: [], refs: new Set() }; cameos.push(cameo) }
        if (name) cameo.roles.push(name)
        if (bio) cameo.bios.push(bio)
        for (const r of extractEpisodeRefs(bio)) cameo.refs.add(r)
        continue
      }

      const display = name || actor
      if (!display) continue
      const homophone = (/角色名字?諧音[：:](.+?)(?:；|$)/.exec(bio) || [])[1]?.trim()
      addCharacter(display, {
        actor: actor || null, type: 'regular', bio,
        episodeRefs: extractEpisodeRefs(bio), homophone: homophone || null
      })
    }
    for (const c of cameos) {
      if (!c.name) continue
      addCharacter(c.name, {
        actor: c.actor, type: 'special', bio: c.bios.join('\n'),
        roles: [...new Set(c.roles)], episodeRefs: [...c.refs].sort((a, b) => a - b), homophone: null
      })
    }
    buf = null
  }

  for (const line of lines) {
    const h2 = /^==([^=].*?)==\s*$/.exec(line)
    const h3 = /^===([^=].*?)===\s*$/.exec(line)
    if (h2) { flush(); group = { id: `g-${groupSet.size}`, label: h2[1].trim() }; if (!group.label.startsWith('注釋')) groupSet.set(group.label, group); sub = null; continue }
    if (h3) { flush(); sub = h3[1].trim(); continue }
    if (/^\{\|/.test(line.trim())) { flush(); buf = [line]; continue }
    if (buf) {
      buf.push(line)
      if (/^\|\}/.test(line.trim())) flush()
    }
  }
  flush()
  const groups = [...groupSet.values()]
  return { characters, groups }
}

// ---------------------------------------------------------------------------
// Cross-linking + tags
// ---------------------------------------------------------------------------
const GROUP_LIKE = /(一家|集團|員工|公司|大學|廣場|商場|工業大廈|天廈|聯盟|補習社|工作室|小學|警署|醫院|電影|餐廳|商界|家)$/

const FESTIVAL_KEYWORDS = [
  [/聖誕|平安夜/, '聖誕節'],
  [/農曆|賀年|年初|除夕|團年|新春|揮春|利是|年宵/, '農曆新年'],
  [/萬聖|鬼節|南瓜/, '萬聖節'],
  [/情人節/, '情人節'],
  [/母親節/, '母親節'],
  [/父親節/, '父親節'],
  [/中秋|月餅/, '中秋節'],
  [/端午|龍舟|糭/, '端午節'],
  [/復活節/, '復活節'],
  [/冬至/, '冬至']
]

function applyEpisodeFixes(episodes, overlay) {
  for (const fix of overlay.episodeFixes || []) {
    const target = episodes.find(e => e.date === fix.date && e.title === fix.title && e.no === fix.wrongNo)
    if (target) target.no = fix.no
  }
  episodes.sort((a, b) => a.no - b.no)
}

function crossLink(episodes, plotlines, characters, overlay) {
  const byNo = new Map(episodes.map(e => [e.no, e]))
  for (const e of episodes) { e.characterIds = []; e.groupIds = []; e.plotlineIds = []; e.tagIds = []; e._chars = new Set(); e._groups = new Set() }

  // canonical name -> character id (first occurrence wins)
  const nameToId = new Map()
  for (const c of characters) if (!nameToId.has(c.name)) nameToId.set(c.name, c.id)
  const aliases = overlay.aliases || {}
  const resolveName = token => aliases[token] || token

  let unresolved = 0
  const addChar = (e, name) => {
    const canon = resolveName(name)
    const id = nameToId.get(canon)
    if (id) e._chars.add(id)
    else if (GROUP_LIKE.test(name)) e._groups.add(name)
    else unresolved++ // minor name not in roster; kept in e.protagonists for display only
  }

  // 1) from episode 故事主人翁 column
  for (const e of episodes) {
    for (const t of e.protagonists) addChar(e, t)
    for (const t of e.focus) addChar(e, t)
  }
  // 2) plot-line membership only (NOT each plot line's full roster — the 故事主人翁
  //    column above is the precise per-episode cast; injecting the roster over-tags)
  for (const p of plotlines) {
    for (const pe of p.episodes) {
      const e = byNo.get(pe.no)
      if (e) e.plotlineIds.push(p.id)
    }
  }
  // 3) from character bio 第N集 references
  for (const c of characters) {
    for (const n of c.episodeRefs) { const e = byNo.get(n); if (e) e._chars.add(c.id) }
  }

  for (const e of episodes) {
    e.characterIds = [...e._chars]
    e.groupIds = [...e._groups]
    e.plotlineIds = [...new Set(e.plotlineIds)]
    delete e._chars; delete e._groups
  }

  // reverse index: character -> episodes it appears in
  const epsByChar = new Map()
  for (const e of episodes) for (const id of e.characterIds) { if (!epsByChar.has(id)) epsByChar.set(id, []); epsByChar.get(id).push(e.no) }
  for (const c of characters) c.episodeNos = (epsByChar.get(c.id) || []).sort((a, b) => a - b)

  return { byNo, nameToId, epsByChar, unresolved }
}

function buildTags(episodes, plotlines, characters, overlay, ctx) {
  const tags = []
  const plByName = new Map(plotlines.map(p => [p.name, p]))

  // festivals: keyword scan over titles, one tag per holiday
  const festivalMap = new Map()
  for (const e of episodes) {
    for (const [re, label] of FESTIVAL_KEYWORDS) {
      if (re.test(e.title)) { if (!festivalMap.has(label)) festivalMap.set(label, new Set()); festivalMap.get(label).add(e.no) }
    }
  }
  // also fold in the curated 節日特別篇 plot lines
  for (const p of plotlines.filter(p => p.category === 'festival')) {
    for (const [re, label] of FESTIVAL_KEYWORDS) {
      if (re.test(p.name) || re.test(p.summary)) { if (!festivalMap.has(label)) festivalMap.set(label, new Set()); for (const pe of p.episodes) festivalMap.get(label).add(pe.no) }
    }
  }
  for (const [label, nos] of festivalMap) tags.push({ id: `festival-${label}`, kind: 'festival', label, episodeNos: [...nos].sort((a, b) => a - b) })

  // cameos (curated)
  for (const c of overlay.cameos || []) {
    tags.push({ id: `cameo-${c.label}`, kind: 'cameo', label: c.label, title: c.title || null, guestActor: c.actor || null, summary: c.summary || '', episodeNos: [...c.episodes].sort((a, b) => a - b) })
  }

  // milestones (curated), linked to a parent plot line
  for (const m of overlay.milestones || []) {
    const pl = m.plotline ? plByName.get(m.plotline) : null
    tags.push({ id: `milestone-${m.label}`, kind: 'milestone', label: m.label, parentPlotlineId: pl ? pl.id : null, summary: m.summary || '', episodeNos: [...m.episodes].sort((a, b) => a - b) })
  }

  // locations: find characters originating there (bio match), episodes via those characters
  for (const loc of overlay.locations || []) {
    const needles = [loc.name, ...(loc.aliases || [])]
    const chars = characters.filter(c => needles.some(n => (c.bio || '').includes(n)))
    const nos = new Set()
    for (const c of chars) for (const n of c.episodeNos || []) nos.add(n)
    tags.push({ id: `location-${loc.name}`, kind: 'location', label: loc.name, characterIds: chars.map(c => c.id), episodeNos: [...nos].sort((a, b) => a - b) })
  }

  // assign tagIds back to episodes
  const byNo = ctx.byNo
  for (const t of tags) for (const n of t.episodeNos) { const e = byNo.get(n); if (e) e.tagIds.push(t.id) }
  for (const e of episodes) e.tagIds = [...new Set(e.tagIds)]

  return tags
}

// ---------------------------------------------------------------------------
async function main() {
  const epWik = await read('wikiversity-episodes.wikitext')
  const chWik = await read('wikiversity-characters.wikitext')
  const overlay = JSON.parse(await readFile(join(__dirname, '..', 'data', 'overlay.json'), 'utf8'))
  const episodes = parseEpisodes(epWik)
  const plotlines = parsePlotlines(epWik)
  const { characters, groups } = parseCharacters(chWik)

  applyEpisodeFixes(episodes, overlay)
  const ctx = crossLink(episodes, plotlines, characters, overlay)
  const tags = buildTags(episodes, plotlines, characters, overlay, ctx)

  const meta = {
    total: episodes.length,
    maxNo: Math.max(...episodes.map(e => e.no)),
    firstDate: episodes[0]?.date || '',
    lastDate: episodes[episodes.length - 1]?.date || '',
    generatedFrom: ['zh.wikiversity.org 集數列表及故事系列', 'zh.wikiversity.org 角色列表', 'data/overlay.json']
  }

  await mkdir(OUT, { recursive: true })
  await writeFile(join(OUT, 'episodes.json'), JSON.stringify(episodes), 'utf8')
  await writeFile(join(OUT, 'plotlines.json'), JSON.stringify(plotlines), 'utf8')
  await writeFile(join(OUT, 'characters.json'), JSON.stringify(characters), 'utf8')
  await writeFile(join(OUT, 'groups.json'), JSON.stringify(groups), 'utf8')
  await writeFile(join(OUT, 'tags.json'), JSON.stringify(tags), 'utf8')
  await writeFile(join(OUT, 'meta.json'), JSON.stringify(meta), 'utf8')

  // ---- validation report ----
  const nos = episodes.map(e => e.no)
  const max = Math.max(...nos)
  const seen = new Map()
  const dups = []
  for (const n of nos) { seen.set(n, (seen.get(n) || 0) + 1); if (seen.get(n) === 2) dups.push(n) }
  const gaps = []
  for (let n = 1; n <= max; n++) if (!seen.has(n)) gaps.push(n)
  const ep = n => episodes.find(e => e.no === n)
  console.log('— Episodes —')
  console.log(`count=${episodes.length} max=${max} gaps=${gaps.length}${gaps.length ? ' -> ' + gaps.slice(0, 20).join(',') : ''} dups=${dups.length}${dups.length ? ' -> ' + dups.join(',') : ''}`)
  for (const n of [1, 5, 6, 100, 1000]) {
    const e = ep(n)
    if (e) console.log(`  #${n}: ${e.date} | ${e.title} | 編劇:${e.writers.join('/')} | 主人翁:${e.protagonists.join('、')}${e.focus.length ? ' 主線:' + e.focus.join('、') : ''}`)
  }
  console.log('— Plotlines —')
  console.log(`count=${plotlines.length}`)
  const byCat = {}
  for (const p of plotlines) byCat[p.category] = (byCat[p.category] || 0) + 1
  console.log(' ', JSON.stringify(byCat))
  const romance = plotlines.filter(p => p.category === 'romance')
  console.log(`  romance examples: ${romance.slice(0, 6).map(p => p.name + '(' + p.episodes.length + ')').join(', ')}`)
  const gongshui = plotlines.find(p => p.name.includes('龔水') || p.name.includes('龔燁') && p.characters.includes('熊若水'))
  if (gongshui) console.log(`  龔水戀? -> ${gongshui.name} chars=${gongshui.characters.join('、')} eps=${gongshui.episodes.length}`)
  console.log('— Characters —')
  console.log(`count=${characters.length} withActor=${characters.filter(c => c.actor).length} withEpRefs=${characters.filter(c => c.episodeRefs.length).length} homophones=${characters.filter(c => c.homophone).length} special=${characters.filter(c => c.type === 'special').length}`)
  console.log(`  groups (${groups.length}): ${groups.map(g => g.label).join(' / ')}`)
  for (const n of ['熊樹根', '熊若水', '崔李悟璋', '龔燁']) {
    const c = characters.find(x => x.name === n)
    if (c) console.log(`  ${n}: 演員=${c.actor} 組=${c.group} 諧音=${c.homophone || '-'} 出場集數=${c.episodeNos.length}`)
    else console.log(`  ${n}: NOT FOUND`)
  }
  console.log('— Tags —')
  const byKind = {}
  for (const t of tags) byKind[t.kind] = (byKind[t.kind] || 0) + 1
  console.log(' ', JSON.stringify(byKind), `total=${tags.length}`)
  for (const t of tags.filter(t => t.kind === 'festival')) console.log(`  festival ${t.label}: ${t.episodeNos.length} eps`)
  for (const t of tags.filter(t => t.kind === 'cameo' || t.kind === 'milestone')) console.log(`  ${t.kind} ${t.label}: eps=${t.episodeNos.join(',')}${t.parentPlotlineId ? ' parent=' + t.parentPlotlineId : ''}`)
  for (const t of tags.filter(t => t.kind === 'location')) console.log(`  location ${t.label}: chars=${(t.characterIds || []).length} eps=${t.episodeNos.length}`)
  console.log('— Fix check —')
  const e824 = episodes.find(e => e.no === 824)
  console.log(`  ep824 = ${e824 ? e824.title + ' (' + e824.date + ')' : 'MISSING'}`)
}

main().catch((err) => { console.error(err); process.exit(1) })
