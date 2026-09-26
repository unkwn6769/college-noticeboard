import { NextResponse } from "next/server";

export function jsonError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status, headers: { "Cache-Control": "no-store" } });
}

export async function jsonBody<T>(request: Request): Promise<T> {
  try { return (await request.json()) as T; }
  catch { throw new Error("Invalid JSON body"); }
}

/**
 * Internal failure codes used by the domain layer. They are stable identifiers,
 * not sentences, and must never be shown to a user verbatim.
 */
const ERROR_CODE_MESSAGES: Record<string, string> = {
  NOTICE_NOT_FOUND: "Notice not found.",
  NOTICE_NOT_FOUND_OR_PUBLISHED: "This notice is already published, or it no longer exists.",
  NOTICE_NOT_IN_RECYCLE_BIN: "This notice is not in the recycle bin.",
  FILE_NOT_FOUND: "File not found.",
  FILE_NOT_ACTIVE: "This file is not active and cannot be changed.",
  FILE_NOT_DELETABLE: "This file cannot be deleted in its current state.",
  NOTICE_ATTACHMENT_ALREADY_EXISTS: "This file is already attached to the notice.",
  INVALID_DEPARTMENT: "Unknown department.",
  STATE_CHANGED: "The record changed while the operation was running. Reload and try again.",
  UNAUTHORIZED: "You are not authorized to perform this action.",
  INVALID_ID: "Invalid identifier.",
  INVALID_FILENAME: "Invalid filename.",
  INVALID_ARCHIVE_PATH: "Invalid archive path.",
};

/**
 * Validation messages that are already written for humans. Anything outside
 * this list (driver errors, constraint names, stack-derived text) is replaced
 * with the caller-supplied fallback.
 */
const SAFE_MESSAGES = new Set([
  "Invalid JSON body",
  "Invalid ID",
  "Invalid filename",
  "Invalid upload size",
  "Upload exceeds configured maximum",
  "Request body is required",
  "Invalid department",
  "Invalid archive path",
  "Title and body are required",
  "Password must contain at least 10 characters",
  "Origin check failed",
  "fileId is required",
  "Protected account operation",
]);

/**
 * Converts any thrown value into a message that is safe to render in the UI.
 * Authorization and validation remain server-side; this only controls what the
 * client is told.
 */
export function publicErrorMessage(error: unknown, fallback: string): string {
  if (error && typeof error === "object" && "code" in error) {
    const code = String((error as { code: unknown }).code);
    if (ERROR_CODE_MESSAGES[code]) return ERROR_CODE_MESSAGES[code];
    return fallback;
  }
  if (!(error instanceof Error)) return fallback;
  const message = error.message;
  if (ERROR_CODE_MESSAGES[message]) return ERROR_CODE_MESSAGES[message];
  if (SAFE_MESSAGES.has(message)) return message;
  return fallback;
}

/**
 * An authorization failure is not a client mistake, and reporting it as 400
 * makes a rejected request indistinguishable from a malformed one to anything
 * reading status codes — including the monitoring that tells an operator
 * whether a route is being probed. `requireAdmin` and `requireOwner` both throw
 * `UNAUTHORIZED`; a route passes its own 403 for a role check it performs
 * itself, because "not signed in" and "role insufficient" are different facts.
 */
export function authorizationErrorStatus(error: unknown, fallback: number): number {
  const code =
    error && typeof error === "object" && "code" in error
      ? String((error as { code: unknown }).code)
      : error instanceof Error
        ? error.message
        : "";
  return code === "UNAUTHORIZED" || code === "FORBIDDEN" ? 401 : fallback;
}
