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
