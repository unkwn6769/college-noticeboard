/**
 * Verifies every ACTIVE file row against the bytes on the authoritative volume.
 *
 * The database stores each object's size and SHA-256, so the corpus is
 * self-describing: this command proves that what the database believes is
 * stored is actually stored, byte for byte, with nothing missing. It is the
 * precondition for using a database restore together with the existing corpus,
 * and it is the check that turns "the volume looks fine" into evidence.
 *
 * Read-only. It never writes, moves, renames or deletes anything, and it opens
 * each object for reading only. Run it as the storage owner:
 *
 *   sudo -u college-noticeboard node scripts/verify-corpus.mjs
 *
 * Options (environment):
 *   SAMPLE=<n>          verify only the first n rows (default: all)
 *   CORPUS_STRICT=1     exit non-zero if any row fails to verify
 */
import { createHash } from "node:crypto";
import { lstat } from "node:fs/promises";
import { openSync, readSync, closeSync } from "node:fs";
import path from "node:path";
import pg from "pg";

const STORAGE_ROOT = process.env.NOTICEBOARD_STORAGE_ROOT ?? "/srv/noticeboard";
const FILES_ROOT = path.join(STORAGE_ROOT, "files");
const QUARANTINE_ROOT = path.join(STORAGE_ROOT, "quarantine", "objects");
const SAMPLE = Number(process.env.SAMPLE ?? 0);
const STRICT = process.env.CORPUS_STRICT === "1";
const STORAGE_KEY_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");

function objectPath(key) {
  if (!STORAGE_KEY_PATTERN.test(key)) return null;
  return path.join(FILES_ROOT, key.slice(0, 2).toLowerCase(), key, "object");
}
function quarantinePath(key) {
  if (!STORAGE_KEY_PATTERN.test(key)) return null;
  return path.join(QUARANTINE_ROOT, `${key}.quarantined`);
}

async function isRegularFile(pathname) {
  try { const info = await lstat(pathname); return info.isFile() && !info.isSymbolicLink(); }
  catch { return false; }
}

function sha256Of(pathname, sizeBytes) {
  const fd = openSync(pathname, "r");
  try {
    const hash = createHash("sha256");
    const buffer = Buffer.allocUnsafe(1 << 20);
    let read = 0;
    while (read < sizeBytes) {
      const n = readSync(fd, buffer, 0, Math.min(buffer.length, sizeBytes - read), read);
      if (n <= 0) break;
      hash.update(buffer.subarray(0, n));
      read += n;
    }
    return hash.digest("hex");
  } finally { closeSync(fd); }
}

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 2 });
const limit = SAMPLE > 0 ? ` LIMIT ${SAMPLE}` : "";
const { rows } = await pool.query(
  `SELECT storage_key, size_bytes::text AS size, encode(sha256,'hex') AS sha, original_name
     FROM files WHERE state='ACTIVE' AND storage_key IS NOT NULL
    ORDER BY storage_key${limit}`,
);
const { rows: [totalRow] } = await pool.query(
  `SELECT count(*)::text AS n FROM files WHERE state='ACTIVE' AND storage_key IS NOT NULL`,
);

const missing = [];
const sizeMismatch = [];
const hashMismatch = [];
const unreadable = [];
let verified = 0;
let verifiedBytes = 0;

for (const row of rows) {
  const expectedSize = Number(row.size);
  const target = objectPath(row.storage_key);
  if (!target) { missing.push({ name: row.original_name, reason: "invalid storage key" }); continue; }
  if (!await isRegularFile(target)) {
    // Distinguish "gone" from "moved to quarantine", which maintenance does.
    const quarantined = await isRegularFile(quarantinePath(row.storage_key));
    missing.push({ name: row.original_name, reason: quarantined ? "quarantined but row still ACTIVE" : "object not present" });
    continue;
  }
  const info = await lstat(target);
  if (info.size !== expectedSize) {
    sizeMismatch.push({ name: row.original_name, onDisk: info.size, inDatabase: expectedSize });
    continue;
  }
  try {
    if (sha256Of(target, expectedSize) !== row.sha) {
      hashMismatch.push({ name: row.original_name });
      continue;
    }
  } catch (error) {
    unreadable.push({ name: row.original_name, code: error?.code ?? "unknown" });
    continue;
  }
  verified += 1;
  verifiedBytes += expectedSize;
}

await pool.end();

const problems = missing.length + sizeMismatch.length + hashMismatch.length + unreadable.length;
console.log(JSON.stringify({
  storageRoot: STORAGE_ROOT,
  activeRows: Number(totalRow.n),
  checked: rows.length,
  verified,
  verifiedBytes,
  missing: missing.length,
  sizeMismatch: sizeMismatch.length,
  hashMismatch: hashMismatch.length,
  unreadable: unreadable.length,
  consistent: problems === 0,
}, null, 2));

if (problems > 0) {
  const show = (label, list) => { if (list.length) { console.error(`${label}:`); for (const item of list.slice(0, 20)) console.error("  " + JSON.stringify(item)); } };
  show("missing", missing);
  show("size mismatch", sizeMismatch);
  show("sha256 mismatch", hashMismatch);
  show("unreadable", unreadable);
}

if (STRICT && problems > 0) process.exit(1);
