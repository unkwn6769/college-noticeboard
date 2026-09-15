import { pool } from "../server/db/database.js";
import { getGoogleDriveClientForAccount } from "../server/storage/googleClient.js";

const migrationId = process.argv[2];

if (!migrationId) {
  console.error("Usage: node scripts/verify-migration-recovery.js <migration_id>");
  process.exit(2);
}

const DRIVE_FIELDS = [
  "id",
  "name",
  "mimeType",
  "size",
  "md5Checksum",
  "modifiedTime",
  "trashed",
  "parents",
].join(",");

async function main() {
  /*
   * READ ONLY:
   * - PostgreSQL SELECTs only
   * - Google Drive files.get() only
   * - no claims, updates, copies, deletes, or migration state changes
   */

  const migrationResult = await pool.query(
    `
      SELECT
        id,
        source_account_id,
        target_account_id,
        status,
        total_files,
        completed_files,
        failed_files
      FROM google_drive_account_migrations
      WHERE id = $1
    `,
    [migrationId],
  );

  if (migrationResult.rowCount !== 1) {
    throw new Error(`Migration not found: ${migrationId}`);
  }

  const migration = migrationResult.rows[0];

  const itemsResult = await pool.query(
    `
      SELECT
        id,
        migration_id,
        source_file_id,
        target_file_id,
        target_account_id,
        size_bytes,
        transfer_phase,
        status,
        target_recovery_required,
        source_delete_status
      FROM google_drive_account_migration_items
      WHERE migration_id = $1
        AND status = 'pending'
        AND transfer_phase = 'verifying'
        AND target_file_id IS NOT NULL
      ORDER BY created_at, id
    `,
    [migrationId],
  );

  const sourceAccountId = String(migration.source_account_id);

  const accountIds = new Set([sourceAccountId]);

  for (const item of itemsResult.rows) {
    accountIds.add(String(item.target_account_id));
  }

  const accountsResult = await pool.query(
    `
      SELECT
        id AS connected_account_id,
        email,
        client_id_encrypted,
        client_secret_encrypted,
        access_token_encrypted,
        refresh_token_encrypted,
        token_expires_at,
        redirect_uri
      FROM google_drive_accounts
      WHERE id = ANY($1::text[])
        AND status = 'connected'
    `,
    [[...accountIds]],
  );

  const accounts = new Map(
    accountsResult.rows.map((account) => [
      String(account.connected_account_id),
      account,
    ]),
  );

  async function getDrive(accountId) {
    const account = accounts.get(String(accountId));

    if (!account) {
      throw new Error(`Connected Google account unavailable: ${accountId}`);
    }

    return getGoogleDriveClientForAccount(account);
  }

  console.log(
    JSON.stringify(
      {
        migration: {
          id: migration.id,
          status: migration.status,
          total_files: migration.total_files,
          completed_files: migration.completed_files,
          failed_files: migration.failed_files,
          source_account_present: Boolean(accounts.get(sourceAccountId)),
          target_accounts_present: [...new Set(
            itemsResult.rows.map((item) => String(item.target_account_id)),
          )].every((id) => Boolean(accounts.get(id))),
        },
        candidates: itemsResult.rowCount,
      },
      null,
      2,
    ),
  );

  const results = [];

  for (const item of itemsResult.rows) {
    const result = {
      item_id: item.id,
      source_file_id: item.source_file_id,
      target_file_id: item.target_file_id,
      stored_size_bytes: item.size_bytes,
      source_account_id: sourceAccountId,
      target_account_id: item.target_account_id,
      source: null,
      target: null,
      match: false,
      error: null,
    };

    try {
      const sourceDrive = await getDrive(sourceAccountId);
      const targetDrive = await getDrive(item.target_account_id);

      const [sourceResponse, targetResponse] = await Promise.all([
        sourceDrive.files.get({
          fileId: item.source_file_id,
          fields: DRIVE_FIELDS,
          supportsAllDrives: true,
        }),
        targetDrive.files.get({
          fileId: item.target_file_id,
          fields: DRIVE_FIELDS,
          supportsAllDrives: true,
        }),
      ]);

      const source = sourceResponse.data;
      const target = targetResponse.data;

      result.source = {
        id: source.id,
        name: source.name,
        mimeType: source.mimeType,
        size: source.size ?? null,
        md5Checksum: source.md5Checksum ?? null,
        modifiedTime: source.modifiedTime ?? null,
        trashed: source.trashed ?? false,
        parents: source.parents ?? [],
      };

      result.target = {
        id: target.id,
        name: target.name,
        mimeType: target.mimeType,
        size: target.size ?? null,
        md5Checksum: target.md5Checksum ?? null,
        modifiedTime: target.modifiedTime ?? null,
        trashed: target.trashed ?? false,
        parents: target.parents ?? [],
      };

      const sameName = source.name === target.name;
      const sameMime = source.mimeType === target.mimeType;

      const sameSize =
        source.size == null ||
        target.size == null ||
        String(source.size) === String(target.size);

      const checksumComparable =
        source.md5Checksum != null &&
        target.md5Checksum != null;

      const sameChecksum =
        !checksumComparable ||
        source.md5Checksum === target.md5Checksum;

      const storedSizeMatchesSource =
        item.size_bytes == null ||
        source.size == null ||
        String(item.size_bytes) === String(source.size);

      result.match =
        !source.trashed &&
        !target.trashed &&
        sameName &&
        sameMime &&
        sameSize &&
        sameChecksum &&
        storedSizeMatchesSource;
    } catch (error) {
      result.error =
        error instanceof Error ? error.message : String(error);
    }

    results.push(result);
    console.log(JSON.stringify(result, null, 2));
  }

  const matches = results.filter((r) => r.match).length;
  const mismatches = results.filter((r) => !r.match && !r.error).length;
  const errors = results.filter((r) => r.error).length;

  console.log(
    JSON.stringify(
      {
        summary: {
          candidates: results.length,
          matches,
          mismatches,
          errors,
          database_mutations: 0,
          drive_mutations: 0,
        },
      },
      null,
      2,
    ),
  );

  if (errors > 0 || mismatches > 0) {
    process.exitCode = 1;
  }
}

try {
  await main();
} finally {
  await pool.end();
}
