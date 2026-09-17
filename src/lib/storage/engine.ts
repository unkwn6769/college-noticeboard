import { createHash, randomUUID } from "node:crypto";
import {
  createReadStream,
  createWriteStream,
  promises as fs,
  constants as fsConstants,
} from "node:fs";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { Transform, type Readable } from "node:stream";

export const STORAGE_ROOT =
  process.env.NOTICEBOARD_STORAGE_ROOT ?? "/srv/noticeboard";

const FILE_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function assertFileId(fileId: string): void {
  if (!FILE_ID_PATTERN.test(fileId)) {
    throw new Error("Invalid file ID");
  }
}

function shardFor(fileId: string): string {
  assertFileId(fileId);
  return fileId.slice(0, 2).toLowerCase();
}

function objectDir(fileId: string): string {
  return path.join(STORAGE_ROOT, "files", shardFor(fileId), fileId);
}

function objectPath(fileId: string): string {
  return path.join(objectDir(fileId), "object");
}

function stagingDir(): string {
  return path.join(STORAGE_ROOT, "staging");
}

async function fsyncFile(filePath: string): Promise<void> {
  const handle = await fs.open(filePath, fsConstants.O_RDONLY);

  try {
    await handle.sync();
  } finally {
    await handle.close();
  }
}

async function fsyncDirectory(dir: string): Promise<void> {
  const handle = await fs.open(dir, fsConstants.O_RDONLY);

  try {
    await handle.sync();
  } finally {
    await handle.close();
  }
}

function assertInsideRoot(candidate: string, root: string): void {
  const resolvedCandidate = path.resolve(candidate);
  const resolvedRoot = path.resolve(root);

  if (
    resolvedCandidate !== resolvedRoot &&
    !resolvedCandidate.startsWith(`${resolvedRoot}${path.sep}`)
  ) {
    throw new Error("Path escapes storage root");
  }
}

export class StorageEngine {
  async init(): Promise<void> {
    await Promise.all([
      fs.mkdir(path.join(STORAGE_ROOT, "files"), { recursive: true }),
      fs.mkdir(path.join(STORAGE_ROOT, "staging"), { recursive: true }),
      fs.mkdir(
        path.join(STORAGE_ROOT, "quarantine", "objects"),
        { recursive: true },
      ),
      fs.mkdir(
        path.join(STORAGE_ROOT, "quarantine", "partials"),
        { recursive: true },
      ),
      fs.mkdir(path.join(STORAGE_ROOT, "tmp"), { recursive: true }),
      fs.mkdir(path.join(STORAGE_ROOT, "backups"), { recursive: true }),
    ]);
  }

  async createStagingFile(): Promise<{
    uploadId: string;
    stagingPath: string;
  }> {
    await this.init();

    const uploadId = randomUUID();
    const stagingPath = path.join(stagingDir(), `${uploadId}.partial`);

    assertInsideRoot(stagingPath, stagingDir());

    return {
      uploadId,
      stagingPath,
    };
  }

  async writeStream(
    input: Readable | NodeJS.ReadableStream,
    stagingPath: string,
  ): Promise<{ sizeBytes: number; sha256: string }> {
    const stagingRoot = path.resolve(stagingDir());
    assertInsideRoot(stagingPath, stagingRoot);

    const hash = createHash("sha256");
    let sizeBytes = 0;

    const source = input as AsyncIterable<
      Buffer | Uint8Array | string
    >;

    const hashingTransform = new Transform({
      transform(chunk, _encoding, callback) {
        try {
          const buffer = Buffer.isBuffer(chunk)
            ? chunk
            : Buffer.from(chunk);

          sizeBytes += buffer.length;
          hash.update(buffer);

          callback(null, buffer);
        } catch (error) {
          callback(error as Error);
        }
      },
    });

    await pipeline(
      source,
      hashingTransform,
      createWriteStream(stagingPath, { flags: "wx" }),
    );

    await fsyncFile(stagingPath);

    return {
      sizeBytes,
      sha256: hash.digest("hex"),
    };
  }

  async finalizeWrite(
    stagingPath: string,
    expectedSizeBytes: number,
    expectedSha256: string,
  ): Promise<{ sizeBytes: number; sha256: string }> {
    const expectedStagingRoot = path.resolve(stagingDir());
    assertInsideRoot(stagingPath, expectedStagingRoot);

    const stagingInfo = await fs.lstat(stagingPath);

    if (!stagingInfo.isFile()) {
      throw new Error("Staging path must be a regular file");
    }

    if (stagingInfo.size !== expectedSizeBytes) {
      throw new Error("Staging file size mismatch");
    }

    await fsyncFile(stagingPath);

    const hash = createHash("sha256");

    for await (const chunk of createReadStream(stagingPath)) {
      hash.update(chunk as Buffer);
    }

    const sha256 = hash.digest("hex");

    if (sha256 !== expectedSha256) {
      throw new Error("Staging file checksum mismatch");
    }

    return {
      sizeBytes: stagingInfo.size,
      sha256,
    };
  }

  async publish(fileId: string, stagingPath: string): Promise<string> {
  assertFileId(fileId);

  const expectedStagingRoot = path.resolve(stagingDir());
  assertInsideRoot(stagingPath, expectedStagingRoot);

  const stagingInfo = await fs.lstat(stagingPath);

  if (!stagingInfo.isFile()) {
    throw new Error("Staging path must be a regular file");
  }

  const shard = path.join(
    STORAGE_ROOT,
    "files",
    shardFor(fileId),
  );

  const dir = objectDir(fileId);
  const target = objectPath(fileId);

  // The file-id directory itself is the no-overwrite guard.
  // Only one publisher can create it.
  await fs.mkdir(shard, { recursive: true });
  await fs.mkdir(dir);

  // Make the newly created object directory durable.
  await fsyncDirectory(shard);

  // Final object publication remains atomic.
  await fs.rename(stagingPath, target);
  await fsyncDirectory(dir);

  return target;
}

  async inspect(fileId: string): Promise<{
    path: string;
    sizeBytes: number;
  }> {
    assertFileId(fileId);

    const target = objectPath(fileId);
    const info = await fs.lstat(target);

    if (!info.isFile()) {
      throw new Error("Object must be a regular file");
    }

    return {
      path: target,
      sizeBytes: info.size,
    };
  }

  async verify(
    fileId: string,
    expectedSizeBytes: number,
    expectedSha256: string,
  ): Promise<boolean> {
    assertFileId(fileId);

    const target = objectPath(fileId);
    const info = await fs.lstat(target);

    if (!info.isFile()) {
      throw new Error("Object must be a regular file");
    }

    if (info.size !== expectedSizeBytes) {
      return false;
    }

    const hash = createHash("sha256");

    for await (const chunk of createReadStream(target)) {
      hash.update(chunk as Buffer);
    }

    return hash.digest("hex") === expectedSha256;
  }

  async quarantine(fileId: string): Promise<string> {
    assertFileId(fileId);

    const source = objectPath(fileId);
    const quarantineRoot = path.join(
      STORAGE_ROOT,
      "quarantine",
      "objects",
    );

    const target = path.join(
      quarantineRoot,
      `${fileId}-${randomUUID()}`,
    );

    await fs.rename(source, target);
    await fsyncDirectory(quarantineRoot);

    return target;
  }

  async purgeQuarantine(pathname: string): Promise<void> {
    const quarantineRoot = path.resolve(
      path.join(STORAGE_ROOT, "quarantine"),
    );

    const resolved = path.resolve(pathname);

    assertInsideRoot(resolved, quarantineRoot);

    await fs.unlink(resolved);
  }

  async scanStaging(): Promise<string[]> {
    await this.init();

    return fs.readdir(stagingDir());
  }

  async scanObjects(): Promise<string[]> {
    await this.init();

    const root = path.join(STORAGE_ROOT, "files");
    const objects: string[] = [];

    for (const shard of await fs.readdir(root, { withFileTypes: true })) {
      if (!shard.isDirectory() || !/^[0-9a-f]{2}$/i.test(shard.name)) {
        continue;
      }

      const shardDir = path.join(root, shard.name);

      for (const fileDir of await fs.readdir(shardDir, {
        withFileTypes: true,
      })) {
        if (!fileDir.isDirectory() || !FILE_ID_PATTERN.test(fileDir.name)) {
          continue;
        }

        const object = path.join(
          shardDir,
          fileDir.name,
          "object",
        );

        try {
          const info = await fs.lstat(object);

          if (info.isFile()) {
            objects.push(object);
          }
        } catch (error) {
          const code =
            error instanceof Error && "code" in error
              ? error.code
              : undefined;

          if (code !== "ENOENT") {
            throw error;
          }
        }
      }
    }

    return objects;
  }

  async getDiskStats(): Promise<{
    writable: boolean;
    usagePercent: number;
    freeBytes: number;
    totalBytes: number;
  }> {
    await this.init();

    await fs.access(STORAGE_ROOT, fsConstants.W_OK);

    const stat = await fs.statfs(STORAGE_ROOT);

    const totalBytes =
      Number(stat.blocks) * Number(stat.bsize);

    const freeBytes =
      Number(stat.bavail) * Number(stat.bsize);

    const usedBytes = Math.max(
      0,
      totalBytes - freeBytes,
    );

    return {
      writable: true,
      usagePercent:
        totalBytes > 0
          ? (usedBytes / totalBytes) * 100
          : 100,
      freeBytes,
      totalBytes,
    };
  }
}

let engine: StorageEngine | undefined;

export function getStorageEngine(): StorageEngine {
  engine ??= new StorageEngine();
  return engine;
}