// Production migration transfer path: Google Drive -> Google Drive via server-side files.copy().
// No local download/upload fallback is permitted.

const SHARE_COPY_RETRY_DELAYS_MS = [50, 125, 250, 400];
const DRIVE_THROTTLE_RETRY_DELAYS_MS = [100, 250, 600, 1200];
const TEMP_PERMISSION_EXPIRATION_MS = 15 * 60 * 1000;
const configuredDriveOperationTimeoutMs = Number(
  process.env.MIGRATION_DRIVE_OPERATION_TIMEOUT_MS
);
const DRIVE_OPERATION_TIMEOUT_MS =
  Number.isFinite(configuredDriveOperationTimeoutMs) &&
  configuredDriveOperationTimeoutMs > 0
    ? Math.max(10_000, configuredDriveOperationTimeoutMs)
    : 120_000;

function createDriveOperationController(parentSignal) {
  const controller = new AbortController();
  const onParentAbort = () => {
    controller.abort(parentSignal?.reason);
  };

  if (parentSignal?.aborted) {
    onParentAbort();
  } else {
    parentSignal?.addEventListener("abort", onParentAbort, { once: true });
  }

  return {
    controller,
    signal: controller.signal,
    dispose() {
      parentSignal?.removeEventListener("abort", onParentAbort);
    },
  };
}

export async function withDriveOperationTimeout(
  operation,
  parentSignal,
  timeoutMs = DRIVE_OPERATION_TIMEOUT_MS
) {
  const scoped = createDriveOperationController(parentSignal);
  let timer;
  const timeoutError = new Error(
    `Google Drive operation timed out after ${timeoutMs}ms`
  );
  timeoutError.code = "DRIVE_OPERATION_TIMEOUT";
  timeoutError.response = { status: 408 };

  const operationPromise = Promise.resolve().then(() =>
    operation(scoped.signal)
  );

  const timeoutPromise = new Promise((_, reject) => {
    timer = setTimeout(() => {
      scoped.controller.abort(timeoutError);
      reject(timeoutError);
    }, timeoutMs);
  });

  try {
    return await Promise.race([operationPromise, timeoutPromise]);
  } finally {
    clearTimeout(timer);
    scoped.dispose();
  }
}

function getDriveErrorStatus(error) {
  return Number(error?.response?.status ?? error?.code ?? 0) || 0;
}

function getDriveErrorReason(error) {
  return String(
    error?.response?.data?.error?.errors?.[0]?.reason ??
      error?.response?.data?.error?.status ??
      error?.errors?.[0]?.reason ??
      ""
  );
}

function isRetryableDriveThrottle(error) {
  const status = getDriveErrorStatus(error);
  const reason = getDriveErrorReason(error);

  return (
    status === 429 ||
    (status === 403 &&
      ["rateLimitExceeded", "userRateLimitExceeded"].includes(reason))
  );
}

function getRetryDelayWithJitter(delayMs) {
  return delayMs + Math.floor(Math.random() * Math.min(100, Math.max(10, delayMs / 4)));
}


function getNumericBytes(value) {
  if (value === null || value === undefined || value === "") return null;
  try {
    const n = Number(String(value));
    return Number.isFinite(n) && n >= 0 ? n : null;
  } catch {
    return null;
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function deleteTemporaryPermission({
  sourceDrive,
  fileId,
  permissionId,
  log,
}) {
  if (!permissionId) return;

  try {
    await withDriveOperationTimeout(
      (signal) =>
        sourceDrive.permissions.delete(
          {
            fileId,
            permissionId,
            supportsAllDrives: true,
          },
          { signal }
        ),
      undefined
    );
  } catch (error) {
    const status = getDriveErrorStatus(error);
    if (status !== 404) {
      log(
        `Temporary source permission cleanup failed for ${fileId}: ` +
          `${error instanceof Error ? error.message : String(error)}`
      );
    }
  }
}

async function createTemporarySourcePermission({
  sourceDrive,
  sourceMetadata,
  targetAccount,
  abortController,
  log,
  operationTimeoutMs = DRIVE_OPERATION_TIMEOUT_MS,
  role = "reader",
}) {
  const response = await withDriveOperationTimeout(
    (signal) =>
      sourceDrive.permissions.create(
        {
          fileId: sourceMetadata.id,
      requestBody: {
        type: "user",
        role,
        emailAddress: targetAccount.email,
        expirationTime: new Date(
          Date.now() + TEMP_PERMISSION_EXPIRATION_MS
        ).toISOString(),
      },
      sendNotificationEmail: false,
      supportsAllDrives: true,
          fields: "id,type,role,emailAddress",
        },
        { signal }
      ),
    abortController?.signal
  );

  const permissionId = response?.data?.id;
  if (!permissionId) {
    throw new Error(
      `Google Drive did not return a permission ID for temporary sharing of ${sourceMetadata.name}`
    );
  }

  log(
    `Temporarily shared ${sourceMetadata.name} with ${targetAccount.email} ` +
      `for Google-side copy`
  );

  return permissionId;
}

async function copyOnce({
  targetDrive,
  sourceMetadata,
  item,
  abortController,
  operationTimeoutMs = DRIVE_OPERATION_TIMEOUT_MS,
}) {
  return withDriveOperationTimeout(
    (signal) =>
      targetDrive.files.copy(
        {
          fileId: sourceMetadata.id,
          requestBody: {
            name: sourceMetadata.name,
            parents: ["root"],
            appProperties: {
              college_noticeboard_migration_item: item.id,
            },
          },
          supportsAllDrives: true,
          fields: "id,name,size,mimeType,md5Checksum,appProperties",
        },
        { signal }
      ),
    abortController?.signal,
    operationTimeoutMs
  );
}

async function copyOnceWithThrottleRetry(args, log, label) {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await copyOnce(args);
    } catch (error) {
      if (attempt >= DRIVE_THROTTLE_RETRY_DELAYS_MS.length || !isRetryableDriveThrottle(error)) {
        throw error;
      }

      const delayMs = getRetryDelayWithJitter(
        DRIVE_THROTTLE_RETRY_DELAYS_MS[attempt]
      );

      log(
        `Drive API throttled ${label}; retrying in ${delayMs}ms ` +
          `(attempt ${attempt + 1}/${DRIVE_THROTTLE_RETRY_DELAYS_MS.length})`
      );

      await sleep(delayMs);
    }
  }
}

async function copyWithTemporarySourcePermission({
  sourceDrive,
  targetDrive,
  sourceMetadata,
  targetAccount,
  item,
  abortController,
  log,
  operationTimeoutMs = DRIVE_OPERATION_TIMEOUT_MS,
  role = "reader",
}) {
  const permissionId = await createTemporarySourcePermission({
    sourceDrive,
    sourceMetadata,
    targetAccount,
    abortController,
    log,
    role,
    operationTimeoutMs,
  });

  try {
    let lastError = null;

    for (const delayMs of [0, ...SHARE_COPY_RETRY_DELAYS_MS]) {
      if (delayMs > 0) {
        await sleep(delayMs);
      }

      try {
        return await copyOnceWithThrottleRetry(
          {
            targetDrive,
            sourceMetadata,
            item,
            abortController,
            operationTimeoutMs,
          },
          log,
          `temporary-copy ${sourceMetadata.name}`
        );
      } catch (error) {
        lastError = error;
        if (getDriveErrorStatus(error) !== 404) {
          throw error;
        }
      }
    }

    throw lastError ?? new Error("Google-side copy remained unavailable after temporary sharing");
  } finally {
    void deleteTemporaryPermission({
      sourceDrive,
      fileId: sourceMetadata.id,
      permissionId,
      log,
    });
  }
}

export async function tryServerSideDriveCopy({
  sourceDrive,
  targetDrive,
  targetAccount,
  item,
  sourceMetadata,
  abortController,
  ensureHeartbeatStillValid,
  workerNumber,
  log,
  enabled =
    String(process.env.MIGRATION_SERVER_SIDE_COPY || "").toLowerCase() ===
    "true",
  markItemReconcilingFn,
  reconciliationDeadlineMs = 10 * 60 * 1000,
  operationTimeoutMs = DRIVE_OPERATION_TIMEOUT_MS
}) {
  if (!enabled) {
    throw new Error("Server-side Google Drive copy is required for migrations");
  }

  ensureHeartbeatStillValid();

  const copyStartedAt = Date.now();

  log(
    `Google-side copy ${sourceMetadata.name} ` +
      `from ${sourceMetadata.id} to ${targetAccount.email}`
  );

  let copyResponse;

  try {
    copyResponse = await copyOnceWithThrottleRetry(
      {
        targetDrive,
        sourceMetadata,
        item,
        abortController,
        operationTimeoutMs,
      },
      log,
      sourceMetadata.name
    );
  } catch (error) {
    let status = getDriveErrorStatus(error);

    if (status === 404) {
      const temporaryShareRole =
        sourceMetadata.copyRequiresWriterPermission === true
          ? "writer"
          : "reader";
      const writerShareEnabled =
        temporaryShareRole !== "writer" ||
        String(
          process.env.MIGRATION_SERVER_SIDE_COPY_TEMPORARY_WRITER || "true"
        ).toLowerCase() === "true";
      const shouldTryShare = Boolean(
        sourceDrive && targetAccount?.email && writerShareEnabled
      );

      if (shouldTryShare) {
        try {
          copyResponse = await copyWithTemporarySourcePermission({
            targetDrive,
            sourceDrive,
            sourceMetadata,
            targetAccount,
            item,
            abortController,
            log,
            operationTimeoutMs,
            role: temporaryShareRole,
          });
        } catch (shareCopyError) {
          error = shareCopyError;
          status = getDriveErrorStatus(shareCopyError);
        }
      }

      if (copyResponse) {
        // Continue with the normal successful-copy path below.
      } else if (status === 404) {
        const reason = shouldTryShare
          ? "temporary source share did not make the file copyable"
          : sourceMetadata.copyRequiresWriterPermission === true && !writerShareEnabled
            ? "copy restriction requires temporary writer access, which is disabled"
            : "target cannot be granted temporary source access";
        throw new Error(
          `Server-side Google Drive copy unavailable for ${sourceMetadata.name}: ${reason}`
        );
      }
    }

    if (!copyResponse) {
      if ([400, 403].includes(status)) {
        throw new Error(
          `Server-side Google Drive copy rejected for ${sourceMetadata.name} (${status}): ${error instanceof Error ? error.message : String(error)}`
        );
      }

      const ambiguous =
        status === 0 ||
        status === 408 ||
        status === 409 ||
        status === 429 ||
        status >= 500;

      if (ambiguous) {
        const reason =
          `Google-side copy outcome is uncertain for ${item.id}: ` +
          `${error instanceof Error ? error.message : String(error)}`;

        await markItemReconcilingFn(
          item.id,
          item.lease_generation,
          reason,
          reconciliationDeadlineMs
        );

        return {
          kind: "reconciling",
          status: "reconciling",
          itemId: item.id,
          sourceFileId: item.source_file_id,
          workerNumber,
          reason,
        };
      }

      throw error;
    }
  }

  const copyElapsedMs = Date.now() - copyStartedAt;
  const target = copyResponse?.data;

  if (!target?.id) {
    const reason =
      `Google-side copy returned no target file ID for migration item ${item.id}`;

    await markItemReconcilingFn(
      item.id,
      item.lease_generation,
      reason,
      reconciliationDeadlineMs
    );

    return {
      kind: "reconciling",
      status: "reconciling",
      itemId: item.id,
      sourceFileId: item.source_file_id,
      workerNumber,
      reason,
    };
  }

  ensureHeartbeatStillValid();

  log(
    `Google-side copy completed for ${sourceMetadata.name} ` +
      `in ${copyElapsedMs}ms (API-operation latency; not Render wire throughput)`
  );

  return {
    kind: "copied",
    targetFileId: target.id,
    targetMetadata: target,
    copyElapsedMs,
  };
}
