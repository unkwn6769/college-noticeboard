import pg from "pg";

const { Client } = pg;
const client = new Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: Number(process.env.DB_CONNECTION_TIMEOUT_MS || 10_000),
  keepAlive: true,
});

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required");
}

await client.connect();
try {
  const result = await client.query(`
    SELECT DISTINCT m.id
    FROM google_drive_account_migrations m
    WHERE m.status IN ('pending', 'running', 'waiting_for_storage')
      AND m.cancel_requested = FALSE
      AND (
        EXISTS (
          SELECT 1
          FROM google_drive_account_migration_items i
          WHERE i.migration_id = m.id
            AND i.status IN ('pending', 'reconciling')
            AND (i.next_retry_at IS NULL OR i.next_retry_at <= NOW())
        )
        OR EXISTS (
          SELECT 1
          FROM google_drive_account_migration_items i
          WHERE i.migration_id = m.id
            AND i.status = 'completed'
            AND i.source_delete_status IN ('pending', 'failed')
            AND (
              i.cleanup_next_attempt_at IS NULL
              OR i.cleanup_next_attempt_at <= NOW()
            )
        )
      )
    ORDER BY m.id
    LIMIT 20
  `);

  process.stdout.write(JSON.stringify(result.rows.map((row) => row.id)));
} finally {
  await client.end();
}
