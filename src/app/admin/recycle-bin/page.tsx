"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Archive, FileStack, Megaphone, RotateCcw, Trash2, TriangleAlert } from "lucide-react";

import PageHeader from "@/src/components/PageHeader";
import StatusBadge from "@/src/components/StatusBadge";
import EmptyState from "@/src/components/EmptyState";
import ErrorState from "@/src/components/ErrorState";
import FileIcon from "@/src/components/FileIcon";
import Breadcrumbs from "@/src/components/Breadcrumbs";
import { SkeletonRegion, SkeletonTable } from "@/src/components/Skeleton";
import { useConfirm } from "@/src/components/ConfirmDialog";
import { useToast } from "@/src/components/Toast";
import { fileState, noticeStatus } from "@/src/lib/status";
import { departmentLabel, formatBytes, formatDateTime } from "@/src/lib/format";

type DeletedNotice = {
  id: string;
  title: string;
  department: string | null;
  status: string;
  author: string;
  deleted_at: string;
};

type QuarantinedFile = {
  id: string;
  original_name: string;
  mime_type: string;
  size_bytes: string;
  origin_type: string;
  legacy_department: string | null;
  updated_at: string;
};

type Tab = "notices" | "files";

async function readError(response: Response, fallback: string): Promise<string> {
  const body = await response.json().catch(() => null);
  const message = body?.error;
  return typeof message === "string" && message.trim() ? message : fallback;
}

export default function RecycleBinPage() {
  const confirm = useConfirm();
  const { toast } = useToast();

  const [notices, setNotices] = useState<DeletedNotice[]>([]);
  const [files, setFiles] = useState<QuarantinedFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("notices");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/admin/recycle-bin", { cache: "no-store" });
      if (!response.ok) {
        // A failed load must never be presented as an empty recycle bin.
        throw new Error(await readError(response, "The recycle bin could not be loaded."));
      }
      const data = await response.json();
      setNotices(Array.isArray(data?.notices) ? data.notices : []);
      setFiles(Array.isArray(data?.files) ? data.files : []);
      setLoadError("");
    } catch (error) {
      setNotices([]);
      setFiles([]);
      setLoadError(
        error instanceof Error ? error.message : "The recycle bin could not be loaded.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const emptyAll = notices.length === 0 && files.length === 0;

  const asyncAction = useCallback(
    async (
      id: string,
      path: string,
      method: "POST" | "DELETE",
      onDone: () => Promise<void>,
    ) => {
      setBusyId(id);
      try {
        const response = await fetch(path, { method });
        if (!response.ok) {
          toast({
            tone: "danger",
            title: "The action did not complete",
            text: await readError(response, "Nothing was changed."),
          });
          return;
        }
        await onDone();
        await load();
      } catch {
        toast({ tone: "danger", title: "Could not reach the server", text: "Nothing was changed." });
      } finally {
        setBusyId(null);
      }
    },
    [load, toast],
  );

  async function restoreNotice(notice: DeletedNotice) {
    const ok = await confirm({
      title: "Restore this notice?",
      subject: `${notice.title} — ${notice.author}`,
      consequence:
        "The notice returns to the system as a draft. It does not become public again until someone publishes it.",
      confirmLabel: "Restore as draft",
    });
    if (!ok) return;
    await asyncAction(
      notice.id,
      `/api/admin/recycle-bin/notices/${notice.id}`,
      "POST",
      async () => {
        toast({ tone: "success", title: "Notice restored", text: "It is now a draft." });
      },
    );
  }

  async function purgeNotice(notice: DeletedNotice) {
    const ok = await confirm({
      title: "Permanently delete this notice?",
      subject: `${notice.title} — ${notice.author}`,
      consequence:
        "The notice record is destroyed. Unlike a quarantine, there is no restore path: the only remaining trace is the append-only audit log.",
      confirmLabel: "Delete permanently",
      tone: "danger",
      requireTyped: "DELETE",
    });
    if (!ok) return;
    await asyncAction(
      notice.id,
      `/api/admin/recycle-bin/notices/${notice.id}`,
      "DELETE",
      async () => {
        toast({ tone: "success", title: "Notice permanently deleted" });
      },
    );
  }

  async function restoreFile(file: QuarantinedFile) {
    const ok = await confirm({
      title: "Restore this file?",
      subject: `${file.original_name} — ${formatBytes(file.size_bytes)}`,
      consequence:
        "The file returns to active storage and becomes publicly downloadable again from its archive page.",
      confirmLabel: "Restore file",
    });
    if (!ok) return;
    await asyncAction(
      file.id,
      `/api/admin/recycle-bin/files/${file.id}`,
      "POST",
      async () => {
        toast({ tone: "success", title: "File restored to active storage" });
      },
    );
  }

  async function purgeFile(file: QuarantinedFile) {
    const ok = await confirm({
      title: "Permanently purge this file?",
      subject: `${file.original_name} — ${formatBytes(file.size_bytes)}`,
      consequence:
        "The bytes are deleted from the storage volume. This cannot be undone and the file can never be restored.",
      confirmLabel: "Purge bytes",
      tone: "danger",
      requireTyped: "PURGE",
    });
    if (!ok) return;
    await asyncAction(
      file.id,
      `/api/admin/recycle-bin/files/${file.id}`,
      "DELETE",
      async () => {
        toast({ tone: "success", title: "File purged from storage" });
      },
    );
  }

  const counts = useMemo(
    () => ({ notices: notices.length, files: files.length }),
    [notices, files],
  );

  return (
    <>
      <PageHeader
        breadcrumbs={
          <Breadcrumbs items={[{ label: "Admin", href: "/admin" }, { label: "Recycle bin" }]} />
        }
        eyebrow="Governance"
        title="Recycle bin"
        description="Deleted notices and quarantined files. Everything here can be restored. Permanent deletion is the only irreversible action in the product and always asks for confirmation."
        meta={
          !loading && !loadError ? (
            <>
              <span className="badge">{counts.notices} deleted notice{counts.notices === 1 ? "" : "s"}</span>
              <span className="badge">{counts.files} quarantined file{counts.files === 1 ? "" : "s"}</span>
            </>
          ) : null
        }
      />

      {loadError ? (
        <ErrorState
          title="The recycle bin could not be loaded"
          message={loadError}
          onRetry={() => void load()}
        />
      ) : loading ? (
        <div className="table-wrap" tabIndex={0} role="region" aria-label="Loading recycle bin">
          <div style={{ padding: "var(--space-4)" }}>
            <SkeletonRegion label="Loading the recycle bin.">
              <SkeletonTable rows={5} columns={4} />
            </SkeletonRegion>
          </div>
        </div>
      ) : emptyAll ? (
        <EmptyState
          icon={Archive}
          title="The recycle bin is empty"
          description="Nothing has been deleted or quarantined. When a notice is deleted or a file is quarantined it appears here with restore and permanent-delete actions."
        />
      ) : (
        <>
          <div className="tabs" role="tablist" aria-label="Recycle bin sections">
            <button
              type="button"
              role="tab"
              id="recycle-tab-notices"
              aria-selected={tab === "notices"}
              aria-controls="recycle-panel-notices"
              tabIndex={tab === "notices" ? 0 : -1}
              className="tab"
              onClick={() => setTab("notices")}
            >
              <Megaphone aria-hidden="true" width={14} height={14} />
              Notices
              <span className="tab-count">{counts.notices}</span>
            </button>
            <button
              type="button"
              role="tab"
              id="recycle-tab-files"
              aria-selected={tab === "files"}
              aria-controls="recycle-panel-files"
              tabIndex={tab === "files" ? 0 : -1}
              className="tab"
              onClick={() => setTab("files")}
            >
              <FileStack aria-hidden="true" width={14} height={14} />
              Files
              <span className="tab-count">{counts.files}</span>
            </button>
          </div>

          {tab === "notices" ? (
            <div
              id="recycle-panel-notices"
              role="tabpanel"
              aria-labelledby="recycle-tab-notices"
              tabIndex={0}
              style={{ marginTop: "var(--space-4)" }}
            >
              {notices.length === 0 ? (
                <EmptyState
                  compact
                  icon={Megaphone}
                  title="No deleted notices"
                  description="Every notice is still in the system. Deleted notices appear here and can be restored as a draft."
                />
              ) : (
                <ul className="data-list" style={{ listStyle: "none", padding: 0 }}>
                  {notices.map((notice) => (
                    <li className="data-list-item" key={notice.id}>
                      <div className="data-list-head">
                        <div style={{ minWidth: 0 }}>
                          <p className="data-list-title">{notice.title}</p>
                          <p className="cell-sub">
                            {departmentLabel(notice.department) ?? "College-wide"} ·{" "}
                            {notice.author}
                          </p>
                        </div>
                        <StatusBadge descriptor={noticeStatus(notice.status)} />
                      </div>
                      <dl className="data-list-meta">
                        <div>
                          <dt>Deleted</dt>
                          <dd>{formatDateTime(notice.deleted_at)}</dd>
                        </div>
                      </dl>
                      <div className="data-list-actions">
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          disabled={busyId === notice.id}
                          onClick={() => void restoreNotice(notice)}
                        >
                          {busyId === notice.id ? (
                            <span className="spinner" aria-hidden="true" />
                          ) : (
                            <RotateCcw aria-hidden="true" />
                          )}
                          Restore as draft
                        </button>
                        <span className="spacer" />
                        <button
                          type="button"
                          className="btn btn-danger btn-sm"
                          disabled={busyId === notice.id}
                          onClick={() => void purgeNotice(notice)}
                        >
                          <Trash2 aria-hidden="true" />
                          Delete permanently
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : (
            <div
              id="recycle-panel-files"
              role="tabpanel"
              aria-labelledby="recycle-tab-files"
              tabIndex={0}
              style={{ marginTop: "var(--space-4)" }}
            >
              {files.length === 0 ? (
                <EmptyState
                  compact
                  icon={FileStack}
                  title="No quarantined files"
                  description="Every file is currently active. Quarantined files stay fully recoverable until they are purged."
                />
              ) : (
                <ul className="data-list" style={{ listStyle: "none", padding: 0 }}>
                  {files.map((file) => (
                    <li className="data-list-item" key={file.id}>
                      <div className="data-list-head">
                        <div className="row row-3" style={{ minWidth: 0, alignItems: "flex-start" }}>
                          <span className="resource-icon" aria-hidden="true">
                            <FileIcon name={file.original_name} mimeType={file.mime_type} />
                          </span>
                          <div style={{ minWidth: 0 }}>
                            <p className="data-list-title">{file.original_name}</p>
                            <p className="cell-sub">
                              {file.legacy_department
                                ? file.legacy_department.replace("-noticeboard", "")
                                : "Uploaded file"}
                            </p>
                          </div>
                        </div>
                        <StatusBadge descriptor={fileState("QUARANTINED")} dot />
                      </div>
                      <dl className="data-list-meta">
                        <div>
                          <dt>Size</dt>
                          <dd>{formatBytes(file.size_bytes)}</dd>
                        </div>
                        <div>
                          <dt>Origin</dt>
                          <dd>{file.origin_type === "LEGACY_IMPORT" ? "Legacy" : "Upload"}</dd>
                        </div>
                        <div>
                          <dt>Quarantined</dt>
                          <dd>{formatDateTime(file.updated_at)}</dd>
                        </div>
                      </dl>
                      <div
                        className="dialog-consequence"
                        style={{ marginTop: 12, color: "var(--danger-soft-text)" }}
                      >
                        <TriangleAlert aria-hidden="true" />
                        <span>
                          Restoring returns the bytes to active storage. Purging deletes them
                          from the volume permanently.
                        </span>
                      </div>
                      <div className="data-list-actions">
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          disabled={busyId === file.id}
                          onClick={() => void restoreFile(file)}
                        >
                          {busyId === file.id ? (
                            <span className="spinner" aria-hidden="true" />
                          ) : (
                            <RotateCcw aria-hidden="true" />
                          )}
                          Restore
                        </button>
                        <span className="spacer" />
                        <button
                          type="button"
                          className="btn btn-danger btn-sm"
                          disabled={busyId === file.id}
                          onClick={() => void purgeFile(file)}
                        >
                          <Trash2 aria-hidden="true" />
                          Purge bytes
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </>
      )}
    </>
  );
}
