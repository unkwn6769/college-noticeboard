import { NextResponse } from "next/server";
import { requireAdmin } from "@/src/lib/auth/session";
import { assertSameOrigin, assertUuid } from "@/src/lib/security";
import { withTransaction, getDbPool } from "@/src/lib/db/pool";
import { audit } from "@/src/lib/audit";
import { getStorageEngine, STORAGE_ROOT } from "@/src/lib/storage/engine";
import { purgeFileBytes } from "@/src/lib/file-purge";
import { jsonError, publicErrorMessage } from "@/src/lib/http";
import { promises as fs } from "node:fs";
import path from "node:path";

export const runtime = "nodejs";

function activeObjectPath(storageKey: string): string {
  return path.join(STORAGE_ROOT, "files", storageKey.slice(0, 2).toLowerCase(), storageKey, "object");
}

function activeObjectDir(storageKey: string): string {
  return path.join(STORAGE_ROOT, "files", storageKey.slice(0, 2).toLowerCase(), storageKey);
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    assertSameOrigin(request);
    const user = await requireAdmin();
    const { id } = await context.params;
    try { assertUuid(id); } catch { return jsonError("Invalid file ID", 400); }

    const engine = getStorageEngine();
    const pool = getDbPool();

    // 1. Initial lock and check
    const checkResult = await pool.query<{ storage_key: string; state: string }>(
      `SELECT storage_key, state FROM files WHERE id=$1`,
      [id],
    );
    const row = checkResult.rows[0];

    if (!row) return jsonError("File not found", 404);
    if (row.state !== "QUARANTINED") return jsonError("File is not quarantined", 409);

    const quarantinePath = await engine.findQuarantineObject(row.storage_key);
    if (!quarantinePath) {
      return jsonError("Quarantine object no longer on disk — file cannot be restored. It may have already been purged.", 409);
    }

    const dir = activeObjectDir(row.storage_key);
    const objectPath = activeObjectPath(row.storage_key);

    // 2. Perform FS move BEFORE DB transaction (idempotent path)
    await fs.mkdir(dir, { recursive: true });
    await fs.rename(quarantinePath, objectPath);

    // 3. Perform DB Transaction
    try {
      await withTransaction(async (client) => {
        // Re-check state under lock
        const lockResult = await client.query<{ state: string }>(
          `SELECT state FROM files WHERE id=$1 FOR UPDATE`, [id]
        );
        const lockedRow = lockResult.rows[0];

        if (lockedRow.state !== "QUARANTINED") {
          throw new Error("STATE_CHANGED");
        }

        await client.query(
          `UPDATE cleanup_operations SET status='COMPLETED', completed_at=NOW()
            WHERE file_id=$1 AND operation_type='QUARANTINE' AND status IN ('PENDING','FAILED')`,
          [id],
        );

        await client.query(`UPDATE files SET state='ACTIVE', updated_at=NOW() WHERE id=$1`, [id]);
        await audit("FILE_RESTORED", user.id, "file", id, { storageKey: row.storage_key }, client);
      });
    } catch (dbError) {
      // 4. FS Rollback if DB failed
      await fs.rename(objectPath, quarantinePath).catch(() => {});
      throw dbError;
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return jsonError("Unauthorized", 401);
    if (error instanceof Error && error.message === "STATE_CHANGED") return jsonError("File state changed during restore", 409);
    return jsonError(publicErrorMessage(error, "The file could not be restored."), 400);
  }
}

// Permanently purge a quarantined file.
export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    assertSameOrigin(request);
    const user = await requireAdmin();
    const { id } = await context.params;
    try { assertUuid(id); } catch { return jsonError("Invalid file ID", 400); }

    const engine = getStorageEngine();
    const pool = getDbPool();

    const checkResult = await pool.query<{ storage_key: string; state: string; original_name: string }>(
      `SELECT storage_key, state, original_name FROM files WHERE id=$1`,
      [id],
    );
    const row = checkResult.rows[0];

    if (!row) return jsonError("File not found", 404);
    if (row.state !== "QUARANTINED") return jsonError("File is not quarantined", 409);

    // 1. FS Operation (Idempotent: if it fails halfway, we can retry)
    // A permanent purge must destroy every byte still owned by the file: the
    // current object plus any superseded version object whose quarantine has
    // not been materialised yet. Marking those cleanup operations complete
    // without removing their bytes would strand live objects in active storage.
    const ownedKeys = await pool.query<{ storage_key: string }>(
      `SELECT storage_key FROM file_versions WHERE file_id=$1
        UNION
       SELECT storage_key FROM cleanup_operations
        WHERE file_id=$1 AND status IN ('PENDING','RUNNING','FAILED')`,
      [id],
    );
    for (const key of new Set([row.storage_key, ...ownedKeys.rows.map((r) => r.storage_key)])) {
      await purgeFileBytes(engine, key);
    }

    // 2. DB Transaction
    let alreadyHandled = false;
    await withTransaction(async (client) => {
      const lockResult = await client.query<{ state: string }>(
        `SELECT state FROM files WHERE id=$1 FOR UPDATE`, [id]
      );
      const lockedRow = lockResult.rows[0];

      if (lockedRow.state !== "QUARANTINED") {
        // A concurrent request already purged this file; report the same
        // conflict the sequential path reports instead of a false success.
        alreadyHandled = true;
        return;
      }

      await client.query(
        `UPDATE cleanup_operations SET status='COMPLETED', completed_at=NOW()
          WHERE file_id=$1 AND status IN ('PENDING','RUNNING')`,
        [id],
      );

      await client.query(`UPDATE files SET state='PURGED', updated_at=NOW() WHERE id=$1`, [id]);
      await audit(
        "FILE_PURGED",
        user.id,
        "file",
        id,
        { storageKey: row.storage_key, originalName: row.original_name },
        client,
      );
    });

    if (alreadyHandled) return jsonError("File is not quarantined", 409);
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return jsonError("Unauthorized", 401);
    return jsonError(publicErrorMessage(error, "The file could not be purged."), 400);
  }
}
