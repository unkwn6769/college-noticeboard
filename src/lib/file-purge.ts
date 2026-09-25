import type { StorageEngine } from "./storage/engine";

function isMissing(error: unknown): boolean {
  return error instanceof Error && "code" in error && (error as { code?: string }).code === "ENOENT";
}

/**
 * Physically destroy the bytes owned by one storage key of a file that is
 * already logically quarantined.
 *
 * Deletion quarantines before purge, so a purge normally finds the object in
 * quarantine. If the logical delete has not been materialised on disk yet the
 * bytes are still in the active object area: they are quarantined first so a
 * purge can never report success while leaving live bytes in active storage.
 *
 * Absent bytes are treated as already destroyed, so concurrent or repeated
 * purges of the same key stay idempotent instead of surfacing ENOENT.
 */
export async function purgeFileBytes(engine: StorageEngine, storageKey: string): Promise<boolean> {
  const quarantinePath = await engine.findQuarantineObject(storageKey);
  if (!quarantinePath) {
    const quarantined = await engine.quarantine(storageKey).catch((error) => (isMissing(error) ? null : Promise.reject(error)));
    if (!quarantined) return false;
    return destroy(engine, quarantined);
  }
  return destroy(engine, quarantinePath);
}

async function destroy(engine: StorageEngine, quarantinePath: string): Promise<boolean> {
  try {
    await engine.purgeQuarantine(quarantinePath);
    return true;
  } catch (error) {
    // A concurrent purge of the same key already removed the bytes.
    if (isMissing(error)) return false;
    throw error;
  }
}
