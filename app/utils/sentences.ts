/**
 * Joins meta-description clauses into one run of sentences.
 *
 * Clauses come from mixed sources — hand-written copy, a wiki 簡介, a character
 * bio — and some already end in 。, so a naive join yields 「…之間的故事。。」.
 * Each clause is trimmed of trailing punctuation before the joiner goes in.
 */
export function sentences(parts: (string | false | null | undefined)[]): string {
  const clauses = parts
    .filter(p => typeof p === 'string' && p.length > 0)
    .map(p => (p as string).replace(/[。，、\s]+$/, ''))
    .filter(Boolean)
  return clauses.length ? `${clauses.join('。')}。` : ''
}

/**
 * Shortens a meta description to about what a result snippet shows.
 *
 * Google cuts a CJK snippet off at roughly 150 characters wherever it lands, so
 * this cuts first, on the last clause break that fits — a bio is a run of
 * 「；」-separated facts, and half of one reads worse than one fewer.
 */
export function clip(text: string, max = 150): string {
  if (text.length <= max) return text
  const head = text.slice(0, max - 1)
  const cut = Math.max(head.lastIndexOf('；'), head.lastIndexOf('。'), head.lastIndexOf('，'))
  return `${(cut > max / 2 ? head.slice(0, cut) : head).replace(/[；。，、\s]+$/, '')}…`
}
