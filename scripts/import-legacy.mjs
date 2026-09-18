#!/usr/bin/env node

import { createReadStream, createWriteStream, constants as fsConstants } from "node:fs";
import { access, mkdir, open, lstat, rename, unlink } from "node:fs/promises";
import path from "node:path";
import { randomUUID, createHash } from "node:crypto";
import { Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { createInterface } from "node:readline";
import pg from "pg";

const { Client } = pg;

const STORAGE_ROOT = process.env.NOTICEBOARD_STORAGE_ROOT ?? "/srv/noticeboard";
const LEGACY_ROOT = path.join(STORAGE_ROOT, "staging", "legacy-noticeboards");
const LEGACY_OBJECTS_ROOT = path.join(LEGACY_ROOT, "objects");
const DEFAULT_INPUT = path.join(LEGACY_ROOT, "legacy-import-dry-run.jsonl");
const IMPORT_STAGING_ROOT = path.join(STORAGE_ROOT, "staging", "legacy-import");
const FILES_ROOT = path.join(STORAGE_ROOT, "files");
const QUARANTINE_ROOT = path.join(STORAGE_ROOT, "quarantine", "objects");
const REPORT_PATH = path.join(LEGACY_ROOT, "legacy-import-production.jsonl");

const STORAGE_KEY_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA256_PATTERN = /^[0-9a-f]{64}$/i;
const ITEM_ID_PATTERN = /^[0-9a-f]{64}$/i;
const DEFAULT_BATCH_SIZE = 100;

function parseArgs(argv) {
  const args = {
    input: DEFAULT_INPUT,
    limit: Infinity,
    batchSize: DEFAULT_BATCH_SIZE,
    department: null,
    dryRun: false,
    verifyOnly: false,
    importData: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--dry-run") {
      args.dryRun = true;
    } else if (arg === "--verify-only") {
      args.verifyOnly = true;
    } else if (arg === "--import") {
      args.importData = true;
    } else if (arg === "--input") {
      args.input = argv[++i];
    } else if (arg === "--limit") {
      args.limit = Number(argv[++i]);
      if (!Number.isSafeInteger(args.limit) || args.limit < 1) {
        throw new Error("--limit must be a positive integer");
      }
    } else if (arg === "--batch-size") {
      args.batchSize = Number(argv[++i]);
      if (!Number.isSafeInteger(args.batchSize) || args.batchSize < 1 || args.batchSize > 1000) {
        throw new Error("--batch-size must be an integer from 1 to 1000");
      }
    } else if (arg === "--department") {
      args.department = argv[++i];
      if (!args.department) throw new Error("--department requires a value");
    } else if (arg === "--help" || arg === "-h") {
      console.log(`College Noticeboard legacy importer

Usage:
  npm run legacy:import -- --dry-run
  npm run legacy:import -- --import --limit 10
  npm run legacy:import -- --department cse-noticeboard --limit 10
  npm run legacy:import -- --verify-only --limit 10
  npm run legacy:import -- --import --limit 10

Options:
  --input <path>       Completed legacy import JSONL (default: ${DEFAULT_INPUT})
  --limit <n>          Maximum completed records to process
  --batch-size <n>     DB batch size (1-1000; default: ${DEFAULT_BATCH_SIZE})
  --department <name>  Process only one department
  --dry-run            Validate input records only; no DB/storage mutation
  --verify-only        Verify already ACTIVE legacy records; no new imports
  --import             Actually publish/import legacy files; required for mutations
`);
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (args.dryRun && args.verifyOnly) {
    throw new Error("--dry-run and --verify-only cannot be combined");
  }
  if (args.importData && (args.dryRun || args.verifyOnly)) {
    throw new Error("--import cannot be combined with --dry-run or --verify-only");
  }
  if (!args.dryRun && !args.verifyOnly && !args.importData) {
    throw new Error("Refusing to mutate data without explicit --import");
  }
  return args;
}

function assertSafeRelativePath(relativePath) {
  if (typeof relativePath !== "string" || relativePath.length === 0) {
    throw new Error("relative_path is required");
  }
  if (relativePath.startsWith("/") || relativePath.includes("\\")) {
    throw new Error(`Unsafe relative_path: ${relativePath}`);
  }
  const parts = relativePath.split("/");
  if (parts.length < 2 || parts.some((part) => part === "" || part === "." || part === "..")) {
    throw new Error(`Unsafe relative_path: ${relativePath}`);
  }
  if (parts.some((part) => [...part].some((char) => {
    const code = char.codePointAt(0);
    return code !== undefined && (code <= 0x1f || code === 0x7f);
  }))) {
    throw new Error(`Control character in relative_path: ${relativePath}`);
  }
  return parts;
}

function assertInside(candidate, root) {
  const c = path.resolve(candidate);
  const r = path.resolve(root);
  if (c !== r && !c.startsWith(`${r}${path.sep}`)) {
    throw new Error(`Path escapes root: ${candidate}`);
  }
}

async function assertNoSymlinkComponents(candidate, root) {
  const resolvedRoot = path.resolve(root);
  const resolvedCandidate = path.resolve(candidate);
  assertInside(resolvedCandidate, resolvedRoot);

  const relative = path.relative(resolvedRoot, resolvedCandidate);
  let current = resolvedRoot;
  for (const component of relative ? relative.split(path.sep) : []) {
    current = path.join(current, component);
    const info = await lstat(current);
    if (info.isSymbolicLink()) {
      throw new Error(`Symlink component rejected: ${current}`);
    }
  }
}

async function fsyncFile(filePath) {
  const handle = await open(filePath, fsConstants.O_RDONLY);
  try {
    await handle.sync();
  } finally {
    await handle.close();
  }
}

async function fsyncDirectory(dirPath) {
  const handle = await open(dirPath, fsConstants.O_RDONLY);
  try {
    await handle.sync();
  } finally {
    await handle.close();
  }
}

async function ensureDirectory(dirPath) {
  await mkdir(dirPath, { recursive: true });
  const info = await lstat(dirPath);
  if (!info.isDirectory() || info.isSymbolicLink()) {
    throw new Error(`Storage path must be a non-symlink directory: ${dirPath}`);
  }
}

async function hashAndCopy(sourcePath, stagingPath) {
  const sourceInfo = await lstat(sourcePath);
  if (!sourceInfo.isFile() || sourceInfo.isSymbolicLink()) {
    throw new Error(`Legacy source is not a regular non-symlink file: ${sourcePath}`);
  }
  await assertNoSymlinkComponents(sourcePath, LEGACY_OBJECTS_ROOT);

  const stagingRoot = path.join(STORAGE_ROOT, "staging");
  assertInside(stagingPath, stagingRoot);
  await ensureDirectory(path.dirname(stagingPath));
  await assertNoSymlinkComponents(path.dirname(stagingPath), stagingRoot);

  const hash = createHash("sha256");
  let sizeBytes = 0;
  const transform = new Transform({
    transform(chunk, _encoding, callback) {
      try {
        const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        sizeBytes += buffer.length;
        hash.update(buffer);
        callback(null, buffer);
      } catch (error) {
        callback(error);
      }
    },
  });

  await pipeline(
    createReadStream(sourcePath),
    transform,
    createWriteStream(stagingPath, { flags: "wx", mode: 0o600 }),
  );

  await fsyncFile(stagingPath);
  await fsyncDirectory(path.dirname(stagingPath));
  return { sizeBytes, sha256: hash.digest("hex") };
}

async function hashFile(filePath) {
  const hash = createHash("sha256");
  let sizeBytes = 0;
  for await (const chunk of createReadStream(filePath)) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    sizeBytes += buffer.length;
    hash.update(buffer);
  }
  return { sizeBytes, sha256: hash.digest("hex") };
}

function productionObjectPath(storageKey) {
  if (!STORAGE_KEY_PATTERN.test(storageKey)) {
    throw new Error(`Invalid storage key: ${storageKey}`);
  }
  return path.join(FILES_ROOT, storageKey.slice(0, 2).toLowerCase(), storageKey, "object");
}

async function publish(storageKey, stagingPath) {
  if (!STORAGE_KEY_PATTERN.test(storageKey)) {
    throw new Error(`Invalid storage key: ${storageKey}`);
  }
  const source = path.resolve(stagingPath);
  const stagingRoot = path.join(STORAGE_ROOT, "staging");
  assertInside(source, stagingRoot);
  await assertNoSymlinkComponents(source, stagingRoot);

  const stagedInfo = await lstat(source);
  if (!stagedInfo.isFile() || stagedInfo.isSymbolicLink()) {
    throw new Error(`Staging path is not a regular non-symlink file: ${source}`);
  }

  await ensureDirectory(FILES_ROOT);
  const shard = path.join(FILES_ROOT, storageKey.slice(0, 2).toLowerCase());
  await ensureDirectory(shard);
  await assertNoSymlinkComponents(shard, FILES_ROOT);

  const dir = path.dirname(productionObjectPath(storageKey));
  try {
    await mkdir(dir);
  } catch (error) {
    if (error?.code === "EEXIST") {
      throw new Error(`Refusing overwrite for storage key ${storageKey}`);
    }
    throw error;
  }
  await assertNoSymlinkComponents(dir, FILES_ROOT);

  const target = productionObjectPath(storageKey);
  await fsyncDirectory(FILES_ROOT);
  await fsyncDirectory(shard);
  await rename(source, target);
  await fsyncDirectory(path.join(STORAGE_ROOT, "staging"));
  await fsyncDirectory(dir);
  return target;
}

async function verifyObject(storageKey, expectedSize, expectedSha256) {
  const objectPath = productionObjectPath(storageKey);
  const info = await lstat(objectPath);
  if (!info.isFile() || info.isSymbolicLink()) return false;
  const result = await hashFile(objectPath);
  return result.sizeBytes === expectedSize && result.sha256.toLowerCase() === expectedSha256.toLowerCase();
}

async function quarantine(storageKey) {
  const source = productionObjectPath(storageKey);
  const info = await lstat(source);
  if (!info.isFile() || info.isSymbolicLink()) {
    throw new Error(`Cannot quarantine non-file object: ${source}`);
  }
  await ensureDirectory(QUARANTINE_ROOT);
  await assertNoSymlinkComponents(QUARANTINE_ROOT, path.join(STORAGE_ROOT, "quarantine"));
  const target = path.join(QUARANTINE_ROOT, `${storageKey}.quarantined`);
  assertInside(target, QUARANTINE_ROOT);
  await rename(source, target);
  await fsyncDirectory(path.dirname(source));
  await fsyncDirectory(QUARANTINE_ROOT);
  return target;
}

function parseRecord(raw, lineNumber) {
  let record;
  try {
    record = JSON.parse(raw);
  } catch (error) {
    throw new Error(`Invalid JSONL at line ${lineNumber}: ${error.message}`);
  }

  if (record.status !== "completed") return null;
  if (!ITEM_ID_PATTERN.test(record.item_id ?? "")) throw new Error(`Invalid item_id at line ${lineNumber}`);
  if (!SHA256_PATTERN.test(record.sha256 ?? "")) throw new Error(`Invalid sha256 at line ${lineNumber}`);
  if (!Number.isSafeInteger(record.size_bytes) || record.size_bytes < 0) {
    throw new Error(`Invalid size_bytes at line ${lineNumber}`);
  }

  const parts = assertSafeRelativePath(record.legacy_relative_path);
  const department = parts[0];
  const filename = parts.at(-1);
  if (record.department !== department) throw new Error(`Department mismatch at line ${lineNumber}`);
  if (record.filename !== filename) throw new Error(`Filename mismatch at line ${lineNumber}`);

  const sourcePath = path.resolve(String(record.verified_staging_object ?? ""));
  assertInside(sourcePath, LEGACY_OBJECTS_ROOT);
  if (path.basename(sourcePath) !== `${record.item_id}.object`) {
    throw new Error(`Source object basename does not match item_id at line ${lineNumber}`);
  }

  return {
    itemId: record.item_id.toLowerCase(),
    relativePath: record.legacy_relative_path,
    department,
    filename,
    mimeType: record.mime_type_guess || "application/octet-stream",
    sizeBytes: record.size_bytes,
    sha256: record.sha256.toLowerCase(),
    sourcePath,
  };
}

async function getActorId(client) {
  const result = await client.query(`
    SELECT id
    FROM users
    WHERE status = 'ACTIVE'::user_status
      AND role IN ('OWNER'::user_role, 'ADMIN'::user_role)
    ORDER BY CASE role WHEN 'OWNER'::user_role THEN 0 ELSE 1 END, created_at
    LIMIT 1
  `);
  if (result.rowCount !== 1) {
    throw new Error("Expected exactly one active owner/admin actor for legacy import");
  }
  return result.rows[0].id;
}

async function existingRows(client, itemIds) {
  if (itemIds.length === 0) return new Map();
  const result = await client.query(`
    SELECT id, legacy_item_id, state, storage_key, size_bytes, sha256,
           origin_type, original_name, mime_type, legacy_department, legacy_relative_path
    FROM files
    WHERE legacy_item_id = ANY($1::text[])
  `, [itemIds]);
  return new Map(result.rows.map((row) => [row.legacy_item_id, row]));
}

async function insertStagingRows(client, items, actorId) {
  if (items.length === 0) return;

  const values = [];
  const placeholders = [];
  let p = 1;

  for (const item of items) {
    item.fileId = randomUUID();
    item.storageKey = randomUUID();
    item.stagingPath = path.join(IMPORT_STAGING_ROOT, `${item.fileId}.part`);

    placeholders.push(
      `($${p++},$${p++},$${p++},$${p++},$${p++},'STAGING',$${p++},$${p++},'LEGACY_IMPORT',$${p++},$${p++},$${p++})`,
    );
    values.push(
      item.fileId,
      item.filename,
      item.mimeType,
      item.sizeBytes,
      Buffer.from(item.sha256, "hex"),
      item.storageKey,
      actorId,
      item.itemId,
      item.department,
      item.relativePath,
    );
  }

  await client.query(`
    INSERT INTO files
      (id, original_name, mime_type, size_bytes, sha256, state, storage_key, created_by,
       origin_type, legacy_item_id, legacy_department, legacy_relative_path)
    VALUES ${placeholders.join(",")}
  `, values);
}

async function finalizeBatch(client, items, actorId) {
  if (items.length === 0) return;

  await client.query("BEGIN");
  try {
    for (const item of items) {
      const versionId = randomUUID();

      await client.query(`
        INSERT INTO file_versions
          (id, file_id, version_number, storage_key, mime_type, size_bytes, sha256, created_by)
        VALUES ($1,$2,1,$3,$4,$5,$6,$7)
      `, [
        versionId,
        item.fileId,
        item.storageKey,
        item.mimeType,
        item.sizeBytes,
        Buffer.from(item.sha256, "hex"),
        actorId,
      ]);

      const update = await client.query(`
        UPDATE files
        SET state = 'ACTIVE', current_version_id = $1, updated_at = NOW()
        WHERE id = $2 AND state = 'STAGING' AND legacy_item_id = $3
      `, [versionId, item.fileId, item.itemId]);

      if (update.rowCount !== 1) {
        throw new Error(`Failed to activate imported file ${item.itemId}`);
      }

      await client.query(`
        INSERT INTO audit_events
          (actor_user_id, event_type, entity_type, entity_id, metadata)
        VALUES ($1,'LEGACY_FILE_IMPORTED','file',$2,$3::jsonb)
      `, [
        actorId,
        item.fileId,
        JSON.stringify({
          legacyItemId: item.itemId,
          legacyDepartment: item.department,
          legacyRelativePath: item.relativePath,
          sha256: item.sha256,
          sizeBytes: item.sizeBytes,
        }),
      ]);
    }

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}

async function verifyExistingActive(row, item) {
  if (row.origin_type !== "LEGACY_IMPORT") {
    throw new Error(`Existing legacy item has unexpected origin_type: ${item.itemId}`);
  }
  if (row.original_name !== item.filename) {
    throw new Error(`Existing legacy item filename mismatch: ${item.itemId}`);
  }
  if (row.mime_type !== item.mimeType) {
    throw new Error(`Existing legacy item MIME mismatch: ${item.itemId}`);
  }
  if (row.legacy_department !== item.department) {
    throw new Error(`Existing legacy item department mismatch: ${item.itemId}`);
  }
  if (row.legacy_relative_path !== item.relativePath) {
    throw new Error(`Existing legacy item relative_path mismatch: ${item.itemId}`);
  }
  if (Number(row.size_bytes) !== item.sizeBytes) {
    throw new Error(`Existing legacy item size mismatch: ${item.itemId}`);
  }
  const dbSha = Buffer.from(row.sha256 ?? "").toString("hex").toLowerCase();
  if (dbSha !== item.sha256) {
    throw new Error(`Existing legacy item checksum mismatch: ${item.itemId}`);
  }
  if (!(await verifyObject(row.storage_key, item.sizeBytes, item.sha256))) {
    throw new Error(`Existing legacy item object verification failed: ${item.itemId}`);
  }
}

async function appendReport(line) {
  const handle = await open(REPORT_PATH, "a", 0o640);
  try {
    await handle.write(`${JSON.stringify(line)}\n`);
    await handle.sync();
  } finally {
    await handle.close();
  }
}

async function prepareRoots(inputPath) {
  await access(inputPath);
  await ensureDirectory(IMPORT_STAGING_ROOT);
  await ensureDirectory(FILES_ROOT);
  await ensureDirectory(QUARANTINE_ROOT);
}

async function dryRun(args) {
  let totalLines = 0;
  let completed = 0;
  let sourceMissing = 0;
  let selected = 0;
  let bytes = 0;
  const seen = new Set();

  const rl = createInterface({ input: createReadStream(args.input), crlfDelay: Infinity });
  for await (const raw of rl) {
    totalLines += 1;
    if (!raw.trim()) continue;

    const item = parseRecord(raw, totalLines);
    if (!item) {
      sourceMissing += 1;
      continue;
    }
    if (args.department && item.department !== args.department) continue;
    if (seen.has(item.itemId)) throw new Error(`Duplicate item_id in input: ${item.itemId}`);
    seen.add(item.itemId);

    completed += 1;
    if (selected < args.limit) {
      selected += 1;
      bytes += item.sizeBytes;
    }
  }

  console.log(JSON.stringify({
    mode: "dry-run",
    input: args.input,
    totalLines,
    completed,
    sourceMissing,
    selected,
    selectedBytes: bytes,
    selectedGiB: bytes / 1024 ** 3,
  }, null, 2));
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  await prepareRoots(args.input);

  if (args.dryRun) {
    await dryRun(args);
    return;
  }

  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");

  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  try {
    const actorId = await getActorId(client);
    const stats = {
      read: 0,
      selected: 0,
      sourceMissing: 0,
      stagedRowsCreated: 0,
      imported: 0,
      resumed: 0,
      alreadyActive: 0,
      existingNonActive: 0,
      bytesImported: 0,
      verifiedExistingBytes: 0,
    };

    const rl = createInterface({ input: createReadStream(args.input), crlfDelay: Infinity });
    let batch = [];

    const flush = async () => {
      if (batch.length === 0) return;

      const existing = await existingRows(client, batch.map((item) => item.itemId));
      const newItems = batch.filter((item) => !existing.has(item.itemId));

      if (newItems.length) {
        await client.query("BEGIN");
        try {
          await insertStagingRows(client, newItems, actorId);
          await client.query("COMMIT");
        } catch (error) {
          await client.query("ROLLBACK");
          throw error;
        }
        stats.stagedRowsCreated += newItems.length;
      }

      // Refresh the batch map so newly-created STAGING rows can be handled uniformly.
      const rows = await existingRows(client, batch.map((item) => item.itemId));
      const ready = [];

      for (const item of batch) {
        const row = rows.get(item.itemId);
        if (!row) throw new Error(`No production files row for ${item.itemId}`);

        if (row.state === "ACTIVE") {
          await verifyExistingActive(row, item);
          stats.alreadyActive += 1;
          stats.verifiedExistingBytes += item.sizeBytes;
          await appendReport({ status: "already_active", itemId: item.itemId, fileId: row.id, storageKey: row.storage_key });
          continue;
        }

        if (row.state !== "STAGING") {
          stats.existingNonActive += 1;
          await appendReport({ status: "existing_non_active", itemId: item.itemId, state: row.state });
          continue;
        }

        item.fileId = row.id;
        item.storageKey = row.storage_key;
        item.stagingPath = path.join(IMPORT_STAGING_ROOT, `${item.fileId}.part`);

        const objectPath = productionObjectPath(item.storageKey);
        const objectExists = await lstat(objectPath)
          .then((info) => info.isFile() && !info.isSymbolicLink())
          .catch(() => false);
        const stagingExists = await lstat(item.stagingPath)
          .then((info) => info.isFile() && !info.isSymbolicLink())
          .catch(() => false);

        if (!objectExists) {
          if (!stagingExists) {
            const sourceInfo = await lstat(item.sourcePath);
            if (!sourceInfo.isFile() || sourceInfo.isSymbolicLink()) {
              throw new Error(`Source object missing or unsafe: ${item.itemId}`);
            }
            if (sourceInfo.size !== item.sizeBytes) {
              throw new Error(`Source size mismatch: ${item.itemId}`);
            }

            const copyResult = await hashAndCopy(item.sourcePath, item.stagingPath);
            if (copyResult.sizeBytes !== item.sizeBytes || copyResult.sha256 !== item.sha256) {
              await unlink(item.stagingPath).catch(() => {});
              throw new Error(`Source checksum/size mismatch: ${item.itemId}`);
            }
          } else {
            const staged = await hashFile(item.stagingPath);
            if (staged.sizeBytes !== item.sizeBytes || staged.sha256 !== item.sha256) {
              throw new Error(`Existing staging checksum/size mismatch: ${item.itemId}`);
            }
          }

          await publish(item.storageKey, item.stagingPath);
        } else if (stagingExists) {
          // A successful rename normally leaves no .part. Remove only a verified stale duplicate.
          const staged = await hashFile(item.stagingPath);
          if (staged.sizeBytes === item.sizeBytes && staged.sha256 === item.sha256) {
            await unlink(item.stagingPath);
          } else {
            throw new Error(`Conflicting staging file for existing object: ${item.itemId}`);
          }
        }

        if (!(await verifyObject(item.storageKey, item.sizeBytes, item.sha256))) {
          await quarantine(item.storageKey).catch(() => {});
          throw new Error(`Published object verification failed: ${item.itemId}`);
        }

        ready.push(item);
      }

      await finalizeBatch(client, ready, actorId);

      for (const item of ready) {
        stats.imported += 1;
        stats.bytesImported += item.sizeBytes;
        await appendReport({
          status: "imported",
          itemId: item.itemId,
          fileId: item.fileId,
          storageKey: item.storageKey,
          relativePath: item.relativePath,
          department: item.department,
          sizeBytes: item.sizeBytes,
          sha256: item.sha256,
        });
      }

      console.log(JSON.stringify(stats));
      batch = [];
    };

    const seen = new Set();
    for await (const raw of rl) {
      stats.read += 1;
      if (!raw.trim()) continue;

      const item = parseRecord(raw, stats.read);
      if (!item) {
        stats.sourceMissing += 1;
        continue;
      }
      if (args.department && item.department !== args.department) continue;
      if (stats.selected >= args.limit) break;
      if (seen.has(item.itemId)) throw new Error(`Duplicate item_id in input: ${item.itemId}`);
      seen.add(item.itemId);

      stats.selected += 1;

      if (args.verifyOnly) {
        const rows = await existingRows(client, [item.itemId]);
        const row = rows.get(item.itemId);
        if (!row || row.state !== "ACTIVE") {
          throw new Error(`verify-only found no ACTIVE imported row for ${item.itemId}`);
        }
        await verifyExistingActive(row, item);
        stats.verifiedExistingBytes += item.sizeBytes;
        await appendReport({ status: "verified_existing", itemId: item.itemId, fileId: row.id, storageKey: row.storage_key });
      } else {
        batch.push(item);
        if (batch.length >= args.batchSize) await flush();
      }
    }

    if (!args.verifyOnly) await flush();

    console.log(JSON.stringify({
      done: true,
      ...stats,
      importedGiB: stats.bytesImported / 1024 ** 3,
      verifiedExistingGiB: stats.verifiedExistingBytes / 1024 ** 3,
    }, null, 2));
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error?.stack || error);
  process.exitCode = 1;
});
