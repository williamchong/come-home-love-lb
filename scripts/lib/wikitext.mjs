// Small, dependency-free helpers for turning MediaWiki wikitext into clean data.

// Strip inline wiki/HTML markup from a fragment, leaving readable plain text.
// Keeps the *display* text of links and templates like {{box|名}}.
export function cleanText(s) {
  if (!s) return ''
  return s
    .replace(/<ref[^>]*\/>/g, '')
    .replace(/<ref[^>]*>[\s\S]*?<\/ref>/g, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/-\{([^{}]*)\}-/g, '$1') // -{琼}- language-conversion escape -> its text
    .replace(/\{\{efn[^{}]*\}\}/gi, '') // explanatory footnotes -> drop entirely
    .replace(/\{\{box\|([^}]*)\}\}/g, '$1')
    .replace(/\{\{[^|}]*\|([^}]*)\}\}/g, '$1') // other simple templates -> last arg-ish
    .replace(/\{\{[^}]*\}\}/g, '')
    .replace(/\[\[[^\]|]*\|([^\]]*)\]\]/g, '$1') // [[target|text]] -> text
    .replace(/\[\[([^\]]*)\]\]/g, '$1') // [[text]] -> text
    .replace(/'''?/g, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/?[a-z][^>]*>/gi, '')
    .replace(/&nbsp;/g, ' ')
    .trim()
}

// Parse the contents of a {{ubl|a|b|c}} (unbulleted-list) template at `start`,
// where `text[start]` is the 'u' of ubl. Returns { items, end } where `end` is
// the index just past the closing '}}'. Handles nested {{...}} inside items.
export function parseUbl(text, start) {
  // find the first '|' after ubl, then walk to the matching '}}'
  let i = text.indexOf('|', start)
  if (i === -1) return { items: [], end: start }
  i += 1
  const items = []
  let depth = 0
  let cur = ''
  for (; i < text.length; i++) {
    const two = text.slice(i, i + 2)
    if (two === '{{') { depth++; cur += two; i++; continue }
    if (two === '}}') {
      if (depth === 0) { items.push(cur); i += 2; return { items: items.map(s => cleanText(s)), end: i } }
      depth--; cur += two; i++; continue
    }
    if (text[i] === '|' && depth === 0) { items.push(cur); cur = ''; continue }
    cur += text[i]
  }
  items.push(cur)
  return { items: items.map(s => cleanText(s)), end: text.length }
}

// If a cell starts with one or more wikitable attributes (rowspan/colspan/style/
// align/scope) terminated by a single '|', return { rowspan, colspan, content }.
export function parseCellAttrs(raw) {
  let rowspan = 1
  let colspan = 1
  let s = raw
  // attributes appear before the first lone '|' (templates use '||' / '}}', not single attr '|').
  // Values may be quoted, bare, or mis-quoted — rowspan="2", rowspan=2 and source typos like
  // rowspan="5“ / rowspan=2" all occur, so the bare form tolerates stray quote characters.
  // Two guards against exponential backtracking on a near-miss (a cell whose text merely
  // looks like attributes): the leading \s* sits outside the repeated group so it cannot
  // overlap the trailing one, and the value is matched atomically via (?=(…))\2 so the
  // quoted and bare alternatives — which both match "a" — cannot be retried against
  // each other. Group 2 is that lookahead; the attribute list stays group 1.
  const attrMatch = /^\s*((?:(?:rowspan|colspan|style|align|scope|class)\s*=\s*(?=("[^"]*"|'[^']*'|[^\s|]+))\2\s*)+)\|(?!\|)/i.exec(s)
  if (attrMatch) {
    const attrs = attrMatch[1]
    const r = /rowspan\s*=\s*["'“”]?(\d+)/i.exec(attrs)
    const c = /colspan\s*=\s*["'“”]?(\d+)/i.exec(attrs)
    if (r) rowspan = Number(r[1])
    if (c) colspan = Number(c[1])
    s = s.slice(attrMatch[0].length)
  }
  return { rowspan, colspan, content: s }
}

// Split a wikitable into an array of "rows", where each row is the raw text
// between `|-` separators (header/caption lines excluded by the caller).
export function splitTableRows(tableBody) {
  return tableBody
    .split(/\n\|-+[^\n]*\n/)
    .map(r => r.trim())
    .filter(Boolean)
}

// Split one raw row into its cell strings the way MediaWiki does: the row's
// leading '|' opens the first cell and '||' separates the rest (newline-'|' is
// normalised to '||' first), so a row written '||A||B' has TWO cells, A and B.
// Rows continuing a rowspan simply omit the spanned cell — parseRowGrid puts it back.
export function splitRowCells(row) {
  const normalised = row.replace(/\n!/g, '\n|').replace(/\n\|/g, '||').trim()
  return normalised.replace(/^\s*\|/, '').split('||').map(c => c.replace(/^\s*\|/, '').trim())
}

// Header, caption and table-opening lines carry no data.
export function isHeaderRow(row) {
  const trimmed = row.replace(/^\s+/, '')
  return trimmed.startsWith('!') || trimmed.startsWith('{|') || trimmed.startsWith('|+')
}

// Turn raw table rows into a rectangular grid, re-inserting cells held open by a
// rowspan= on any column (not just the first) and widening colspan= cells across
// the columns they cover. Each grid cell is { content, carried }, where `carried`
// marks a cell the row did not supply itself — callers need that to tell
// "this row named an actor" from "the actor spans down from above".
// Pass only data rows: header rows would corrupt the span bookkeeping.
export function parseRowGrid(rows) {
  const pending = [] // column index -> { content, left } for spans still open
  // Recomputed each iteration on purpose — it shrinks as this row consumes held cells.
  const spanEnd = () => { let n = 0; for (let i = 0; i < pending.length; i++) if (pending[i]) n = i + 1; return n }
  return rows.map((row) => {
    const cells = splitRowCells(row)
    const out = []
    let src = 0
    for (let col = 0; src < cells.length || col < spanEnd(); col++) {
      const held = pending[col]
      if (held) {
        out[col] = { content: held.content, carried: true }
        if (--held.left <= 0) pending[col] = null
        continue
      }
      const { rowspan, colspan, content } = parseCellAttrs(cells[src++] ?? '')
      for (let span = 0; span < colspan; span++) {
        if (span) col++
        out[col] = { content, carried: span > 0 }
        if (rowspan > 1) pending[col] = { content, left: rowspan - 1 }
      }
    }
    return out
  })
}

// Extract every 第N集 / 第N、M集 episode-number reference from a bio paragraph.
export function extractEpisodeRefs(text) {
  const nums = new Set()
  const re = /第([\d、，,]+)集/g
  let m
  while ((m = re.exec(text))) {
    for (const part of m[1].split(/[、，,]/)) {
      const n = Number(part)
      if (Number.isFinite(n) && n > 0) nums.add(n)
    }
  }
  return [...nums].sort((a, b) => a - b)
}

// Drop CJK/ASCII list punctuation (and whitespace) left dangling at either end
// after note/cleanup removal, e.g. "林淑敏；" -> "林淑敏", "David、" -> "David".
export function trimEdgePunct(s) {
  return (s || '').replace(/^[；;，,、。·\s]+|[；;，,、。·\s]+$/g, '')
}
