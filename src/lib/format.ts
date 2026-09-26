/**
 * Display formatting shared by every page.
 *
 * Kept pure and dependency-free so the same string is produced on the server
 * and on the client — a mismatch here is a hydration warning.
 */

const BYTE_UNITS = ["B", "KB", "MB", "GB", "TB", "PB"] as const;

export function formatBytes(
  value: string | number | null | undefined,
  options: { fallback?: string } = {},
): string {
  const fallback = options.fallback ?? "—";
  const bytes = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(bytes) || bytes < 0) return fallback;

  if (bytes < 1024) return `${Math.round(bytes)} B`;

  let amount = bytes;
  let unitIndex = 0;
  while (amount >= 1024 && unitIndex < BYTE_UNITS.length - 1) {
    amount /= 1024;
    unitIndex += 1;
  }

  const decimals = amount >= 100 ? 0 : amount >= 10 ? 0 : 1;
  return `${amount.toFixed(decimals)} ${BYTE_UNITS[unitIndex]}`;
}

function toDate(value: string | number | Date | null | undefined): Date | null {
  if (value === null || value === undefined || value === "") return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatDate(
  value: string | number | Date | null | undefined,
  options: { fallback?: string } = {},
): string {
  const date = toDate(value);
  if (!date) return options.fallback ?? "—";
  return date.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function formatDateTime(
  value: string | number | Date | null | undefined,
  options: { fallback?: string } = {},
): string {
  const date = toDate(value);
  if (!date) return options.fallback ?? "—";
  return date.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Short, human distance in time. Never renders "in 3 days" for future values
 * — future timestamps fall back to the absolute date, which is what an
 * operator reading a log actually needs.
 */
export function formatRelativeTime(
  value: string | number | Date | null | undefined,
  now: Date = new Date(),
  options: { fallback?: string } = {},
): string {
  const date = toDate(value);
  if (!date) return options.fallback ?? "—";

  const diffMs = now.getTime() - date.getTime();
  if (!Number.isFinite(diffMs) || diffMs < 0) {
    return formatDate(date, options);
  }

  const seconds = Math.floor(diffMs / 1000);
  if (seconds < 45) return "just now";
  if (seconds < 90) return "a minute ago";

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} minutes ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;

  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} day${days === 1 ? "" : "s"} ago`;

  return formatDate(date, options);
}

export function formatCount(
  value: number | string | null | undefined,
  options: { fallback?: string } = {},
): string {
  const count = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(count)) return options.fallback ?? "—";
  return Math.round(count).toLocaleString("en-IN");
}

const TEXT_EXTENSIONS: Record<string, string> = {
  pdf: "PDF",
  doc: "DOC",
  docx: "DOCX",
  xls: "XLS",
  xlsx: "XLSX",
  ppt: "PPT",
  pptx: "PPTX",
  txt: "TXT",
  rtf: "RTF",
  csv: "CSV",
  zip: "ZIP",
  rar: "RAR",
  "7z": "7Z",
  jpg: "JPG",
  jpeg: "JPG",
  png: "PNG",
  gif: "GIF",
  bmp: "BMP",
  tif: "TIF",
  tiff: "TIF",
  svg: "SVG",
  mp3: "MP3",
  mp4: "MP4",
  avi: "AVI",
  mov: "MOV",
};

/** Short, uppercase type token used for file rows and table cells. */
export function fileTypeLabel(
  name: string | null | undefined,
  mimeType?: string | null,
): string {
  const extension = (name ?? "").split(".").pop()?.toLowerCase() ?? "";
  if (extension && TEXT_EXTENSIONS[extension]) return TEXT_EXTENSIONS[extension];

  if (extension && extension.length <= 4) return extension.toUpperCase();

  if (mimeType) {
    const subtype = mimeType.split("/")[1]?.split(/[;+]/)[0];
    if (subtype) return subtype.toUpperCase().slice(0, 5);
  }

  return "FILE";
}

export function departmentLabel(slug: string | null | undefined): string | null {
  if (!slug) return null;
  const short = slug.replace(/-noticeboard$/, "");
  if (!short) return null;
  return short
    .split("-")
    .map((part) => (part.length <= 2 ? part.toUpperCase() : part.charAt(0).toUpperCase() + part.slice(1)))
    .join(" ");
}

export function truncate(value: string, max: number): string {
  if (value.length <= max) return value;
  return `${value.slice(0, Math.max(0, max - 1)).trimEnd()}…`;
}
