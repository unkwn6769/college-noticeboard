import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { Readable, Transform } from "node:stream";
import { getCurrentUser } from "@/src/lib/auth/session";
import { getStorageEngine } from "@/src/lib/storage/engine";
import { config } from "@/src/lib/config";
import { sanitizeFilename, normalizeMimeType, assertSameOrigin } from "@/src/lib/security";
import { replaceFile } from "@/src/lib/files";
import { jsonError } from "@/src/lib/http";

export const runtime = "nodejs";

function webBodyToNodeStream(body: NonNullable<Request["body"]>): Readable {
  return Readable.from((async function* () {
    const reader = body.getReader();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        yield Buffer.from(value);
      }
    } finally {
      reader.releaseLock();
    }
  })());
}

function limitedStream(input: Readable, maxBytes: number): Readable {
  let total = 0;
  return input.pipe(new Transform({
    transform(chunk, _encoding, callback) {
      total += Buffer.byteLength(chunk);
      if (total > maxBytes) {
        callback(new Error("Upload exceeds configured maximum"));
        return;
      }
      callback(null, chunk);
    },
  }));
}

function parseSizeHint(value: string | null): number | null {
  if (value === null) return null;
  const size = Number(value);
  if (!Number.isSafeInteger(size) || size < 0) throw new Error("Invalid upload size");
  return size;
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    assertSameOrigin(request);
    const user = await getCurrentUser();
    if (!user || (user.role !== "ADMIN" && user.role !== "OWNER")) return jsonError("Unauthorized", 401);

    const { id } = await context.params;
    const originalName = sanitizeFilename(decodeURIComponent(request.headers.get("x-file-name") ?? ""));
    const mimeType = normalizeMimeType(request.headers.get("content-type"));
    const contentLength = parseSizeHint(request.headers.get("x-file-size") ?? request.headers.get("content-length"));
    if (contentLength !== null && contentLength > config.maxUploadBytes) return jsonError("File exceeds configured maximum upload size", 413);

    const engine = getStorageEngine();
    await engine.assertUploadCapacity(contentLength, config.largeUploadBytes, config.storageReserveBytes);
    if (!request.body) return jsonError("Request body is required");

    const { stagingPath } = await engine.createStagingFile();
    try {
      const stream = webBodyToNodeStream(request.body);
      const written = await engine.writeStream(limitedStream(stream, config.maxUploadBytes), stagingPath);
      await engine.assertUploadCapacity(written.sizeBytes, config.largeUploadBytes, config.storageReserveBytes);
      await engine.finalizeWrite(stagingPath, written.sizeBytes, written.sha256);

      const storageKey = engine.createStorageKey();
      await engine.publish(storageKey, stagingPath);
      if (!await engine.verify(storageKey, written.sizeBytes, written.sha256)) throw new Error("Final object verification failed");

      const versionId = randomUUID();
      const result = await replaceFile({ fileId: id, versionId, originalName, mimeType, sizeBytes: written.sizeBytes, sha256: written.sha256, storageKey, actorId: user.id });
      return NextResponse.json({ ok: true, versionNumber: result.versionNumber, storageKey, physicalCleanup: "pending" });
    } catch (error) {
      return jsonError(error instanceof Error ? error.message : "Replacement failed", 400);
    }
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Replacement failed", 400);
  }
}
