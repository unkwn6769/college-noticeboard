/**
 * Small text helpers shared by public filtering surfaces. Pure functions so
 * they can be unit-tested without a DOM.
 */

export function normaliseText(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

/**
 * Case-insensitive "contains any of the terms" match, so "cs cse" and
 * "exam" both behave the way a visitor expects. An empty query matches
 * everything, which keeps callers free of a special case.
 */
export function matchesText(
  haystack: Array<string | null | undefined>,
  query: string,
): boolean {
  const terms = normaliseText(query).split(/\s+/).filter(Boolean);
  if (terms.length === 0) return true;
  const target = haystack.map(normaliseText).join(" ");
  return terms.some((term) => target.includes(term));
}

/** Lowercases the query for a URL. */
export function normalizeQuery(value: string | null | undefined): string {
  return (value ?? "").trim().slice(0, 100);
}
