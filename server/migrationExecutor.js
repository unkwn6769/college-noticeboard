import crypto from "node:crypto";
import {
  finalizeCancellationIfIdle,
  getMigrationStatus,
  getMigrationSummary,
  migrateOneItem,
  retryFailedSourceDeletion,
} from "./migrationWorker.js";
import { pool } from "./db/database.js";

const DEFAULT_MIN_WORKERS = 4;
const DEFAULT_MAX_WORKERS = 32;
const DEFAULT_HEARTBEAT_MS = 15_000;
const DEFAULT_MAX_ITEMS_PER_RUN = 0;
const HEALTHY_SAMPLE_WINDOW = 12;
const LATENCY_MULTIPLIER_TO_BACKOFF = 2.5;

let stopping = false;
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function num(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function requestMigrationExecutorStop() {
  // Stop launching new work. Existing item leases remain durable and will be
  // recovered by a later GitHub runner if the process is terminated.
  stopping = true;
}

function isThrottleLike(result) {
  const text = String(result?.error ?? result?.reason ?? "").toLowerCase();
  return /429|rate.?limit|user.?rate|quota|resource.?exhausted|throttl/.test(text);
}

async function createExecutionRun(migrationId, runnerId, workerCount) {
  const id = crypto.randomUUID();
  await pool.query(
    `
      INSERT INTO migration_execution_runs (
        id, migration_id, runner_id, status, worker_count, metadata
      )
      VALUES ($1, $2, $3, 'running', $4, $5::jsonb)
    `,
    [id, migrationId, runnerId, workerCount, JSON.stringify({ engine: "github-actions" })],
  );
  return id;
}

async function heartbeatExecutionRun(runId, workerCount, metadata = {}) {
  await pool.query(
    `
      UPDATE migration_execution_runs
      SET heartbeat_at = NOW(), worker_count = $2, metadata = $3::jsonb
      WHERE id = $1 AND status = 'running'
    `,
    [runId, workerCount, JSON.stringify(metadata)],
  );
}

async function finishExecutionRun(runId, status, error = null) {
  await pool.query(
    `
      UPDATE migration_execution_runs
      SET status = $2, finished_at = NOW(), heartbeat_at = NOW(), last_error = $3
      WHERE id = $1
    `,
    [runId, status, error],
  );
}

async function getDueCleanupItemIds(migrationId, limit = 25) {
  const result = await pool.query(
    `
      SELECT id
      FROM google_drive_account_migration_items
      WHERE migration_id = $1
        AND status = 'completed'
        AND source_delete_status IN ('pending', 'failed')
        AND (
          cleanup_next_attempt_at IS NULL
          OR cleanup_next_attempt_at <= NOW()
        )
      ORDER BY COALESCE(cleanup_next_attempt_at, created_at), id
      LIMIT $2
    `,
    [migrationId, limit],
  );
  return result.rows.map((row) => row.id);
}

export async function runMigrationExecutor({
  migrationId,
  runnerId = process.env.GITHUB_RUN_ID || crypto.randomUUID(),
  minWorkers = num(process.env.MIGRATION_MIN_WORKERS, DEFAULT_MIN_WORKERS),
  maxWorkers = num(process.env.MIGRATION_MAX_WORKERS, DEFAULT_MAX_WORKERS),
  maxItems = num(process.env.MIGRATION_MAX_ITEMS_PER_RUN, DEFAULT_MAX_ITEMS_PER_RUN),
} = {}) {
  if (!migrationId) throw new Error("migrationId is required");

  minWorkers = Math.max(1, Math.floor(minWorkers));
  maxWorkers = Math.max(minWorkers, Math.floor(maxWorkers));
  maxItems = maxItems > 0 ? Math.floor(maxItems) : Number.MAX_SAFE_INTEGER;

  let workerCount = clamp(minWorkers, 1, maxWorkers);
  let healthySamples = 0;
  let completedItems = 0;
  let ewmaLatencyMs = 0;
  const runId = await createExecutionRun(migrationId, runnerId, workerCount);
  const startedAt = Date.now();
  const heartbeat = setInterval(() => {
    heartbeatExecutionRun(runId, workerCount, {
      completedItems,
      healthySamples,
      ewmaLatencyMs: Math.round(ewmaLatencyMs),
    }).catch((error) => console.error("[MIGRATION EXECUTOR] Heartbeat failed:", error));
  }, DEFAULT_HEARTBEAT_MS);
  heartbeat.unref?.();

  const runOne = async () => {
    const itemStartedAt = Date.now();
    let result;
    try {
      result = await migrateOneItem(migrationId, undefined, workerCount);
      completedItems += result?.status === "completed" || result?.status === "already_handled" ? 1 : 0;
      return result;
    } finally {
      const latency = Date.now() - itemStartedAt;
      ewmaLatencyMs = ewmaLatencyMs === 0 ? latency : (ewmaLatencyMs * 0.8) + (latency * 0.2);
    }
  };

  try {
    while (!stopping && completedItems < maxItems) {
      const before = await getMigrationStatus(migrationId);
      if (!before) throw new Error("Migration not found");

      if (before.cancel_requested) {
        await finalizeCancellationIfIdle(migrationId);
        break;
      }

      if (["completed", "failed", "cancelled"].includes(before.status)) {
        break;
      }

      const cleanupIds = await getDueCleanupItemIds(migrationId, workerCount);
      if (cleanupIds.length) {
        const cleanupResults = await Promise.allSettled(
          cleanupIds.map(async (itemId) => retryFailedSourceDeletion(itemId)),
        );
        const cleanupFailures = cleanupResults.filter((r) => r.status === "rejected").length;
        if (cleanupFailures === 0 && cleanupIds.length >= workerCount) {
          healthySamples++;
        }
      }

      const active = Math.min(workerCount, Math.max(1, maxItems - completedItems));
      const batch = await Promise.all(
        Array.from({ length: active }, async () => {
          if (stopping) return null;
          return runOne();
        }),
      );

      const usable = batch.filter(Boolean);
      if (usable.length === 0) break;

      const pressure = usable.some((item) => isThrottleLike(item));
      const transient = usable.filter((item) => ["retrying", "reconciling", "waiting_for_storage", "deferred_storage"].includes(item?.status));
      const allIdle = usable.every((item) => item.message === "No pending migration items");

      if (pressure || transient.length > Math.max(1, Math.floor(usable.length / 2))) {
        workerCount = Math.max(minWorkers, Math.floor(workerCount * 0.7));
        healthySamples = 0;
      } else {
        healthySamples += usable.length;
        if (healthySamples >= HEALTHY_SAMPLE_WINDOW && workerCount < maxWorkers) {
          const latencyPressure = ewmaLatencyMs > 0 && Date.now() - startedAt > 10_000
            ? ewmaLatencyMs
            : 0;
          if (!latencyPressure || latencyPressure < num(process.env.MIGRATION_TARGET_ITEM_LATENCY_MS, 2_000) * LATENCY_MULTIPLIER_TO_BACKOFF) {
            workerCount = Math.min(maxWorkers, workerCount + Math.max(1, Math.ceil(workerCount * 0.15)));
          }
          healthySamples = 0;
        }
      }

      if (allIdle) {
        const summary = await getMigrationSummary(migrationId);
        if (summary?.pending_items === "0" || Number(summary?.pending_items) === 0) break;
      }
    }

    const summary = await getMigrationSummary(migrationId);
    await finishExecutionRun(runId, stopping ? "stopped" : "completed");
    return { migrationId, runId, summary, workerCount, completedItems, stopped: stopping };
  } catch (error) {
    await finishExecutionRun(runId, "failed", error instanceof Error ? error.message : String(error));
    throw error;
  } finally {
    clearInterval(heartbeat);
  }
}
