import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const here = path.dirname(fileURLToPath(import.meta.url));
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
try {
  const sql = await readFile(path.join(here, "..", "db", "001_initial.sql"), "utf8");
  await client.query("BEGIN");
  await client.query(sql);
  await client.query("COMMIT");
  console.log("Initialized database foundation");;
} catch (error) {
  await client.query("ROLLBACK");
  throw error;
} finally {
  await client.end();
}
