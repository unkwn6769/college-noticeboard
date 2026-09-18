export type PublicDownloadFile = {
  state: "ACTIVE" | "STAGING" | "QUARANTINED" | "PURGED";
  origin_type: "USER_UPLOAD" | "LEGACY_IMPORT";
};

export type DownloadActor = {
  role: "USER" | "ADMIN" | "OWNER";
} | null;

export type DownloadPermission = "PUBLIC" | "ADMIN" | "DENIED";

/**
 * Explicit public-download policy:
 * - ACTIVE legacy-import files are public-downloadable.
 * - ACTIVE user uploads are not public-downloadable.
 * - non-active files are never downloadable through the public file endpoint.
 */
export function canPubliclyDownload(file: PublicDownloadFile): boolean {
  return file.state === "ACTIVE" && file.origin_type === "LEGACY_IMPORT";
}

export function getDownloadPermission(
  file: PublicDownloadFile,
  actor: DownloadActor,
): DownloadPermission {
  if (canPubliclyDownload(file)) return "PUBLIC";

  if (
    file.state === "ACTIVE" &&
    actor !== null &&
    (actor.role === "ADMIN" || actor.role === "OWNER")
  ) {
    return "ADMIN";
  }

  return "DENIED";
}
