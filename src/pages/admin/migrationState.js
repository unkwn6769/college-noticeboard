const ACTIVE_MIGRATION_STATUSES = new Set([
  "pending",
  "running",
  "waiting_for_storage",
]);

export function isActiveMigrationStatus(status) {
  return ACTIVE_MIGRATION_STATUSES.has(String(status || "").toLowerCase());
}
