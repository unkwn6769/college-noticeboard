function finiteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function elapsedSeconds(startedAt, endedAt, now = Date.now()) {
  if (!startedAt) {
    return null;
  }

  const start = new Date(startedAt).getTime();
  const end = endedAt
    ? new Date(endedAt).getTime()
    : now;

  if (!Number.isFinite(start) || !Number.isFinite(end)) {
    return null;
  }

  return Math.max(0, (end - start) / 1000);
}

export function deriveMigrationTelemetry(
  latest,
  previous = null,
  now = Date.now(),
) {
  if (!latest?.live) {
    return {
      migrationElapsedSeconds: null,
      overallSpeedBytesPerSecond: null,
      totalEtaSeconds: null,
      currentFile: null,
    };
  }

  const live = latest.live;
  const completedFiles = Number(latest.transferredFiles ?? 0);
  const totalFiles = Number(latest.totalFiles ?? 0);
  const active =
    latest.status === "pending" ||
    latest.status === "running" ||
    latest.status === "waiting_for_storage";

  const completedFileDelta = previous
    ? completedFiles - Number(previous.completedFiles ?? 0)
    : 0;
  const secondsSincePrevious = previous
    ? (now - previous.timestamp) / 1000
    : 0;
  const filesPerMinute =
    completedFileDelta > 0 && secondsSincePrevious > 0
      ? (completedFileDelta / secondsSincePrevious) * 60
      : null;

  const currentFile = live.currentFile;
  let derivedCurrentFile = null;

  if (currentFile) {
    const isGoogleDriveCopy =
      currentFile.telemetryMode === "google_drive_copy";
    const fileElapsed =
      elapsedSeconds(
        currentFile.startedAt,
        active ? null : latest.finishedAt,
        now,
      ) ??
      finiteNumber(currentFile.elapsedSeconds) ??
      0;
    derivedCurrentFile = {
      ...currentFile,
      copyInProgress: isGoogleDriveCopy,
      bytesTransferred: null,
      speedBytesPerSecond: null,
      etaSeconds: null,
      elapsedSeconds: fileElapsed,
      progressPct: null,
    };
  }

  const migrationElapsed =
    elapsedSeconds(
      latest.startedAt,
      active ? null : latest.finishedAt,
      now,
    ) ??
    finiteNumber(live.migrationElapsedSeconds) ??
    0;
  return {
    migrationElapsedSeconds: migrationElapsed,
    overallSpeedBytesPerSecond: null,
    overallSpeedMiBPerSecond: null,
    totalEtaSeconds: null,
    itemsPerSecond:
      migrationElapsed > 0
        ? completedFiles / migrationElapsed
        : null,
    currentFile: derivedCurrentFile,
  };
}

export function createTelemetrySample(
  latest,
  timestamp = Date.now(),
) {
  const currentFile = latest?.live?.currentFile;

  return {
    migrationId: latest?.id ?? null,
    timestamp,
    transferredBytes: null,
    currentFileId: currentFile?.id ?? null,
    currentFileBytes: null,
    overallSpeedBytesPerSecond: null,
    currentFileSpeedBytesPerSecond: null,
    completedFiles: Number(latest?.transferredFiles ?? 0),
    totalFiles: Number(latest?.totalFiles ?? 0),
    activeWorkers: Number(latest?.live?.activeWorkers ?? 0),
  };
}
