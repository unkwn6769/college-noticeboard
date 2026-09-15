import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const { Client } = pg;
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const migrationsDir = path.join(root, "server", "db", "migrations");
const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required");
}

const client = new Client({
  connectionString: databaseUrl,
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: Number(process.env.DB_CONNECTION_TIMEOUT_MS || 10_000),
  keepAlive: true,
});

await client.connect();

try {
  // Serialize schema migrations across concurrent GitHub Actions runs.
  await client.query("SELECT pg_advisory_lock(hashtext($1))", ["college-noticeboard-schema"]);
  await client.query(`
    CREATE TABLE IF NOT EXISTS app_schema_migrations (
      version TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  const entries = (await fs.readdir(migrationsDir))
    .filter((name) => /^\d+_.+\.sql$/.test(name))
    .sort();

  for (const filename of entries) {
    const version = filename.replace(/\.sql$/, "");
    const exists = await client.query(
      "SELECT 1 FROM app_schema_migrations WHERE version = $1",
      [version],
    );

    if (exists.rowCount) {
      console.log(`SKIP ${version}`);
      continue;
    }

    const sql = await fs.readFile(path.join(migrationsDir, filename), "utf8");
    await client.query("BEGIN");
    try {
      await client.query(sql);
      await client.query(
        "INSERT INTO app_schema_migrations(version) VALUES ($1)",
        [version],
      );
      await client.query("COMMIT");
      console.log(`APPLY ${version}`);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  }
} finally {
  try {
    await client.query("SELECT pg_advisory_unlock(hashtext($1))", ["college-noticeboard-schema"]);
  } catch {}
  await client.end();
}
