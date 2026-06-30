// Small, dependency-free helpers for turning MediaWiki wikitext into clean data.

// Strip inline wiki/HTML markup from a fragment, leaving readable plain text.
// Keeps the *display* text of links and templates like {{box|名}}.
export function cleanText(s) {
  if (!s) return ''
  return s
    .replace(/<ref[^>]*\/>/g, '')
    .replace(/<ref[^>]*>[\s\S]*?<\/ref>/g, '')
    .replace(/<!--[\s\S]*?-->/g, '')
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
  // attributes appear before the first lone '|' (templates use '||' / '}}', not single attr '|')
  const attrMatch = /^((?:\s*(?:rowspan|colspan|style|align|scope|class)\s*=\s*"[^"]*"\s*)+)\|(?!\|)/i.exec(s)
  if (attrMatch) {
    const attrs = attrMatch[1]
    const r = /rowspan\s*=\s*"(\d+)"/i.exec(attrs)
    const c = /colspan\s*=\s*"(\d+)"/i.exec(attrs)
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

// Split one raw row into its cell strings. Data cells start with '|' and are
// separated by '||' (or by newline-'|', which we normalise to '||' first).
// We split on '||' first, then strip the leading row/cell '|' from each piece —
// this correctly yields an empty leading cell for rowspan-continuation rows that
// begin with '||' (a convention used in the character tables).
export function splitRowCells(row) {
  const normalised = row.replace(/\n!/g, '\n|').replace(/\n\|/g, '||').trim()
  return normalised.split('||').map(c => c.replace(/^\s*\|/, '').trim())
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
