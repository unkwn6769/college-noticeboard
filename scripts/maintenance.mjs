import { readdir, lstat, rename, unlink, statfs, mkdir, access, open } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import { createHash, randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import path from "node:path";
import pg from "pg";

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
const ROOT = process.env.NOTICEBOARD_STORAGE_ROOT ?? "/srv/noticeboard";
const RETENTION_DAYS = Number(process.env.QUARANTINE_RETENTION_DAYS ?? 7);
const STAGING_HOURS = Number(process.env.STAGING_RETENTION_HOURS ?? 6);
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 2 });

const filesRoot = path.join(ROOT, "files");
const stagingRoot = path.join(ROOT, "staging");
const quarantineRoot = path.join(ROOT, "quarantine", "objects");
const quarantinePartialRoot = path.join(ROOT, "quarantine", "partials");

await Promise.all([
  mkdir(filesRoot, { recursive: true }),
  mkdir(stagingRoot, { recursive: true }),
  mkdir(quarantineRoot, { recursive: true }),
  mkdir(quarantinePartialRoot, { recursive: true }),
]);

const keyPattern = (value) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
const objectPath = (key) => { if (!keyPattern(key)) throw new Error("Invalid storage key"); return path.join(filesRoot, key.slice(0, 2).toLowerCase(), key, "object"); };
const quarantinePath = (key) => { if (!keyPattern(key)) throw new Error("Invalid storage key"); return path.join(quarantineRoot, `${key}.quarantined`); };

async function isRegular(p) {
  try {
    const i = await lstat(p);
    return i.isFile();
  } catch (e) {
    if (e?.code === "ENOENT") return false;
    throw e;
  }
}

async function fsyncDirectory(dir) {
  const h = await open(dir, fsConstants.O_RDONLY);
  try { await h.sync(); } finally { await h.close(); }
}

async function audit(eventType, metadata = {}) {
  await pool.query(
    `INSERT INTO audit_events (actor_user_id,event_type,metadata) VALUES (NULL,$1,$2::jsonb)`,
    [eventType, JSON.stringify(metadata)],
  );
}

async function verifyObject(pathname, expectedSize, expectedSha256Hex) {
  const info = await lstat(pathname);
  if (!info.isFile() || info.size !== Number(expectedSize)) return false;
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(pathname)) hash.update(chunk);
  return hash.digest("hex") === expectedSha256Hex;
}

// Recover pending/failed logical cleanup operations first.
const pending = await pool.query(`SELECT id,file_id,operation_type,status,storage_key FROM cleanup_operations WHERE status IN ('PENDING','FAILED') ORDER BY created_at ASC LIMIT 200`);
for (const row of pending.rows) {
  try {
    if (row.operation_type !== "QUARANTINE") continue;
    const src = objectPath(row.storage_key);
    const dst = quarantinePath(row.storage_key);
    const sourceExists = await isRegular(src);
    const destinationExists = await isRegular(dst);

    if (sourceExists && destinationExists) {
      await pool.query(`UPDATE cleanup_operations SET status='FAILED',error_message=$2 WHERE id=$1`, [row.id, "Both active and quarantine objects exist"]);
      await audit("QUARANTINE_AMBIGUITY", { storageKey: row.storage_key, fileId: row.file_id });
      continue;
    }

    if (destinationExists) {
      await pool.query(`UPDATE cleanup_operations SET status='COMPLETED',error_message=NULL,completed_at=NOW() WHERE id=$1`, [row.id]);
      continue;
    }

    if (!sourceExists) {
      await pool.query(`UPDATE cleanup_operations SET status='FAILED',error_message=$2 WHERE id=$1`, [row.id, "Source object missing and quarantine object absent"]);
      continue;
    }

    await rename(src, dst);
    await fsyncDirectory(path.dirname(src));
    await fsyncDirectory(quarantineRoot);
    await pool.query(`UPDATE cleanup_operations SET status='COMPLETED',error_message=NULL,completed_at=NOW() WHERE id=$1`, [row.id]);
    await audit("FILE_QUARANTINED", { storageKey: row.storage_key, fileId: row.file_id });
  } catch (error) {
    await pool.query(`UPDATE cleanup_operations SET status='FAILED',error_message=$2 WHERE id=$1`, [row.id, error instanceof Error ? error.message : "unknown"]);
  }
}

// Move old abandoned staging files to quarantine/partials; never directly delete them.
const stagingCutoff = Date.now() - STAGING_HOURS * 3600_000;
for (const name of await readdir(stagingRoot)) {
  if (!name.endsWith(".partial")) continue;
  const full = path.join(stagingRoot, name);
  const info = await lstat(full);
  if (info.isFile() && info.mtimeMs < stagingCutoff) {
    const target = path.join(quarantinePartialRoot, `${name}-${randomUUID()}`);
    try {
      await rename(full, target);
      await fsyncDirectory(stagingRoot);
      await fsyncDirectory(quarantinePartialRoot);
      await audit("STAGING_QUARANTINED", { name, reason: "expired" });
    } catch {}
  }
}

// Reconcile filesystem objects against all authoritative DB storage keys.
const dbKeys = new Set();
const knownRows = [
  await pool.query(`SELECT storage_key FROM files`),
  await pool.query(`SELECT storage_key FROM file_versions`),
];
for (const result of knownRows) for (const row of result.rows) dbKeys.add(row.storage_key);

let orphanCount = 0;
let missingActiveCount = 0;
let corruptCount = 0;
const objectPaths = [];

for (const shard of await readdir(filesRoot, { withFileTypes: true })) {
  if (!shard.isDirectory() || !/^[0-9a-f]{2}$/i.test(shard.name)) continue;
  const sd = path.join(filesRoot, shard.name);
  for (const dir of await readdir(sd, { withFileTypes: true })) {
    if (!dir.isDirectory() || !keyPattern(dir.name)) continue;
    const obj = path.join(sd, dir.name, "object");
    if (await isRegular(obj)) objectPaths.push(obj);
  }
}

for (const obj of objectPaths) {
  const key = path.basename(path.dirname(obj));
  if (!dbKeys.has(key)) {
    orphanCount++;
    await audit("ORPHAN_OBJECT", { storageKey: key, path: obj });
  }
}

const active = await pool.query(`SELECT id,storage_key,size_bytes,encode(sha256,'hex') AS sha256 FROM files WHERE state='ACTIVE'`);
const objectKeySet = new Set(objectPaths.map((p) => path.basename(path.dirname(p))));
for (const row of active.rows) {
  if (!objectKeySet.has(row.storage_key)) {
    missingActiveCount++;
    await audit("MISSING_ACTIVE_OBJECT", { fileId: row.id, storageKey: row.storage_key });
    continue;
  }
  const obj = objectPath(row.storage_key);
  if (!await verifyObject(obj, row.size_bytes, row.sha256)) {
    corruptCount++;
    await audit("CORRUPT_ACTIVE_OBJECT", { fileId: row.id, storageKey: row.storage_key });
  }
}

// Retention-based purge with explicit PURGE operations.
const cutoff = Date.now() - RETENTION_DAYS * 86400_000;
for (const name of await readdir(quarantineRoot)) {
  if (!name.endsWith(".quarantined")) continue;
  const full = path.join(quarantineRoot, name);
  const info = await lstat(full);
  if (!info.isFile() || info.mtimeMs > cutoff) continue;
  const key = name.slice(0, -".quarantined".length);
  if (!keyPattern(key)) continue;

  const existing = await pool.query(`SELECT id,status,file_id FROM cleanup_operations WHERE operation_type='PURGE' AND storage_key=$1 ORDER BY created_at DESC LIMIT 1`, [key]);
  let op = existing.rows[0];
  if (!op) {
    const file = await pool.query(`SELECT id FROM files WHERE storage_key=$1 LIMIT 1`, [key]);
    const opId = randomUUID();
    await pool.query(`INSERT INTO cleanup_operations(id,file_id,operation_type,status,storage_key) VALUES($1,$2,'PURGE','PENDING',$3)`, [opId, file.rows[0]?.id ?? null, key]);
    op = { id: opId, status: "PENDING", file_id: file.rows[0]?.id ?? null };
  }

  try {
    if (op.status === "COMPLETED") continue;
    if (await isRegular(full)) {
      await unlink(full);
      await fsyncDirectory(quarantineRoot);
    }
    await pool.query(`UPDATE cleanup_operations SET status='COMPLETED',error_message=NULL,completed_at=NOW() WHERE id=$1`, [op.id]);
    if (op.file_id) {
      await pool.query(`UPDATE files SET state='PURGED',updated_at=NOW() WHERE id=$1 AND state='QUARANTINED' AND storage_key=$2`, [op.file_id, key]);
    }
    await audit("FILE_PURGED", { storageKey: key, fileId: op.file_id });
  } catch (error) {
    await pool.query(`UPDATE cleanup_operations SET status='FAILED',error_message=$2 WHERE id=$1`, [op.id, error instanceof Error ? error.message : "unknown"]);
    await audit("PURGE_FAILURE", { storageKey: key, error: error instanceof Error ? error.message : "unknown" });
  }
}

await access(ROOT, fsConstants.W_OK);
const fsStats = await statfs(ROOT);
const totalBytes = Number(fsStats.blocks) * Number(fsStats.bsize);
const freeBytes = Number(fsStats.bavail) * Number(fsStats.bsize);
const usedBytes = Math.max(0, totalBytes - freeBytes);
const usagePercent = totalBytes ? usedBytes / totalBytes * 100 : 100;
const pressure = usagePercent >= 95 ? "EMERGENCY" : usagePercent >= 90 ? "RESTRICTED" : usagePercent >= 80 ? "WARNING" : "NORMAL";

console.log(JSON.stringify({ disk: { totalBytes, freeBytes, usagePercent, pressure }, orphanCount, missingActiveCount, corruptCount }));
await pool.end();
