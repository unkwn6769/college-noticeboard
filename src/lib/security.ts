export function assertUuid(value: string): void {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    throw new Error("Invalid ID");
  }
}

export function sanitizeFilename(value: string): string {
  const normalized = value
    .normalize("NFKC")
    .replaceAll("/", "_")
    .replaceAll(String.fromCharCode(0), "_")
    .replaceAll("\r", "_")
    .replaceAll("\n", "_")
    .trim();
  if (!normalized || normalized.length > 255) throw new Error("Invalid filename");
  return normalized;
}

export function normalizeMimeType(value: string | null): string {
  const mime = (value ?? "application/octet-stream").split(";", 1)[0].trim().toLowerCase();
  return /^[a-z0-9][a-z0-9!#$&^_.+-]*\/[a-z0-9][a-z0-9!#$&^_.+-]*$/.test(mime)
    ? mime
    : "application/octet-stream";
}

export function assertSameOrigin(request: Request): void {
  const origin = request.headers.get("origin");
  if (!origin) return;
  if (origin !== new URL(request.url).origin) throw new Error("Origin check failed");
}
