import { createHash, randomUUID } from "node:crypto";
import {
  createWriteStream,
  promises as fs,
  constants as fsConstants,
  type WriteStream,
} from "node:fs";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";

export const STORAGE_ROOT =
  process.env.NOTICEBOARD_STORAGE_ROOT ?? "/srv/noticeboard";

function shardFor(fileId: string): string {
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

export class StorageEngine {
  async init(): Promise<void> {
    await Promise.all([
      fs.mkdir(path.join(STORAGE_ROOT, "files"), { recursive: true }),
      fs.mkdir(path.join(STORAGE_ROOT, "staging"), { recursive: true }),
      fs.mkdir(path.join(STORAGE_ROOT, "quarantine", "objects"), { recursive: true }),
      fs.mkdir(path.join(STORAGE_ROOT, "quarantine", "partials"), { recursive: true }),
      fs.mkdir(path.join(STORAGE_ROOT, "tmp"), { recursive: true }),
      fs.mkdir(path.join(STORAGE_ROOT, "backups"), { recursive: true }),
    ]);
  }

  async createStagingFile(): Promise<{ uploadId: string; stagingPath: string }> {
    await this.init();
    const uploadId = randomUUID();
    return {
      uploadId,
      stagingPath: path.join(stagingDir(), `${uploadId}.partial`),
    };
  }

  async writeStream(
    input: Readable | NodeJS.ReadableStream,
    stagingPath: string,
  ): Promise<{ sizeBytes: number; sha256: string }> {
    const hash = createHash("sha256");
    let sizeBytes = 0;

    const hashing = new (class extends Readable {
      private source = input as AsyncIterable<Buffer | Uint8Array | string>;
      async *[Symbol.asyncIterator]() {
        for await (const chunk of this.source) {
          const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
          sizeBytes += buffer.length;
          hash.update(buffer);
          yield buffer;
        }
      }
      _read() {}
    })();

    await pipeline(hashing, createWriteStream(stagingPath, { flags: "wx" }));
    await fsyncFile(stagingPath);

    return { sizeBytes, sha256: hash.digest("hex") };
  }

  async publish(fileId: string, stagingPath: string): Promise<string> {
    const dir = objectDir(fileId);
    const target = objectPath(fileId);
    await fs.mkdir(dir, { recursive: true });
    await fs.rename(stagingPath, target);
    await fsyncDirectory(dir);
    return target;
  }

  async inspect(fileId: string) {
    const target = objectPath(fileId);
    const stat = await fs.stat(target);
    return { path: target, sizeBytes: stat.size };
  }

  async verify(
    fileId: string,
    expectedSizeBytes: number,
    expectedSha256: string,
  ): Promise<boolean> {
    const target = objectPath(fileId);
    const stat = await fs.stat(target);
    if (stat.size !== expectedSizeBytes) return false;

    const hash = createHash("sha256");
    const stream = (await import("node:fs")).createReadStream(target);
    for await (const chunk of stream) hash.update(chunk as Buffer);
    return hash.digest("hex") === expectedSha256;
  }

  async quarantine(fileId: string): Promise<void> {
    const source = objectPath(fileId);
    const target = path.join(
      STORAGE_ROOT,
      "quarantine",
      "objects",
      `${fileId}-${Date.now()}`,
    );
    await fs.rename(source, target);
    await fsyncDirectory(path.dirname(target));
  }

  async purgeQuarantine(pathname: string): Promise<void> {
    const resolved = path.resolve(pathname);
    const root = path.resolve(path.join(STORAGE_ROOT, "quarantine"));
    if (!resolved.startsWith(`${root}${path.sep}`)) {
      throw new Error("Refusing to purge path outside quarantine");
    }
    await fs.unlink(resolved);
  }

  async scanStaging(): Promise<string[]> {
    await this.init();
    return fs.readdir(stagingDir());
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
    const totalBytes = Number(stat.blocks) * Number(stat.bsize);
    const freeBytes = Number(stat.bavail) * Number(stat.bsize);
    const usedBytes = Math.max(0, totalBytes - freeBytes);
    return {
      writable: true,
      usagePercent: totalBytes > 0 ? (usedBytes / totalBytes) * 100 : 100,
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
