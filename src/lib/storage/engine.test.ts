import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  lstat,
  mkdtemp,
  rm,
  stat,
  symlink,
  writeFile,
} from "node:fs/promises";
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
  it("publishes a staged object using the UUID shard layout", async () => {
    const engine = await createEngine();

    const fileId = "8b0c4e2b-1234-4567-89ab-cdef01234567";

    const { stagingPath } = await engine.createStagingFile();

    const input = Readable.from([
      Buffer.from("college noticeboard"),
    ]);

    const result = await engine.writeStream(input, stagingPath);

    const publishedPath = await engine.publish(fileId, stagingPath);

    expect(publishedPath).toBe(
      path.join(
        root,
        "files",
        "8b",
        fileId,
        "object",
      ),
    );

    expect(await stat(publishedPath)).toBeTruthy();

    await expect(stat(stagingPath)).rejects.toMatchObject({
      code: "ENOENT",
    });

    expect(
      await engine.verify(
        fileId,
        result.sizeBytes,
        result.sha256,
      ),
    ).toBe(true);
  });

  it("inspects a published object", async () => {
    const engine = await createEngine();

    const fileId = "12345678-1234-4234-8234-123456789abc";

    const { stagingPath } = await engine.createStagingFile();

    const input = Readable.from([
      Buffer.from("exam timetable"),
    ]);

    const result = await engine.writeStream(input, stagingPath);

    await engine.publish(fileId, stagingPath);

    const info = await engine.inspect(fileId);

    expect(info.path).toBe(
      path.join(
        root,
        "files",
        "12",
        fileId,
        "object",
      ),
    );

    expect(info.sizeBytes).toBe(result.sizeBytes);
  });

  it("refuses to overwrite an existing published object", async () => {
  const engine = await createEngine();

  const fileId = "11111111-1234-4123-8123-123456789abc";

  const first = await engine.createStagingFile();

  const firstResult = await engine.writeStream(
    Readable.from([Buffer.from("original content")]),
    first.stagingPath,
  );

  const publishedPath = await engine.publish(
    fileId,
    first.stagingPath,
  );

  const second = await engine.createStagingFile();

  await engine.writeStream(
    Readable.from([Buffer.from("replacement content")]),
    second.stagingPath,
  );

  await expect(
    engine.publish(fileId, second.stagingPath),
  ).rejects.toMatchObject({
    code: "EEXIST",
  });

  await expect(stat(second.stagingPath)).resolves.toBeTruthy();

  const info = await engine.inspect(fileId);

  expect(info.path).toBe(publishedPath);
  expect(info.sizeBytes).toBe(firstResult.sizeBytes);

  expect(
    await engine.verify(
      fileId,
      firstResult.sizeBytes,
      firstResult.sha256,
    ),
  ).toBe(true);
});

  it("detects a corrupted published object", async () => {
    const engine = await createEngine();

    const fileId = "abcdef12-1234-4123-8123-123456789abc";

    const { stagingPath } = await engine.createStagingFile();

    const input = Readable.from([
      Buffer.from("original content"),
    ]);

    const result = await engine.writeStream(input, stagingPath);

    await engine.publish(fileId, stagingPath);

    const publishedPath = path.join(
      root,
      "files",
      "ab",
      fileId,
      "object",
    );

    await import("node:fs/promises").then(({ writeFile }) =>
      writeFile(publishedPath, "corrupted content"),
    );

    const valid = await engine.verify(
      fileId,
      result.sizeBytes,
      result.sha256,
    );

    expect(valid).toBe(false);
  });

  it("quarantines a published object", async () => {
    const engine = await createEngine();

    const fileId = "deadbeef-1234-4123-8123-123456789abc";

    const { stagingPath } = await engine.createStagingFile();

    await engine.writeStream(
      Readable.from([Buffer.from("quarantine me")]),
      stagingPath,
    );

    await engine.publish(fileId, stagingPath);

    const quarantinePath = await engine.quarantine(fileId);

    expect(quarantinePath).toContain(
      path.join("quarantine", "objects", fileId),
    );

    await expect(
      engine.inspect(fileId),
    ).rejects.toMatchObject({
      code: "ENOENT",
    });

    expect(await stat(quarantinePath)).toBeTruthy();
  });

  it("purges a quarantined object", async () => {
    const engine = await createEngine();

    const fileId = "feedface-1234-4123-8123-123456789abc";

    const { stagingPath } = await engine.createStagingFile();

    await engine.writeStream(
      Readable.from([Buffer.from("delete me")]),
      stagingPath,
    );

    await engine.publish(fileId, stagingPath);

    const quarantinePath = await engine.quarantine(fileId);

    await engine.purgeQuarantine(quarantinePath);

    await expect(
      stat(quarantinePath),
    ).rejects.toMatchObject({
      code: "ENOENT",
    });
  });

  it("rejects purge paths outside quarantine", async () => {
    const engine = await createEngine();

    await expect(
      engine.purgeQuarantine(
        path.join(root, "files", "not-really-quarantine"),
      ),
    ).rejects.toThrow("Path escapes storage root");
  });

  it("scans staging files", async () => {
    const engine = await createEngine();

    const first = await engine.createStagingFile();
    const second = await engine.createStagingFile();

    await engine.writeStream(
      Readable.from([Buffer.from("first partial")]),
      first.stagingPath,
    );

    await engine.writeStream(
      Readable.from([Buffer.from("second partial")]),
      second.stagingPath,
    );

    const files = await engine.scanStaging();

    expect(files).toEqual(
      expect.arrayContaining([
        path.basename(first.stagingPath),
        path.basename(second.stagingPath),
      ]),
    );
  });

  it("reports disk statistics", async () => {
    const engine = await createEngine();

    const stats = await engine.getDiskStats();

    expect(stats.writable).toBe(true);
    expect(stats.totalBytes).toBeGreaterThan(0);
    expect(stats.freeBytes).toBeGreaterThan(0);
    expect(stats.usagePercent).toBeGreaterThanOrEqual(0);
    expect(stats.usagePercent).toBeLessThanOrEqual(100);
  });

  it("rejects invalid file IDs", async () => {
    const engine = await createEngine();

    const { stagingPath } = await engine.createStagingFile();

    await engine.writeStream(
      Readable.from([Buffer.from("test")]),
      stagingPath,
    );

    await expect(
      engine.publish("../escape", stagingPath),
    ).rejects.toThrow("Invalid file ID");
  });

  it("rejects a staging path outside the staging directory", async () => {
    const engine = await createEngine();

    const outsidePath = path.join(root, "outside.partial");

    await expect(
      engine.publish(
        "8b0c4e2b-1234-4567-89ab-cdef01234567",
        outsidePath,
      ),
    ).rejects.toThrow("Path escapes storage root");
  });

  it("rejects a staging symlink", async () => {
    const engine = await createEngine();

    const outsidePath = path.join(root, "outside-file");

    await writeFile(outsidePath, "secret");

    const { stagingPath } = await engine.createStagingFile();

    await symlink(outsidePath, stagingPath);

    await expect(
      engine.publish(
        "8b0c4e2b-1234-4567-89ab-cdef01234567",
        stagingPath,
      ),
    ).rejects.toThrow();

    const linkInfo = await lstat(stagingPath);
    expect(linkInfo.isSymbolicLink()).toBe(true);
  });

  it("rejects a symlink at the published object path", async () => {
  const engine = await createEngine();

  const fileId = "22222222-1234-4123-8123-123456789abc";

  const targetDir = path.join(
    root,
    "files",
    "22",
    fileId,
  );

  const objectPath = path.join(targetDir, "object");
  const outsidePath = path.join(root, "outside-object");

  await import("node:fs/promises").then(
    async ({ mkdir, writeFile, symlink }) => {
      await mkdir(targetDir, { recursive: true });
      await writeFile(outsidePath, "outside secret");
      await symlink(outsidePath, objectPath);
    },
  );

  await expect(
    engine.inspect(fileId),
  ).rejects.toThrow();

  await expect(
    engine.verify(
      fileId,
      Buffer.byteLength("outside secret"),
      "invalid-hash",
    ),
  ).rejects.toThrow();
});

it("does not treat an object symlink as a published object", async () => {
  const engine = await createEngine();

  const fileId = "33333333-1234-4123-8123-123456789abc";

  const targetDir = path.join(
    root,
    "files",
    "33",
    fileId,
  );

  const objectPath = path.join(targetDir, "object");
  const outsidePath = path.join(root, "outside-object");

  const { mkdir, symlink, writeFile } =
    await import("node:fs/promises");

  await mkdir(targetDir, { recursive: true });
  await writeFile(outsidePath, "outside secret");
  await symlink(outsidePath, objectPath);

  const objects = await engine.scanObjects();

  expect(objects).not.toContain(objectPath);
});
});
