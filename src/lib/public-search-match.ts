export function normalizePublicSearchQuery(value: string | undefined): string {
  return (value ?? "").trim().slice(0, 100);
}

export function matchesPublicSearch(
  values: Array<string | null | undefined>,
  query: string,
): boolean {
  const q = query.trim().toLocaleLowerCase();
  if (!q) return false;
  return values.some((value) => value?.toLocaleLowerCase().includes(q));
}
