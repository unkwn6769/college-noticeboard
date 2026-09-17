const intEnv = (name: string, fallback: number): number => {
  const raw = process.env[name];
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${name} must be a non-negative integer`);
  }
  return value;
};

export const config = {
  maxUploadBytes: intEnv("MAX_UPLOAD_BYTES", 512 * 1024 * 1024),
  largeUploadBytes: intEnv("LARGE_UPLOAD_BYTES", 50 * 1024 * 1024),
  storageReserveBytes: intEnv("STORAGE_RESERVE_BYTES", 2 * 1024 * 1024 * 1024),
  stagingRetentionHours: intEnv("STAGING_RETENTION_HOURS", 6),
  quarantineRetentionDays: intEnv("QUARANTINE_RETENTION_DAYS", 7),
  sessionTtlDays: intEnv("SESSION_TTL_DAYS", 7),
};
