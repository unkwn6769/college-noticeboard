/**
 * Escapes a user-supplied value for use inside a SQL `LIKE`/`ILIKE` pattern.
 *
 * Without escaping, `%` and `_` from a search box are treated as wildcards, so a
 * query of `%` matches every row. The returned value must always be paired with
 * an explicit `ESCAPE '\'` clause in the query text.
 */
export function escapeLikePattern(value: string): string {
  return value
    .replaceAll("\\", "\\\\")
    .replaceAll("%", "\\%")
    .replaceAll("_", "\\_");
}

/** The SQL fragment that must accompany an escaped LIKE pattern. */
export const LIKE_ESCAPE_CLAUSE = String.raw`ESCAPE '\'`;
