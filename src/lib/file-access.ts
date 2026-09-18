export type PublicDownloadFile = {
  state: "ACTIVE" | "STAGING" | "QUARANTINED" | "PURGED";
  origin_type: "USER_UPLOAD" | "LEGACY_IMPORT";
};

export function canPubliclyDownload(file: PublicDownloadFile): boolean {
  return file.state === "ACTIVE" && file.origin_type === "LEGACY_IMPORT";
}
