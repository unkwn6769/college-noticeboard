import { runMigrationExecutor, requestMigrationExecutorStop } from "../server/migrationExecutor.js";
import { pool } from "../server/db/database.js";

const migrationId = String(process.argv[2] || "").trim();
if (!migrationId) throw new Error("Usage: node scripts/run-migration-executor.js <migrationId>");

const stop = () => requestMigrationExecutorStop();
process.once("SIGINT", stop);
process.once("SIGTERM", stop);

try {
  const result = await runMigrationExecutor({ migrationId });
  console.log(JSON.stringify({
    event: "migration_executor_finished",
    migrationId,
    runId: result.runId,
    status: result.summary?.status,
    workerCount: result.workerCount,
    completedItems: result.completedItems,
    stopped: result.stopped,
  }));
} finally {
  await pool.end();
}
