/**
 * Removes the synthetic department root that prefixes imported legacy paths.
 *
 * Legacy provenance remains stored unchanged; this helper only defines which
 * path portion is meaningful for archive search. If the provenance does not
 * begin with the recorded department root, leave it untouched rather than
 * guessing about malformed data.
 */
export function getMeaningfulLegacyPath(
  legacyRelativePath: string | null | undefined,
  legacyDepartment: string | null | undefined,
): string {
  if (!legacyRelativePath || !legacyDepartment) return legacyRelativePath ?? "";

  const prefix = `${legacyDepartment}/`;
  return legacyRelativePath.startsWith(prefix)
    ? legacyRelativePath.slice(prefix.length)
    : legacyRelativePath;
}
