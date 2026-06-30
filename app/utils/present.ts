/** Type guard for `.filter()` that narrows out null/undefined (unlike `Boolean`). */
export const isPresent = <T>(x: T): x is NonNullable<T> => x != null
