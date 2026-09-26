/**
 * The single status vocabulary.
 *
 * Every lifecycle value in the product (notice status, file state, storage
 * pressure, integrity severity, scanner outcome, user role) maps to exactly
 * one tone here, so no page can invent a second visual language for the same
 * state. A tone is a class suffix; colour alone is never the only signal —
 * each badge also carries a text label and, where useful, a dot.
 */

export type Tone = "neutral" | "info" | "success" | "warning" | "danger";

export type StatusDescriptor = {
  label: string;
  tone: Tone;
  /** Screen-reader / non-colour reinforcement. */
  hint?: string;
};

const FALLBACK: StatusDescriptor = { label: "Unknown", tone: "neutral" };

const NOTICE_STATUS: Record<string, StatusDescriptor> = {
  DRAFT: { label: "Draft", tone: "neutral", hint: "Not visible to the public" },
  PUBLISHED: { label: "Published", tone: "success", hint: "Visible on the public noticeboard" },
  ARCHIVED: { label: "Archived", tone: "warning", hint: "Withdrawn from the public noticeboard" },
  SCHEDULED: { label: "Scheduled", tone: "info" },
};

const FILE_STATE: Record<string, StatusDescriptor> = {
  STAGING: { label: "Staging", tone: "info", hint: "Uploaded, not yet published" },
  ACTIVE: { label: "Active", tone: "success", hint: "Published to storage" },
  QUARANTINED: { label: "Quarantined", tone: "warning", hint: "Withdrawn, recoverable" },
  PURGED: { label: "Purged", tone: "danger", hint: "Bytes deleted, not recoverable" },
};

const USER_STATUS: Record<string, StatusDescriptor> = {
  ACTIVE: { label: "Active", tone: "success" },
  DISABLED: { label: "Disabled", tone: "danger" },
  INVITED: { label: "Invited", tone: "info" },
};

const USER_ROLE: Record<string, StatusDescriptor> = {
  OWNER: { label: "Owner", tone: "info", hint: "Full control including user administration" },
  ADMIN: { label: "Admin", tone: "info", hint: "Manages notices, files and operations" },
  USER: { label: "User", tone: "neutral", hint: "Read-only notice access" },
};

/**
 * Role has a privilege ladder, not a health state, so it gets its own visual
 * ramp instead of borrowing the success/warning/danger semantics.
 */
export type RoleRank = "owner" | "admin" | "user";

export function roleRank(value: string | null | undefined): RoleRank {
  if (value === "OWNER") return "owner";
  if (value === "ADMIN") return "admin";
  return "user";
}

const PRESSURE: Record<string, StatusDescriptor> = {
  NORMAL: { label: "Normal", tone: "success" },
  WARNING: { label: "Warning", tone: "warning" },
  RESTRICTED: { label: "Restricted", tone: "danger" },
  EMERGENCY: { label: "Emergency", tone: "danger" },
};

const SEVERITY: Record<string, StatusDescriptor> = {
  error: { label: "Error", tone: "danger" },
  warning: { label: "Warning", tone: "warning" },
  info: { label: "Info", tone: "info" },
};

const SCANNER_RUN: Record<string, StatusDescriptor> = {
  PENDING: { label: "Pending", tone: "info" },
  RUNNING: { label: "Running", tone: "info" },
  COMPLETED: { label: "Completed", tone: "success" },
  FAILED: { label: "Failed", tone: "danger" },
  CANCELLED: { label: "Cancelled", tone: "neutral" },
};

const SCANNER_OUTCOME: Record<string, StatusDescriptor> = {
  NEW: { label: "New", tone: "info" },
  CHANGED: { label: "Changed", tone: "warning" },
  DUPLICATE: { label: "Duplicate", tone: "neutral" },
  UNCHANGED: { label: "Unchanged", tone: "neutral" },
  INVALID: { label: "Invalid", tone: "warning" },
  FAILED: { label: "Failed", tone: "danger" },
  MISSING: { label: "Missing", tone: "warning" },
  IMPORTED: { label: "Imported", tone: "success" },
  SKIPPED: { label: "Skipped", tone: "neutral" },
};

const AUDIT_EVENT: Record<string, StatusDescriptor> = {
  NOTICE_CREATE: { label: "Notice created", tone: "success" },
  NOTICE_UPDATE: { label: "Notice updated", tone: "info" },
  NOTICE_PUBLISH: { label: "Notice published", tone: "success" },
  NOTICE_ARCHIVE: { label: "Notice archived", tone: "warning" },
  NOTICE_DELETE: { label: "Notice deleted", tone: "danger" },
  NOTICE_RESTORE: { label: "Notice restored", tone: "info" },
  FILE_UPLOAD: { label: "File uploaded", tone: "success" },
  FILE_REPLACE: { label: "File replaced", tone: "info" },
  FILE_DELETE: { label: "File quarantined", tone: "warning" },
  FILE_RESTORE: { label: "File restored", tone: "success" },
  FILE_PURGE: { label: "File purged", tone: "danger" },
  FILE_QUARANTINE: { label: "File quarantined", tone: "warning" },
  USER_LOGIN: { label: "Sign-in", tone: "neutral" },
  USER_LOGOUT: { label: "Sign-out", tone: "neutral" },
  USER_CREATE: { label: "User created", tone: "success" },
  USER_UPDATE: { label: "User updated", tone: "info" },
  AUTHORIZATION_FAILURE: { label: "Authorisation failure", tone: "danger" },
  SCANNER_RUN: { label: "Scanner run", tone: "info" },
  SCANNER_IMPORT: { label: "Scanner import", tone: "info" },
  STORAGE_RECONCILE: { label: "Storage reconciliation", tone: "warning" },
};

function lookup(
  table: Record<string, StatusDescriptor>,
  value: string | null | undefined,
): StatusDescriptor {
  if (!value) return FALLBACK;
  return table[value] ?? { label: humanise(value), tone: "neutral" };
}

/** `LEGACY_IMPORT` -> `Legacy import`. Used for values with no explicit map. */
export function humanise(value: string): string {
  const cleaned = value.replace(/[_-]+/g, " ").trim();
  if (!cleaned) return FALLBACK.label;
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1).toLowerCase();
}

export const noticeStatus = (value: string | null | undefined) => lookup(NOTICE_STATUS, value);
export const fileState = (value: string | null | undefined) => lookup(FILE_STATE, value);
export const userStatus = (value: string | null | undefined) => lookup(USER_STATUS, value);
export const userRole = (value: string | null | undefined) => lookup(USER_ROLE, value);
export const storagePressure = (value: string | null | undefined) => lookup(PRESSURE, value);
export const severity = (value: string | null | undefined) => lookup(SEVERITY, value);
export const scannerRunStatus = (value: string | null | undefined) => lookup(SCANNER_RUN, value);
export const scannerOutcome = (value: string | null | undefined) => lookup(SCANNER_OUTCOME, value);
export const auditEvent = (value: string | null | undefined) => lookup(AUDIT_EVENT, value);

/**
 * Audit events are not exhaustive; an unmapped event is informational unless
 * its name says otherwise.
 */
export function auditTone(eventType: string | null | undefined): Tone {
  if (!eventType) return "neutral";
  if (eventType.includes("DELETE") || eventType.includes("PURGE") || eventType.includes("FAILURE")) {
    return "danger";
  }
  if (eventType.includes("ARCHIVE") || eventType.includes("QUARANTINE")) return "warning";
  if (eventType.includes("CREATE") || eventType.includes("PUBLISH") || eventType.includes("UPLOAD")) {
    return "success";
  }
  return "info";
}

export const AUDIT_EVENT_TYPES = Object.keys(AUDIT_EVENT).sort();
