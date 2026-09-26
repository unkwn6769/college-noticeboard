"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowDownUp,
  ExternalLink,
  FileUp,
  FilterX,
  RefreshCcw,
  Search,
  Trash2,
  Upload,
} from "lucide-react";

import PageHeader from "@/src/components/PageHeader";
import StatusBadge from "@/src/components/StatusBadge";
import EmptyState from "@/src/components/EmptyState";
import ErrorState from "@/src/components/ErrorState";
import FileIcon from "@/src/components/FileIcon";
import { SkeletonRegion, SkeletonTable } from "@/src/components/Skeleton";
import { useConfirm } from "@/src/components/ConfirmDialog";
import { useToast } from "@/src/components/Toast";
import { fileState, humanise } from "@/src/lib/status";
import { fileTypeLabel, formatBytes, formatDateTime } from "@/src/lib/format";

type FileRow = {
  id: string;
  original_name: string;
  mime_type: string;
  size_bytes: string;
  state: string;
  version_number: number;
  origin_type?: "USER_UPLOAD" | "LEGACY_IMPORT";
  legacy_department?: string | null;
  legacy_relative_path?: string | null;
  created_at: string;
};

type FileResponse = {
  files: FileRow[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

const PAGE_SIZE = 50;
const STATES = ["ACTIVE", "QUARANTINED", "STAGING", "PURGED"] as const;
const ORIGINS = [
  { value: "LEGACY_IMPORT", label: "Legacy archive" },
  { value: "USER_UPLOAD", label: "User uploads" },
] as const;

const EMPTY: FileResponse = { files: [], page: 1, pageSize: PAGE_SIZE, total: 0, totalPages: 1 };

/** Reads a safe message from an API response without surfacing driver text. */
async function readError(response: Response, fallback: string): Promise<string> {
  const body = await response.json().catch(() => null);
  const message = body?.error;
  return typeof message === "string" && message.trim() ? message : fallback;
}

export default function FilesPage() {
  const confirm = useConfirm();
  const { toast, dismiss } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const replaceInputRef = useRef<HTMLInputElement>(null);

  const [data, setData] = useState<FileResponse>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [department, setDepartment] = useState("");
  const [origin, setOrigin] = useState("");
  const [state, setState] = useState("");
  const [page, setPage] = useState(1);

  const [departments, setDepartments] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [replaceTarget, setReplaceTarget] = useState<FileRow | null>(null);

  const filtersActive = Boolean(search || department || origin || state);

  const load = useCallback(
    async (nextPage: number, nextFilters?: { search?: string; department?: string; origin?: string; state?: string }) => {
      setLoading(true);
      const active = {
        search: search,
        department: department,
        origin: origin,
        state: state,
        ...nextFilters,
      };

      const params = new URLSearchParams({
        page: String(nextPage),
        pageSize: String(PAGE_SIZE),
      });
      if (active.search) params.set("search", active.search);
      if (active.department) params.set("department", active.department);
      if (active.origin) params.set("origin", active.origin);
      if (active.state) params.set("state", active.state);

      try {
        const response = await fetch(`/api/files?${params.toString()}`, { cache: "no-store" });
        if (!response.ok) {
          throw new Error(await readError(response, "The file list could not be loaded."));
        }
        const result = await response.json();
        setData(result);
        setPage(result.page);
        setLoadError("");
      } catch (error) {
        setData(EMPTY);
        setLoadError(error instanceof Error ? error.message : "The file list could not be loaded.");
      } finally {
        setLoading(false);
      }
    },
    [search, department, origin, state],
  );

  useEffect(() => {
    void load(1);
  }, [load]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch("/api/files/meta", { cache: "no-store" });
        if (!response.ok) return;
        const result = await response.json();
        if (!cancelled && Array.isArray(result?.departments)) {
          setDepartments(result.departments);
        }
      } catch {
        // The department filter simply stays as "All departments".
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function sendUpload(file: File, replaceId?: string) {
    setUploading(true);
    setPendingId(replaceId ?? null);
    const progressId = toast({
      tone: "info",
      title: replaceId ? `Replacing with ${file.name}…` : `Uploading ${file.name}…`,
      duration: 0,
    });

    try {
      const response = await fetch(replaceId ? `/api/files/${replaceId}/replace` : "/api/files", {
        method: "POST",
        headers: {
          "X-File-Name": encodeURIComponent(file.name),
          "X-File-Size": String(file.size),
          "Content-Type": file.type || "application/octet-stream",
        },
        body: file,
      });
      if (!response.ok) {
        toast({
          tone: "danger",
          title: replaceId ? "Replacement failed" : "Upload failed",
          text: await readError(response, "The file was not stored."),
        });
        return;
      }
      toast({
        tone: "success",
        title: replaceId ? "File replaced" : "File uploaded",
        text: file.name,
      });
      if (inputRef.current) inputRef.current.value = "";
      if (replaceInputRef.current) replaceInputRef.current.value = "";
      setReplaceTarget(null);
      await load(page);
    } catch {
      toast({
        tone: "danger",
        title: "Could not reach the server",
        text: `${file.name} was not uploaded. Nothing was changed.`,
      });
    } finally {
      dismiss(progressId);
      setUploading(false);
      setPendingId(null);
      setDragging(false);
    }
  }

  async function remove(file: FileRow) {
    const ok = await confirm({
      title: "Move this file to quarantine?",
      subject: `${file.original_name} — ${formatBytes(file.size_bytes)}`,
      consequence:
        "The file stops being publicly downloadable and moves to the recycle bin. The bytes are retained until someone purges them, so this is reversible.",
      confirmLabel: "Move to quarantine",
      tone: "warning",
    });
    if (!ok) return;

    setPendingId(file.id);
    try {
      const response = await fetch(`/api/files/${file.id}/delete`, { method: "DELETE" });
      if (!response.ok) {
        toast({
          tone: "danger",
          title: "The file was not quarantined",
          text: await readError(response, "Delete failed."),
        });
        return;
      }
      toast({ tone: "success", title: "Moved to quarantine", text: file.original_name });
      await load(page);
    } catch {
      toast({ tone: "danger", title: "Could not reach the server", text: "Nothing was changed." });
    } finally {
      setPendingId(null);
    }
  }

  function clearFilters() {
    setSearch("");
    setSearchInput("");
    setDepartment("");
    setOrigin("");
    setState("");
    setPage(1);
  }

  const rangeStart = data.total === 0 ? 0 : (data.page - 1) * PAGE_SIZE + 1;
  const rangeEnd = Math.min(data.page * PAGE_SIZE, data.total);

  return (
    <>
      <PageHeader
        eyebrow="Content"
        title="Files & archive"
        description="Every file record the system holds, with its lifecycle state, origin and size. Uploads are streamed and checksummed before publication."
        actions={
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => void load(page)}
            disabled={loading}
          >
            <RefreshCcw aria-hidden="true" />
            Refresh
          </button>
        }
        meta={
          <>
            <span className="badge">
              {loading
                ? "Loading…"
                : `${rangeStart.toLocaleString("en-IN")}–${rangeEnd.toLocaleString("en-IN")} of ${data.total.toLocaleString("en-IN")}`}
            </span>
            {filtersActive ? <span className="badge badge-info">Filters active</span> : null}
          </>
        }
      />

      <section className="form-section" aria-label="Upload a file">
        <div
          className="dropzone"
          data-dragging={dragging}
          onDragOver={(event) => {
            event.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(event) => {
            event.preventDefault();
            const file = event.dataTransfer.files?.[0];
            if (file && !uploading) void sendUpload(file);
          }}
        >
          <span className="dropzone-icon" aria-hidden="true">
            <Upload />
          </span>
          <p className="dropzone-title">Drop a file to upload</p>
          <p className="dropzone-hint">
            or choose a file below · staged, SHA-256 verified, then published atomically
          </p>
          <label className="file-field" style={{ width: "min(26rem, 100%)" }}>
            <span className="sr-only">File to upload</span>
            <input
              ref={inputRef}
              type="file"
              disabled={uploading}
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void sendUpload(file);
              }}
            />
          </label>
          {uploading && !pendingId ? (
            <p className="dropzone-hint row row-2">
              <span className="spinner" aria-hidden="true" />
              Uploading…
            </p>
          ) : null}
        </div>

        {replaceTarget ? (
          <div
            className="upload-item"
            style={{ marginTop: "var(--space-3)", borderColor: "var(--primary-border)" }}
          >
            <span className="resource-icon" aria-hidden="true">
              <ArrowDownUp />
            </span>
            <span className="upload-item-main">
              <span className="upload-item-name">
                Replacing {replaceTarget.original_name}
              </span>
              <span className="upload-item-meta">
                The current version is retained; the new bytes become a new version.
              </span>
            </span>
            <span className="row row-2">
              <label className="file-field" style={{ width: "min(18rem, 60vw)" }}>
                <span className="sr-only">Replacement file</span>
                <input
                  ref={replaceInputRef}
                  type="file"
                  disabled={uploading}
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) void sendUpload(file, replaceTarget.id);
                  }}
                />
              </label>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                disabled={uploading}
                onClick={() => setReplaceTarget(null)}
              >
                Cancel
              </button>
            </span>
          </div>
        ) : null}
      </section>

      <form
        className="filter-bar"
        style={{ marginTop: "var(--space-5)" }}
        onSubmit={(event) => {
          event.preventDefault();
          setPage(1);
          setSearch(searchInput.trim());
        }}
        role="search"
        aria-label="Filter files"
      >
        <div className="field">
          <label className="field-label" htmlFor="file-search">
            Search
          </label>
          <div className="search-field">
            <Search aria-hidden="true" />
            <input
              id="file-search"
              className="input"
              type="search"
              value={searchInput}
              maxLength={100}
              placeholder="File name or legacy path"
              onChange={(event) => setSearchInput(event.target.value)}
            />
          </div>
        </div>

        <div className="field">
          <label className="field-label" htmlFor="file-department">
            Department
          </label>
          <select
            id="file-department"
            className="select"
            value={department}
            onChange={(event) => {
              setPage(1);
              setDepartment(event.target.value);
            }}
          >
            <option value="">All departments</option>
            {departments.map((value) => (
              <option key={value} value={value}>
                {value.replace("-noticeboard", "")}
              </option>
            ))}
          </select>
        </div>

        <div className="field">
          <label className="field-label" htmlFor="file-origin">
            Source
          </label>
          <select
            id="file-origin"
            className="select"
            value={origin}
            onChange={(event) => {
              setPage(1);
              setOrigin(event.target.value);
            }}
          >
            <option value="">All sources</option>
            {ORIGINS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        <div className="field">
          <label className="field-label" htmlFor="file-state">
            State
          </label>
          <select
            id="file-state"
            className="select"
            value={state}
            onChange={(event) => {
              setPage(1);
              setState(event.target.value);
            }}
          >
            <option value="">All states</option>
            {STATES.map((option) => (
              <option key={option} value={option}>
                {humanise(option)}
              </option>
            ))}
          </select>
        </div>

        <div className="filter-bar-actions">
          <button className="btn" type="submit">
            <Search aria-hidden="true" />
            Search
          </button>
          <button
            type="button"
            className="btn btn-ghost"
            disabled={!filtersActive}
            onClick={clearFilters}
          >
            <FilterX aria-hidden="true" />
            Clear filters
          </button>
        </div>
      </form>

      {loadError ? (
        <div style={{ marginTop: "var(--space-5)" }}>
          <ErrorState
            title="The file list could not be loaded"
            message={loadError}
            onRetry={() => void load(page)}
          />
        </div>
      ) : loading ? (
        <div className="table-wrap" style={{ marginTop: "var(--space-5)" }} tabIndex={0} role="region" aria-label="Loading files">
          <div style={{ padding: "var(--space-4)" }}>
            <SkeletonRegion label="Loading files.">
              <SkeletonTable rows={8} columns={5} />
            </SkeletonRegion>
          </div>
        </div>
      ) : data.files.length === 0 ? (
        <div style={{ marginTop: "var(--space-5)" }}>
          <EmptyState
            icon={filtersActive ? Search : FileUp}
            title={
              filtersActive ? "No files match these filters" : "No file records exist yet"
            }
            description={
              filtersActive
                ? "Nothing matches the current filters. Clear them to see every file the system holds."
                : "Nothing has been uploaded or imported yet. Drop a file into the upload area above to create the first record."
            }
            actions={
              filtersActive ? (
                <button type="button" className="btn" onClick={clearFilters}>
                  <FilterX aria-hidden="true" />
                  Clear filters
                </button>
              ) : null
            }
          />
        </div>
      ) : (
        <>
          <div className="table-wrap show-desktop" style={{ marginTop: "var(--space-5)" }} tabIndex={0} role="region" aria-label="Files table">
            <table className="data-table">
              <thead>
                <tr>
                  <th scope="col">Name</th>
                  <th scope="col">Source</th>
                  <th scope="col">Department</th>
                  <th scope="col">Type</th>
                  <th scope="col" style={{ textAlign: "right" }}>
                    Size
                  </th>
                  <th scope="col">State</th>
                  <th scope="col">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.files.map((file) => (
                  <tr key={file.id}>
                    <td>
                      <div className="row row-2" style={{ alignItems: "flex-start" }}>
                        <span className="resource-icon" style={{ width: 28, height: 28 }} aria-hidden="true">
                          <FileIcon name={file.original_name} mimeType={file.mime_type} />
                        </span>
                        <div style={{ minWidth: 0 }}>
                          <div className="cell-primary" style={{ overflowWrap: "anywhere" }}>
                            {file.original_name}
                          </div>
                          {file.legacy_relative_path ? (
                            <div
                              className="cell-sub mono"
                              style={{ maxWidth: 380, overflowWrap: "anywhere" }}
                            >
                              {file.legacy_relative_path}
                            </div>
                          ) : null}
                        </div>
                      </div>
                    </td>
                    <td>
                      <span className="badge">
                        {file.origin_type === "LEGACY_IMPORT" ? "Legacy" : "Upload"}
                      </span>
                    </td>
                    <td className="muted" style={{ fontSize: "var(--text-2xs)" }}>
                      {file.legacy_department
                        ? file.legacy_department.replace("-noticeboard", "")
                        : "—"}
                    </td>
                    <td className="muted" style={{ fontSize: "var(--text-2xs)" }}>
                      {fileTypeLabel(file.original_name, file.mime_type)}
                    </td>
                    <td className="num muted" style={{ fontSize: "var(--text-2xs)" }}>
                      {formatBytes(file.size_bytes)}
                    </td>
                    <td>
                      <StatusBadge
                        descriptor={fileState(file.state)}
                        title={`Version ${file.version_number}`}
                      />
                      <span className="cell-sub">v{file.version_number}</span>
                    </td>
                    <td className="actions-cell">
                      <div className="actions">
                        <a
                          className="btn btn-ghost btn-sm"
                          href={`/api/files/${file.id}`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          <ExternalLink aria-hidden="true" />
                          View
                        </a>
                        {file.state === "ACTIVE" && file.origin_type !== "LEGACY_IMPORT" ? (
                          <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            disabled={uploading}
                            onClick={() => setReplaceTarget(file)}
                          >
                            <ArrowDownUp aria-hidden="true" />
                            Replace
                          </button>
                        ) : null}
                        {file.state === "ACTIVE" ? (
                          <button
                            type="button"
                            className="btn btn-danger-outline btn-sm"
                            disabled={pendingId === file.id || uploading}
                            onClick={() => void remove(file)}
                          >
                            <Trash2 aria-hidden="true" />
                            {pendingId === file.id ? "Working…" : "Quarantine"}
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <ul className="data-list show-mobile" style={{ listStyle: "none", padding: 0, marginTop: "var(--space-5)" }}>
            {data.files.map((file) => (
              <li className="data-list-item" key={file.id}>
                <div className="data-list-head">
                  <div className="row row-2" style={{ minWidth: 0, alignItems: "flex-start" }}>
                    <span className="resource-icon" style={{ width: 28, height: 28 }} aria-hidden="true">
                      <FileIcon name={file.original_name} mimeType={file.mime_type} />
                    </span>
                    <span className="data-list-title">{file.original_name}</span>
                  </div>
                  <StatusBadge descriptor={fileState(file.state)} />
                </div>
                <dl className="data-list-meta">
                  <div>
                    <dt>Size</dt>
                    <dd>{formatBytes(file.size_bytes)}</dd>
                  </div>
                  <div>
                    <dt>Type</dt>
                    <dd>{fileTypeLabel(file.original_name, file.mime_type)}</dd>
                  </div>
                  <div>
                    <dt>Source</dt>
                    <dd>{file.origin_type === "LEGACY_IMPORT" ? "Legacy" : "Upload"}</dd>
                  </div>
                  <div>
                    <dt>Added</dt>
                    <dd>{formatDateTime(file.created_at)}</dd>
                  </div>
                </dl>
                <div className="data-list-actions">
                  <a
                    className="btn btn-ghost btn-sm"
                    href={`/api/files/${file.id}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <ExternalLink aria-hidden="true" />
                    View
                  </a>
                  {file.state === "ACTIVE" && file.origin_type !== "LEGACY_IMPORT" ? (
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      disabled={uploading}
                      onClick={() => setReplaceTarget(file)}
                    >
                      Replace
                    </button>
                  ) : null}
                  {file.state === "ACTIVE" ? (
                    <button
                      type="button"
                      className="btn btn-danger-outline btn-sm"
                      disabled={pendingId === file.id || uploading}
                      onClick={() => void remove(file)}
                    >
                      Quarantine
                    </button>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>

          <nav className="pagination" aria-label="File pagination">
            <p className="pagination-info">
              Showing {rangeStart.toLocaleString("en-IN")}–
              {rangeEnd.toLocaleString("en-IN")} of {data.total.toLocaleString("en-IN")} files
            </p>
            <div className="pagination-controls">
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                disabled={loading || page <= 1}
                onClick={() => void load(page - 1)}
              >
                Previous
              </button>
              <span className="pagination-page">
                Page {data.page} of {data.totalPages}
              </span>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                disabled={loading || page >= data.totalPages}
                onClick={() => void load(page + 1)}
              >
                Next
              </button>
            </div>
          </nav>
        </>
      )}
    </>
  );
}
