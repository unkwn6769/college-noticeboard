import crypto from "node:crypto";
import {
  finalizeCancellationIfIdle,
  getMigrationStatus,
  getMigrationSummary,
  migrateOneItem,
  retryFailedSourceDeletion,
} from "./migrationWorker.js";
import { pool } from "./db/database.js";

const DEFAULT_MIN_WORKERS = 8;
const DEFAULT_MAX_WORKERS = 64;
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
      activeWorkers: workerCount,
      itemsPerSecond: ((completedItems / Math.max(1, Date.now() - startedAt)) * 1000),
      executionDurationMs: Date.now() - startedAt,
    }).catch((error) => console.error("[MIGRATION EXECUTOR] Heartbeat failed:", error));
  }, DEFAULT_HEARTBEAT_MS);
  heartbeat.unref?.();

  const refreshCompletedCount = async () => {
    const summary = await getMigrationSummary(migrationId);
    completedItems = Number(summary?.completed_items ?? summary?.completed_files ?? 0);
    return summary;
  };

  const runOne = async (workerNumber) => {
    const itemStartedAt = Date.now();
    try {
      return await migrateOneItem(migrationId, workerNumber, workerCount);
    } finally {
      const latency = Date.now() - itemStartedAt;
      ewmaLatencyMs = ewmaLatencyMs === 0 ? latency : (ewmaLatencyMs * 0.8) + (latency * 0.2);
    }
  };

  try {
    const activeWorkers = new Map();
    let workerSequence = 0;
    let idleWorkers = 0;
    let lastSummary = null;

    const launchWorker = () => {
      if (stopping || completedItems >= maxItems || activeWorkers.size >= workerCount) {
        return false;
      }
      const workerNumber = ++workerSequence;
      const promise = runOne(workerNumber)
        .then((result) => ({ workerNumber, result }))
        .catch((error) => ({ workerNumber, error }));
      activeWorkers.set(workerNumber, promise);
      return true;
    };

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

      await refreshCompletedCount();
      if (before.status === "running" && completedItems >= maxItems) break;

      while (activeWorkers.size < workerCount && completedItems < maxItems) {
        launchWorker();
      }

      if (activeWorkers.size === 0) {
        lastSummary = await refreshCompletedCount();
        if (Number(lastSummary?.pending_items ?? 0) === 0 &&
            Number(lastSummary?.running_items ?? 0) === 0) {
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 1000));
        continue;
      }

      const completedWorker = await Promise.race(activeWorkers.values());
      activeWorkers.delete(completedWorker.workerNumber);

      if (completedWorker.error) {
        console.error(
          `[MIGRATION EXECUTOR] Worker ${completedWorker.workerNumber} failed:`,
          completedWorker.error instanceof Error
            ? completedWorker.error.message
            : completedWorker.error,
        );
        idleWorkers = 0;
      } else if (completedWorker.result?.message === "No pending migration items") {
        idleWorkers += 1;
      } else {
        idleWorkers = 0;
      }

      const result = completedWorker.result;
      if (result && isThrottleLike(result)) {
        workerCount = Math.max(minWorkers, Math.floor(workerCount * 0.7));
        healthySamples = 0;
      } else {
        healthySamples += 1;
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

      lastSummary = await refreshCompletedCount();
      if (Number(lastSummary?.completed_items ?? lastSummary?.completed_files ?? 0) >= maxItems) break;
      if (idleWorkers >= Math.max(1, workerCount) &&
          Number(lastSummary?.pending_items ?? 0) === 0 &&
          Number(lastSummary?.running_items ?? 0) === 0) {
        break;
      }

      launchWorker();
    }

    await Promise.all(activeWorkers.values());
    const summary = await refreshCompletedCount();
    await finishExecutionRun(runId, stopping ? "stopped" : "completed");
    return { migrationId, runId, summary, workerCount, completedItems, stopped: stopping };
  } catch (error) {
    await finishExecutionRun(runId, "failed", error instanceof Error ? error.message : String(error));
    throw error;
  } finally {
    clearInterval(heartbeat);
  }
}
