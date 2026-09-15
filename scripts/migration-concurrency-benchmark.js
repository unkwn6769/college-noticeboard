/*
 * Deterministic local benchmark for the migration worker-pool model.
 * It measures item throughput only; Google Drive byte throughput is not
 * represented because files.copy() is server-side.
 */

const itemDurationsMs = Array.from(
  { length: 192 },
  (_, index) => 40 + ((index * 37) % 81),
);

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

const counts = [1, 2, 4, 8, 16, 32, 64, 96, 128];
const results = [];

for (const workerCount of counts) {
  const result = workerCount === 1
    ? await runSequential()
    : await runConcurrent(workerCount);
  results.push({
    workers: workerCount,
    elapsedMs: Math.round(result.elapsedMs),
    itemsPerSecond: Number(
      (itemDurationsMs.length / (result.elapsedMs / 1000)).toFixed(2),
    ),
    peakWorkers: result.peak,
  });
}

const sequential = results[0];
const best = results.reduce((current, result) =>
  result.itemsPerSecond > current.itemsPerSecond ? result : current,
);

if (best.workers < 2 || best.itemsPerSecond <= sequential.itemsPerSecond) {
  throw new Error("Continuous concurrency benchmark did not improve throughput");
}

console.log(JSON.stringify({
  items: itemDurationsMs.length,
  results,
  localModelBest: best.workers,
  note: "Synthetic item latency only; not Google Drive byte throughput.",
}, null, 2));
