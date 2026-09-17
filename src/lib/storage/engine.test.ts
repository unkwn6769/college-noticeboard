import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  lstat,
  mkdtemp,
  rm,
  stat,
  symlink,
  writeFile,
  unlink,
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

  it("generates unique storage keys", async () => {
    const engine = await createEngine();

    const first = engine.createStorageKey();
    const second = engine.createStorageKey();

    expect(first).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
    expect(second).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
    expect(first).not.toBe(second);
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
  it("finalizes a staged file after verifying size and SHA-256", async () => {
    const engine = await createEngine();
    const { stagingPath } = await engine.createStagingFile();

    const payload = Buffer.from("finalize-write-test");
    const written = await engine.writeStream(
      Readable.from([payload]),
      stagingPath,
    );

    const finalized = await engine.finalizeWrite(
      stagingPath,
      written.sizeBytes,
      written.sha256,
    );

    expect(finalized).toEqual(written);
  });

  it("rejects a staged file with a size mismatch", async () => {
    const engine = await createEngine();
    const { stagingPath } = await engine.createStagingFile();

    const payload = Buffer.from("size-mismatch-test");
    const written = await engine.writeStream(
      Readable.from([payload]),
      stagingPath,
    );

    await expect(
      engine.finalizeWrite(
        stagingPath,
        written.sizeBytes + 1,
        written.sha256,
      ),
    ).rejects.toThrow("Staging file size mismatch");
  });

  it("rejects a staged file with a checksum mismatch", async () => {
    const engine = await createEngine();
    const { stagingPath } = await engine.createStagingFile();

    const payload = Buffer.from("checksum-mismatch-test");
    const written = await engine.writeStream(
      Readable.from([payload]),
      stagingPath,
    );

    await expect(
      engine.finalizeWrite(
        stagingPath,
        written.sizeBytes,
        "0000000000000000000000000000000000000000000000000000000000000000",
      ),
    ).rejects.toThrow("Staging file checksum mismatch");
  });

  it("rejects a staging symlink during finalize", async () => {
    const engine = await createEngine();
    const { stagingPath } = await engine.createStagingFile();

    const realPath = path.join(
      path.dirname(stagingPath),
      "real-file.partial",
    );
    await writeFile(stagingPath, Buffer.from("symlink-finalize-test"));
    await writeFile(realPath, Buffer.from("symlink-finalize-test"));
    await unlink(stagingPath);
    await symlink(realPath, stagingPath);

    await expect(
      engine.finalizeWrite(
        stagingPath,
        Buffer.byteLength("symlink-finalize-test"),
        "invalid",
      ),
    ).rejects.toThrow("Staging path must be a regular file");
  });

  it("publishes a staged object using the UUID shard layout", async () => {
    const engine = await createEngine();

    const storageKey = "8b0c4e2b-1234-4567-89ab-cdef01234567";

    const { stagingPath } = await engine.createStagingFile();

    const input = Readable.from([
      Buffer.from("college noticeboard"),
    ]);

    const result = await engine.writeStream(input, stagingPath);

    const publishedPath = await engine.publish(storageKey, stagingPath);

    expect(publishedPath).toBe(
      path.join(
        root,
        "files",
        "8b",
        storageKey,
        "object",
      ),
    );

    expect(await stat(publishedPath)).toBeTruthy();

    await expect(stat(stagingPath)).rejects.toMatchObject({
      code: "ENOENT",
    });

    expect(
      await engine.verify(
        storageKey,
        result.sizeBytes,
        result.sha256,
      ),
    ).toBe(true);
  });

  it("inspects a published object", async () => {
    const engine = await createEngine();

    const storageKey = "12345678-1234-4234-8234-123456789abc";

    const { stagingPath } = await engine.createStagingFile();

    const input = Readable.from([
      Buffer.from("exam timetable"),
    ]);

    const result = await engine.writeStream(input, stagingPath);

    await engine.publish(storageKey, stagingPath);

    const info = await engine.inspect(storageKey);

    expect(info.path).toBe(
      path.join(
        root,
        "files",
        "12",
        storageKey,
        "object",
      ),
    );

    expect(info.sizeBytes).toBe(result.sizeBytes);
  });

  it("refuses to overwrite an existing published object", async () => {
  const engine = await createEngine();

  const storageKey = "11111111-1234-4123-8123-123456789abc";

  const first = await engine.createStagingFile();

  const firstResult = await engine.writeStream(
    Readable.from([Buffer.from("original content")]),
    first.stagingPath,
  );

  const publishedPath = await engine.publish(
    storageKey,
    first.stagingPath,
  );

  const second = await engine.createStagingFile();

  await engine.writeStream(
    Readable.from([Buffer.from("replacement content")]),
    second.stagingPath,
  );

  await expect(
    engine.publish(storageKey, second.stagingPath),
  ).rejects.toMatchObject({
    code: "EEXIST",
  });

  await expect(stat(second.stagingPath)).resolves.toBeTruthy();

  const info = await engine.inspect(storageKey);

  expect(info.path).toBe(publishedPath);
  expect(info.sizeBytes).toBe(firstResult.sizeBytes);

  expect(
    await engine.verify(
      storageKey,
      firstResult.sizeBytes,
      firstResult.sha256,
    ),
  ).toBe(true);
});

  it("allows distinct storage keys to coexist", async () => {
    const engine = await createEngine();

    const first = await engine.createStagingFile();
    await engine.writeStream(
      Readable.from([Buffer.from("version-one")]),
      first.stagingPath,
    );

    const second = await engine.createStagingFile();
    await engine.writeStream(
      Readable.from([Buffer.from("version-two")]),
      second.stagingPath,
    );

    const storageKeyA = "11111111-1111-4111-8111-111111111111";
    const storageKeyB = "22222222-2222-4222-8222-222222222222";

    await engine.publish(storageKeyA, first.stagingPath);
    await engine.publish(storageKeyB, second.stagingPath);

    await expect(engine.inspect(storageKeyA)).resolves.toMatchObject({
      sizeBytes: Buffer.byteLength("version-one"),
    });

    await expect(engine.inspect(storageKeyB)).resolves.toMatchObject({
      sizeBytes: Buffer.byteLength("version-two"),
    });
  });

  it("detects a corrupted published object", async () => {
    const engine = await createEngine();

    const storageKey = "abcdef12-1234-4123-8123-123456789abc";

    const { stagingPath } = await engine.createStagingFile();

    const input = Readable.from([
      Buffer.from("original content"),
    ]);

    const result = await engine.writeStream(input, stagingPath);

    await engine.publish(storageKey, stagingPath);

    const publishedPath = path.join(
      root,
      "files",
      "ab",
      storageKey,
      "object",
    );

    await import("node:fs/promises").then(({ writeFile }) =>
      writeFile(publishedPath, "corrupted content"),
    );

    const valid = await engine.verify(
      storageKey,
      result.sizeBytes,
      result.sha256,
    );

    expect(valid).toBe(false);
  });

  it("quarantines a published object", async () => {
    const engine = await createEngine();

    const storageKey = "deadbeef-1234-4123-8123-123456789abc";

    const { stagingPath } = await engine.createStagingFile();

    await engine.writeStream(
      Readable.from([Buffer.from("quarantine me")]),
      stagingPath,
    );

    await engine.publish(storageKey, stagingPath);

    const quarantinePath = await engine.quarantine(storageKey);

    expect(quarantinePath).toContain(
      path.join("quarantine", "objects", storageKey),
    );

    await expect(
      engine.inspect(storageKey),
    ).rejects.toMatchObject({
      code: "ENOENT",
    });

    expect(await stat(quarantinePath)).toBeTruthy();
  });

  it("rejects quarantining a symlink", async () => {
    const engine = await createEngine();

    const storageKey = "33333333-3333-4333-8333-333333333333";
    const { stagingPath } = await engine.createStagingFile();

    await engine.writeStream(
      Readable.from([Buffer.from("quarantine-symlink-test")]),
      stagingPath,
    );

    const publishedPath = await engine.publish(
      storageKey,
      stagingPath,
    );

    const realPath = path.join(root, "real-quarantine-target");
    await writeFile(
      realPath,
      Buffer.from("quarantine-symlink-test"),
    );
    await unlink(publishedPath);
    await symlink(realPath, publishedPath);

    await expect(
      engine.quarantine(storageKey),
    ).rejects.toThrow("Object must be a regular file");
  });

  it("rejects purging a quarantine symlink", async () => {
    const engine = await createEngine();
    await engine.init();

    const quarantineRoot = path.join(
      root,
      "quarantine",
      "objects",
    );
    const realPath = path.join(
      quarantineRoot,
      "real-quarantine-object",
    );
    const linkPath = path.join(
      quarantineRoot,
      "quarantine-link",
    );

    await writeFile(
      realPath,
      Buffer.from("purge-symlink-test"),
    );
    await symlink(realPath, linkPath);

    await expect(
      engine.purgeQuarantine(linkPath),
    ).rejects.toThrow(
      "Quarantine path must be a regular file",
    );

    const linkInfo = await lstat(linkPath);
    expect(linkInfo.isSymbolicLink()).toBe(true);
  });

  it("purges a quarantined object", async () => {
    const engine = await createEngine();

    const storageKey = "feedface-1234-4123-8123-123456789abc";

    const { stagingPath } = await engine.createStagingFile();

    await engine.writeStream(
      Readable.from([Buffer.from("delete me")]),
      stagingPath,
    );

    await engine.publish(storageKey, stagingPath);

    const quarantinePath = await engine.quarantine(storageKey);

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

  it("rejects invalid storage keys", async () => {
    const engine = await createEngine();

    const { stagingPath } = await engine.createStagingFile();

    await engine.writeStream(
      Readable.from([Buffer.from("test")]),
      stagingPath,
    );

    await expect(
      engine.publish("../escape", stagingPath),
    ).rejects.toThrow("Invalid storage key");
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

  const storageKey = "22222222-1234-4123-8123-123456789abc";

  const targetDir = path.join(
    root,
    "files",
    "22",
    storageKey,
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
    engine.inspect(storageKey),
  ).rejects.toThrow();

  await expect(
    engine.verify(
      storageKey,
      Buffer.byteLength("outside secret"),
      "invalid-hash",
    ),
  ).rejects.toThrow();
});

it("does not treat an object symlink as a published object", async () => {
  const engine = await createEngine();

  const storageKey = "33333333-1234-4123-8123-123456789abc";

  const targetDir = path.join(
    root,
    "files",
    "33",
    storageKey,
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
