/** Index a list of entities by their `id`, the lookup every detail page builds. */
export const byId = <T extends { id: string }>(items: readonly T[]): ReadonlyMap<string, T> =>
  new Map(items.map(item => [item.id, item]))
