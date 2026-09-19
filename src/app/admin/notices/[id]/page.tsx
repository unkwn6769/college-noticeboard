"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { DEPARTMENTS } from "@/src/lib/department-registry";

type NoticeState = {
  title: string;
  body: string;
  department: string | null;
  category: string | null;
  is_pinned: boolean;
  status: string;
  author: string;
  published_at: string | null;
  created_at: string;
  updated_at: string;
};

type AttachmentState = {
  id: string;
  file_id: string;
  original_name: string;
  mime_type: string;
  size_bytes: string;
  state: string;
};

function formatBytes(value: string) {
  const bytes = Number(value);
  if (!Number.isFinite(bytes) || bytes < 0) return `${value} B`;
  const units = ["B", "KB", "MB", "GB", "TB"];
  let amount = bytes;
  let unitIndex = 0;
  while (amount >= 1024 && unitIndex < units.length - 1) {
    amount /= 1024;
    unitIndex += 1;
  }
  return `${amount >= 10 || unitIndex === 0 ? amount.toFixed(0) : amount.toFixed(1)} ${units[unitIndex]}`;
}

const STATUS_LABEL: Record<string, string> = {
  DRAFT: "Draft",
  PUBLISHED: "Published",
  ARCHIVED: "Archived",
};

const STATUS_CLASS: Record<string, string> = {
  DRAFT: "badge badge-draft",
  PUBLISHED: "badge badge-published",
  ARCHIVED: "badge badge-archived",
};

export default function EditNoticePage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);

  const [notice, setNotice] = useState<NoticeState | null>(null);
  const [attachments, setAttachments] = useState<AttachmentState[]>([]);
  const [existingFileId, setExistingFileId] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [saving, setSaving] = useState(false);
  const [attachmentBusy, setAttachmentBusy] = useState(false);
  const [loadError, setLoadError] = useState("");

  async function loadAttachments() {
    const response = await fetch(`/api/notices/${params.id}/attachments`, {
      cache: "no-store",
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error ?? "Unable to load attachments");
    setAttachments(data.attachments ?? []);
  }

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const [noticeResponse, attachmentResponse] = await Promise.all([
          fetch(`/api/notices/${params.id}`, { cache: "no-store" }),
          fetch(`/api/notices/${params.id}/attachments`, { cache: "no-store" }),
        ]);

        const noticeData = await noticeResponse.json();
        const attachmentData = await attachmentResponse.json();

        if (!noticeResponse.ok) throw new Error(noticeData.error ?? "Not found");
        if (!attachmentResponse.ok) throw new Error(attachmentData.error ?? "Unable to load attachments");

        if (!cancelled) {
          setNotice(noticeData.notice);
          setAttachments(attachmentData.attachments ?? []);
        }
      } catch (err) {
        if (!cancelled) {
          setLoadError(err instanceof Error ? err.message : "Unable to load notice");
        }
      }
    }

    void load();
    return () => { cancelled = true; };
  }, [params.id]);

  if (loadError) {
    return (
      <div className="empty-state">
        <div className="empty-state-icon">⚠️</div>
        <h2>Unable to load notice</h2>
        <p className="alert">{loadError}</p>
        <a className="btn secondary" href="/admin/notices">Back to notices</a>
      </div>
    );
  }

  if (!notice) {
    return (
      <div className="loading-state">
        <div className="loading-spinner" />
        <p className="muted">Loading notice…</p>
      </div>
    );
  }

  async function save() {
    const current = notice;
    if (!current) return;
    setSaving(true);
    setError("");
    setSuccess("");

    const response = await fetch(`/api/notices/${params.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: current.title,
        body: current.body,
        department: current.department,
        category: current.category,
        isPinned: current.is_pinned,
      }),
    });

    const data = await response.json();
    setSaving(false);
    if (!response.ok) {
      setError(data.error ?? "Save failed");
    } else {
      setSuccess("Notice saved successfully.");
      setTimeout(() => setSuccess(""), 3000);
    }
  }

  async function act(action: string, label: string) {
    if (!window.confirm(`${label} this notice?`)) return;

    setError("");
    setSuccess("");
    const response = await fetch(`/api/notices/${params.id}/${action}`, {
      method: "POST",
    });

    const data = await response.json();
    if (!response.ok) {
      setError(data.error ?? "Operation failed");
      return;
    }

    const refreshed = await fetch(`/api/notices/${params.id}`, { cache: "no-store" });
    const refreshedData = await refreshed.json();
    setNotice(refreshedData.notice);
    setSuccess(`Notice ${label.toLowerCase()}d.`);
    setTimeout(() => setSuccess(""), 3000);
    void loadAttachments();
  }

  async function uploadAndAttach() {
    const file = fileInput.current?.files?.[0];
    if (!file) { setError("Choose a file first."); return; }

    setAttachmentBusy(true);
    setError("");

    try {
      const uploadResponse = await fetch("/api/files", {
        method: "POST",
        headers: {
          "X-File-Name": encodeURIComponent(file.name),
          "X-File-Size": String(file.size),
          "Content-Type": file.type || "application/octet-stream",
        },
        body: file,
      });

      const uploadData = await uploadResponse.json();
      if (!uploadResponse.ok) throw new Error(uploadData.error ?? "File upload failed");

      const attachmentResponse = await fetch(`/api/notices/${params.id}/attachments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileId: uploadData.fileId }),
      });

      const attachmentData = await attachmentResponse.json();
      if (!attachmentResponse.ok) {
        await fetch(`/api/files/${uploadData.fileId}/delete`, { method: "DELETE" }).catch(() => undefined);
        throw new Error(attachmentData.error ?? "Uploaded file could not be attached");
      }

      setAttachments((current) => [
        ...current,
        {
          id: attachmentData.attachmentId,
          file_id: uploadData.fileId,
          original_name: file.name,
          mime_type: file.type || "application/octet-stream",
          size_bytes: String(file.size),
          state: "ACTIVE",
        },
      ]);

      if (fileInput.current) fileInput.current.value = "";
      setSuccess("File uploaded and attached.");
      setTimeout(() => setSuccess(""), 3000);
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "Attachment upload failed");
    } finally {
      setAttachmentBusy(false);
    }
  }

  async function attachExistingFile() {
    const fileId = existingFileId.trim();
    if (!fileId) { setError("Enter an existing file UUID."); return; }

    setAttachmentBusy(true);
    setError("");

    try {
      const response = await fetch(`/api/notices/${params.id}/attachments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileId }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Unable to attach file");

      setExistingFileId("");
      await loadAttachments();
      setSuccess("File attached.");
      setTimeout(() => setSuccess(""), 3000);
    } catch (attachError) {
      setError(attachError instanceof Error ? attachError.message : "Unable to attach file");
    } finally {
      setAttachmentBusy(false);
    }
  }

  async function removeAttachment(attachmentId: string) {
    if (!window.confirm("Remove this attachment from the notice? The file record is not deleted.")) return;

    setAttachmentBusy(true);
    setError("");

    try {
      const response = await fetch(`/api/notices/${params.id}/attachments/${attachmentId}`, {
        method: "DELETE",
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Unable to remove attachment");
      setAttachments((current) => current.filter((a) => a.id !== attachmentId));
    } catch (removeError) {
      setError(removeError instanceof Error ? removeError.message : "Unable to remove attachment");
    } finally {
      setAttachmentBusy(false);
    }
  }

  async function deleteNotice() {
    if (!window.confirm("Permanently delete this notice? This cannot be undone.")) return;
    if (!window.confirm("Are you absolutely sure? The notice will be moved to the recycle bin.")) return;

    const response = await fetch(`/api/notices/${params.id}`, { method: "DELETE" });
    if (response.ok) {
      router.push("/admin/notices");
    } else {
      const data = await response.json();
      setError(data.error ?? "Delete failed");
    }
  }

  const deptName = notice.department
    ? (DEPARTMENTS.find((d) => d.slug === notice.department)?.shortName ?? notice.department.replace("-noticeboard", ""))
    : "College-wide";

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Edit notice</h1>
          <div className="page-header-meta">
            <span className={STATUS_CLASS[notice.status] ?? "badge"}>{STATUS_LABEL[notice.status] ?? notice.status}</span>
            {notice.is_pinned && <span className="badge badge-pinned">Pinned</span>}
            <span className="muted" style={{ fontSize: 13 }}>{deptName}</span>
            <span className="muted" style={{ fontSize: 13 }}>by {notice.author}</span>
          </div>
        </div>
        <a className="btn secondary" href="/admin/notices">← Back</a>
      </div>

      {error && <div className="alert" role="alert">{error}</div>}
      {success && <div className="alert-success" role="status">{success}</div>}

      <div className="admin-section">
        <div className="form">
          <label>
            Title
            <input
              value={notice.title}
              onChange={(e) => setNotice({ ...notice, title: e.target.value })}
              required
            />
          </label>

          <label>
            Department
            <select
              value={notice.department ?? ""}
              onChange={(e) => setNotice({ ...notice, department: e.target.value || null })}
            >
              <option value="">College-wide / general</option>
              {DEPARTMENTS.map((d) => (
                <option key={d.slug} value={d.slug}>{d.shortName} — {d.name}</option>
              ))}
            </select>
          </label>

          <label>
            Category
            <input
              value={notice.category ?? ""}
              maxLength={64}
              placeholder="e.g. Academic, Event, Examination"
              onChange={(e) => setNotice({ ...notice, category: e.target.value || null })}
            />
          </label>

          <label className="checkbox-field">
            <input
              type="checkbox"
              checked={notice.is_pinned}
              onChange={(e) => setNotice({ ...notice, is_pinned: e.target.checked })}
            />
            Mark as important / pinned
          </label>

          <label>
            Body
            <textarea
              value={notice.body}
              onChange={(e) => setNotice({ ...notice, body: e.target.value })}
              required
            />
          </label>

          <div className="actions">
            <button className="btn" onClick={save} disabled={saving || attachmentBusy}>
              {saving ? "Saving…" : "Save changes"}
            </button>
            {notice.status !== "PUBLISHED" && (
              <button
                className="btn secondary"
                onClick={() => act("publish", "Publish")}
                disabled={saving || attachmentBusy}
              >
                Publish
              </button>
            )}
            {notice.status !== "ARCHIVED" && (
              <button
                className="btn secondary"
                onClick={() => act("archive", "Archive")}
                disabled={saving || attachmentBusy}
              >
                Archive
              </button>
            )}
            {notice.status === "ARCHIVED" && (
              <button
                className="btn secondary"
                onClick={() => act("publish", "Restore")}
                disabled={saving || attachmentBusy}
              >
                Restore
              </button>
            )}
            <button
              className="btn danger"
              onClick={deleteNotice}
              disabled={saving || attachmentBusy}
              style={{ marginLeft: "auto" }}
            >
              Delete
            </button>
          </div>
        </div>
      </div>

      <section className="admin-section card" style={{ marginTop: 28 }}>
        <div className="actions" style={{ justifyContent: "space-between", marginBottom: 16 }}>
          <div>
            <h2 style={{ margin: "0 0 4px" }}>Attachments</h2>
            <p className="muted" style={{ margin: 0, fontSize: 13 }}>
              Upload a new file or attach an existing active file by UUID. Published notices expose active attachments publicly.
            </p>
          </div>
          <span className="badge">{attachments.length}</span>
        </div>

        <div className="admin-attachment-upload">
          <div className="actions">
            <input ref={fileInput} type="file" disabled={attachmentBusy} />
            <button
              className="btn secondary"
              onClick={uploadAndAttach}
              disabled={attachmentBusy}
            >
              {attachmentBusy ? "Working…" : "Upload & attach"}
            </button>
          </div>

          <div className="admin-attachment-existing">
            <input
              value={existingFileId}
              onChange={(e) => setExistingFileId(e.target.value)}
              placeholder="Existing file UUID"
              aria-label="Existing file UUID"
              disabled={attachmentBusy}
            />
            <button
              className="btn secondary"
              onClick={attachExistingFile}
              disabled={attachmentBusy}
            >
              Attach existing
            </button>
          </div>
        </div>

        <div className="admin-attachment-list" style={{ marginTop: 14 }}>
          {attachments.map((attachment) => (
            <div className="admin-attachment-row" key={attachment.id}>
              <div>
                <div className="admin-attachment-name">{attachment.original_name}</div>
                <div className="muted" style={{ fontSize: 12, marginTop: 3 }}>
                  {attachment.mime_type} · {formatBytes(attachment.size_bytes)} ·{" "}
                  <span className={attachment.state === "ACTIVE" ? "badge badge-published" : "badge"}
                    style={{ fontSize: 11, padding: "2px 7px" }}>
                    {attachment.state}
                  </span>
                </div>
                <div className="muted admin-attachment-id">File ID: {attachment.file_id}</div>
              </div>

              <div className="actions">
                {attachment.state === "ACTIVE" && (
                  <a
                    className="btn secondary"
                    href={`/api/files/${attachment.file_id}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Open
                  </a>
                )}
                <button
                  className="btn danger"
                  onClick={() => removeAttachment(attachment.id)}
                  disabled={attachmentBusy}
                >
                  Remove
                </button>
              </div>
            </div>
          ))}

          {attachments.length === 0 && (
            <div className="empty-state-inline">
              <span className="muted">No attachments linked to this notice.</span>
            </div>
          )}
        </div>
      </section>

      <div className="muted" style={{ fontSize: 12, marginTop: 20 }}>
        Created {new Date(notice.created_at).toLocaleString()}{notice.published_at ? ` · Published ${new Date(notice.published_at).toLocaleString()}` : ""} · Last updated {new Date(notice.updated_at).toLocaleString()}
      </div>
    </>
  );
}
