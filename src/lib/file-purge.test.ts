import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Readable } from "node:stream";
import { mkdtemp, rm, stat, mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const root = await mkdtemp(path.join(os.tmpdir(), "college-noticeboard-purge-"));

async function createEngine() {
  vi.resetModules();
  process.env.NOTICEBOARD_STORAGE_ROOT = root;
  const { StorageEngine } = await import("./storage/engine");
  const engine = new StorageEngine();
  await engine.init();
  return engine;
}

async function publish(engine: any, key: string, body: string) {
  const staging = await engine.createStagingFile();
  await engine.writeStream(Readable.from([Buffer.from(body)]), staging.stagingPath);
  await engine.publish(key, staging.stagingPath);
}

describe("purgeFileBytes", () => {
  beforeEach(async () => { await rm(root, { recursive: true, force: true }); await mkdir(root, { recursive: true }); });
  afterEach(() => { vi.resetModules(); });

  it("purges an object that is already in quarantine", async () => {
    const engine = await createEngine();
    const { purgeFileBytes } = await import("./file-purge");
    const key = "0a0a0a0a-1234-4123-8123-123456789abc";
    await publish(engine, key, "quarantined");
    const q = await engine.quarantine(key);
    await expect(purgeFileBytes(engine, key)).resolves.toBe(true);
    await expect(stat(q)).rejects.toMatchObject({ code: "ENOENT" });
    await expect(stat(path.join(root, "files", "0a", key, "object"))).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("quarantines bytes still sitting in the active area instead of leaking them", async () => {
    const engine = await createEngine();
    const { purgeFileBytes } = await import("./file-purge");
    const key = "0b0b0b0b-1234-4123-8123-123456789abc";
    await publish(engine, key, "not-yet-materialised");
    const active = path.join(root, "files", "0b", key, "object");
    await expect(stat(active)).resolves.toBeTruthy();
    await expect(purgeFileBytes(engine, key)).resolves.toBe(true);
    // The regression: active bytes must not survive a successful purge.
    await expect(stat(active)).rejects.toMatchObject({ code: "ENOENT" });
    const objects = await engine.scanObjects();
    expect(objects).toHaveLength(0);
  });

  it("is a no-op when no object exists anywhere", async () => {
    const engine = await createEngine();
    const { purgeFileBytes } = await import("./file-purge");
    await expect(purgeFileBytes(engine, "0c0c0c0c-1234-4123-8123-123456789abc")).resolves.toBe(false);
  });

  it("stays idempotent for repeated and concurrent purges of one key", async () => {
    const engine = await createEngine();
    const { purgeFileBytes } = await import("./file-purge");
    const key = "0d0d0d0d-1234-4123-8123-123456789abc";
    await publish(engine, key, "twice");
    await engine.quarantine(key);
    const results = await Promise.all([
      purgeFileBytes(engine, key),
      purgeFileBytes(engine, key),
      purgeFileBytes(engine, key),
    ]);
    // Concurrent purges must not leak ENOENT to the caller.
    expect(results.every((r) => r === true || r === false)).toBe(true);
    await expect(purgeFileBytes(engine, key)).resolves.toBe(false);
  });

  it("survives a concurrent quarantine-then-purge race without surfacing ENOENT", async () => {
    const engine = await createEngine();
    const { purgeFileBytes } = await import("./file-purge");
    const key = "0e0e0e0e-1234-4123-8123-123456789abc";
    await publish(engine, key, "race");
    // Two callers both fall back to quarantining the still-active object.
    const results = await Promise.all([purgeFileBytes(engine, key), purgeFileBytes(engine, key)]);
    expect(results.every((r) => r === true || r === false)).toBe(true);
    await expect(stat(path.join(root, "files", "0e", key, "object"))).rejects.toMatchObject({ code: "ENOENT" });
    expect(await engine.scanObjects()).toHaveLength(0);
  });

  it("refuses to purge a path outside the quarantine root", async () => {
    const engine = await createEngine();
    const outside = path.join(root, "outside-object");
    await writeFile(outside, "keep");
    await expect(engine.purgeQuarantine(outside)).rejects.toThrow("Path escapes storage root");
    await expect(stat(outside)).resolves.toBeTruthy();
  });
});
