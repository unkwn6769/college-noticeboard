import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";

describe("StorageEngine", () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(
      path.join(os.tmpdir(), "college-noticeboard-storage-"),
    );

    process.env.NOTICEBOARD_STORAGE_ROOT = root;
    vi.resetModules();
  });

  afterEach(async () => {
    delete process.env.NOTICEBOARD_STORAGE_ROOT;
    vi.resetModules();

    await rm(root, {
      recursive: true,
      force: true,
    });
  });

  async function createEngine() {
    const { StorageEngine } = await import("./engine");
    return new StorageEngine();
  }

  it("creates the required storage directories", async () => {
    const engine = await createEngine();

    await engine.init();

    for (const relative of [
      "files",
      "staging",
      "quarantine/objects",
      "quarantine/partials",
      "tmp",
      "backups",
    ]) {
      const info = await stat(path.join(root, relative));
      expect(info.isDirectory()).toBe(true);
    }
  });

  it("streams data and calculates SHA-256", async () => {
    const engine = await createEngine();

    const { stagingPath } = await engine.createStagingFile();

    const input = Readable.from([
      Buffer.from("hello "),
      Buffer.from("college "),
      Buffer.from("noticeboard"),
    ]);

    const result = await engine.writeStream(input, stagingPath);

    expect(result.sizeBytes).toBe(25);
    expect(result.sha256).toBe(
      "b2546767c1c0351ed60e3d2020bccbf8dd550d7e35270a0674bdf547641b6800",
    );
  });
});