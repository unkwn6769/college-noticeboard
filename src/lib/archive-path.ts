export function normalizeArchivePath(value: string | undefined): string {
  const raw = (value ?? "").trim().replace(/^\/+|\/+$/g, "");
  if (!raw) return "";
  if (raw.length > 1000) throw new Error("Invalid archive path");

  const segments = raw.split("/");
  for (const segment of segments) {
    if (
      !segment ||
      segment === "." ||
      segment === ".." ||
      segment.includes("\\") ||
      segment.includes(String.fromCharCode(0))
    ) {
      throw new Error("Invalid archive path");
    }
  }
  return segments.join("/");
}
