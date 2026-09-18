import { NextResponse } from "next/server";
import { Readable, Transform } from "node:stream";
import { randomUUID } from "node:crypto";
import { getCurrentUser } from "@/src/lib/auth/session";
import { getStorageEngine } from "@/src/lib/storage/engine";
import { config } from "@/src/lib/config";
import { sanitizeFilename, normalizeMimeType, assertSameOrigin } from "@/src/lib/security";
import { publishNewFile, listFiles } from "@/src/lib/files";
import { audit } from "@/src/lib/audit";
import { jsonError } from "@/src/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user || (user.role !== "ADMIN" && user.role !== "OWNER")) {
    return jsonError("Unauthorized", 401);
  }

  const url = new URL(request.url);

  const page = Number(url.searchParams.get("page") ?? "1");
  const pageSize = Number(url.searchParams.get("pageSize") ?? "50");
  const search = url.searchParams.get("search") ?? "";
  const department = url.searchParams.get("department") ?? "";
  const origin = url.searchParams.get("origin") ?? "";
  const state = url.searchParams.get("state") ?? "";

  if (!Number.isSafeInteger(page) || page < 1) {
    return jsonError("Invalid page", 400);
  }

  if (!Number.isSafeInteger(pageSize) || pageSize < 10 || pageSize > 100) {
    return jsonError("pageSize must be between 10 and 100", 400);
  }

  if (search.length > 100 || department.length > 128) {
    return jsonError("Search/filter value is too long", 400);
  }

  if (origin && origin !== "USER_UPLOAD" && origin !== "LEGACY_IMPORT") {
    return jsonError("Invalid origin", 400);
  }

  if (
    state &&
    state !== "STAGING" &&
    state !== "ACTIVE" &&
    state !== "QUARANTINED" &&
    state !== "PURGED"
  ) {
    return jsonError("Invalid state", 400);
  }

  const result = await listFiles({
    page,
    pageSize,
    search,
    department,
    origin: origin
      ? (origin as "USER_UPLOAD" | "LEGACY_IMPORT")
      : undefined,
    state: state
      ? (state as "STAGING" | "ACTIVE" | "QUARANTINED" | "PURGED")
      : undefined,
  });

  return NextResponse.json(result);
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await getCurrentUser();
    if (!user || (user.role !== "ADMIN" && user.role !== "OWNER")) return jsonError("Unauthorized", 401);

    const originalName = sanitizeFilename(decodeURIComponent(request.headers.get("x-file-name") ?? ""));
    const mimeType = normalizeMimeType(request.headers.get("content-type"));
    const contentLength = parseSizeHint(request.headers.get("x-file-size") ?? request.headers.get("content-length"));

    if (contentLength !== null && contentLength > config.maxUploadBytes) {
      return jsonError("File exceeds configured maximum upload size", 413);
    }

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
      const fileId = randomUUID();
      const versionId = randomUUID();
      await engine.publish(storageKey, stagingPath);
      if (!await engine.verify(storageKey, written.sizeBytes, written.sha256)) throw new Error("Final object verification failed");

      await publishNewFile({ id: fileId, versionId, originalName, mimeType, sizeBytes: written.sizeBytes, sha256: written.sha256, storageKey, createdBy: user.id });
      await audit("FILE_UPLOADED", user.id, "file", fileId, { storageKey, sizeBytes: written.sizeBytes, mimeType });
      return NextResponse.json({ fileId, versionId, storageKey, sizeBytes: written.sizeBytes, sha256: written.sha256 }, { status: 201 });
    } catch (error) {
      return jsonError(error instanceof Error ? error.message : "Upload failed", 400);
    }
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Upload failed", 400);
  }
}
