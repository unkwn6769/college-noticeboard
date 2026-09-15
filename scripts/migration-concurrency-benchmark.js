/*
 * Deterministic local benchmark for the migration worker-pool model.
 * It measures item throughput only; Google Drive byte throughput is not
 * represented because files.copy() is server-side.
 */

const itemDurationsMs = [40, 80, 120, 60, 100, 50, 90, 70, 110, 55, 95, 65];

function runItem(durationMs, onStart, onFinish) {
  onStart();
  return new Promise((resolve) => {
    setTimeout(() => {
      onFinish();
      resolve();
    }, durationMs);
  });
}

async function runSequential() {
  let active = 0;
  let peak = 0;
  const startedAt = performance.now();
  for (const durationMs of itemDurationsMs) {
    await runItem(
      durationMs,
      () => {
        active += 1;
        peak = Math.max(peak, active);
      },
      () => {
        active -= 1;
      },
    );
  }
  return { elapsedMs: performance.now() - startedAt, peak };
}

async function runConcurrent(workerCount) {
  let next = 0;
  let active = 0;
  let peak = 0;
  const startedAt = performance.now();

  async function worker() {
    while (next < itemDurationsMs.length) {
      const index = next++;
      await runItem(
        itemDurationsMs[index],
        () => {
          active += 1;
          peak = Math.max(peak, active);
        },
        () => {
          active -= 1;
        },
      );
    }
  }

  await Promise.all(
    Array.from({ length: workerCount }, () => worker()),
  );
  return { elapsedMs: performance.now() - startedAt, peak };
}

const sequential = await runSequential();
const concurrent = await runConcurrent(4);
const throughput = itemDurationsMs.length / (concurrent.elapsedMs / 1000);

if (concurrent.peak > 4 || concurrent.elapsedMs >= sequential.elapsedMs) {
  throw new Error("Continuous concurrency benchmark did not improve throughput");
}

console.log(JSON.stringify({
  items: itemDurationsMs.length,
  sequentialMs: Math.round(sequential.elapsedMs),
  concurrentMs: Math.round(concurrent.elapsedMs),
  concurrentPeakWorkers: concurrent.peak,
  concurrentItemsPerSecond: Number(throughput.toFixed(2)),
}, null, 2));
