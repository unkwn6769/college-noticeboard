"use client";

import { useEffect, useRef, useState } from "react";

import { useParams } from "next/navigation";
import { DEPARTMENTS } from "@/src/lib/department-registry";

type NoticeState = {
  title: string;
  body: string;
  department: string | null;
  category: string | null;
  is_pinned: boolean;
  status: string;
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

export default function EditNoticePage() {
  const params = useParams<{ id: string }>();
  const fileInput = useRef<HTMLInputElement>(null);

  const [notice, setNotice] = useState<NoticeState | null>(null);
  const [attachments, setAttachments] = useState<AttachmentState[]>([]);
  const [existingFileId, setExistingFileId] = useState("");
  const [error, setError] = useState("");
  const [attachmentBusy, setAttachmentBusy] = useState(false);

  async function loadAttachments() {
    const response = await fetch(`/api/notices/${params.id}/attachments`, {
      cache: "no-store",
    });
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error ?? "Unable to load attachments");
    }

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

        if (!noticeResponse.ok) {
          throw new Error(noticeData.error ?? "Not found");
        }

        if (!attachmentResponse.ok) {
          throw new Error(attachmentData.error ?? "Unable to load attachments");
        }

        if (!cancelled) {
          setNotice(noticeData.notice);
          setAttachments(attachmentData.attachments ?? []);
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(
            loadError instanceof Error ? loadError.message : "Unable to load notice",
          );
        }
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, [params.id]);

  if (error && !notice) return <div className="alert">{error}</div>;
  if (!notice) return <p>Loading…</p>;

  async function save() {
    const current = notice;
    if (!current) return;

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
    if (!response.ok) {
      setError(data.error ?? "Save failed");
      return;
    }

    window.location.reload();
  }

  async function act(action: string) {
    const response = await fetch(`/api/notices/${params.id}/${action}`, {
      method: "POST",
    });

    const data = await response.json();
    if (!response.ok) {
      setError(data.error ?? "Operation failed");
      return;
    }

    const refreshed = await fetch(`/api/notices/${params.id}`, {
      cache: "no-store",
    });
    const refreshedData = await refreshed.json();
    setNotice(refreshedData.notice);
    void loadAttachments();
  }

  async function uploadAndAttach() {
    const file = fileInput.current?.files?.[0];
    if (!file) {
      setError("Choose a file first.");
      return;
    }

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

      if (!uploadResponse.ok) {
        throw new Error(uploadData.error ?? "File upload failed");
      }

      const attachmentResponse = await fetch(
        `/api/notices/${params.id}/attachments`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ fileId: uploadData.fileId }),
        },
      );

      const attachmentData = await attachmentResponse.json();

      if (!attachmentResponse.ok) {
        await fetch(`/api/files/${uploadData.fileId}/delete`, {
          method: "DELETE",
        }).catch(() => undefined);

        throw new Error(
          attachmentData.error ?? "Uploaded file could not be attached",
        );
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
    } catch (uploadError) {
      setError(
        uploadError instanceof Error
          ? uploadError.message
          : "Attachment upload failed",
      );
    } finally {
      setAttachmentBusy(false);
    }
  }

  async function attachExistingFile() {
    const fileId = existingFileId.trim();
    if (!fileId) {
      setError("Enter an existing file UUID.");
      return;
    }

    setAttachmentBusy(true);
    setError("");

    try {
      const response = await fetch(`/api/notices/${params.id}/attachments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileId }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error ?? "Unable to attach file");
      }

      setExistingFileId("");
      await loadAttachments();
    } catch (attachError) {
      setError(
        attachError instanceof Error
          ? attachError.message
          : "Unable to attach file",
      );
    } finally {
      setAttachmentBusy(false);
    }
  }

  async function removeAttachment(attachmentId: string) {
    if (!window.confirm("Remove this attachment from the notice?")) return;

    setAttachmentBusy(true);
    setError("");

    try {
      const response = await fetch(
        `/api/notices/${params.id}/attachments/${attachmentId}`,
        { method: "DELETE" },
      );
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error ?? "Unable to remove attachment");
      }

      setAttachments((current) =>
        current.filter((attachment) => attachment.id !== attachmentId),
      );
    } catch (removeError) {
      setError(
        removeError instanceof Error
          ? removeError.message
          : "Unable to remove attachment",
      );
    } finally {
      setAttachmentBusy(false);
    }
  }

  return (
    <>
      <div className="actions" style={{ justifyContent: "space-between" }}>
        <div>
          <h1>Edit notice</h1>
          <div className="meta">
            Status: {notice.status}
            {notice.is_pinned ? " · Pinned" : ""}
          </div>
        </div>
        <a className="btn secondary" href="/admin/notices">
          Back
        </a>
      </div>

      {error && <div className="alert">{error}</div>}

      <div className="form">
        <label>
          Title
          <input
            value={notice.title}
            onChange={(event) =>
              setNotice({ ...notice, title: event.target.value })
            }
          />
        </label>

        <label>
          Department
          <select
            value={notice.department ?? ""}
            onChange={(event) =>
              setNotice({
                ...notice,
                department: event.target.value || null,
              })
            }
          >
            <option value="">College-wide / general</option>
            {DEPARTMENTS.map((department) => (
              <option key={department.slug} value={department.slug}>
                {department.shortName} — {department.name}
              </option>
            ))}
          </select>
        </label>

        <label>
          Category
          <input
            value={notice.category ?? ""}
            maxLength={64}
            onChange={(event) =>
              setNotice({
                ...notice,
                category: event.target.value || null,
              })
            }
          />
        </label>

        <label className="checkbox-field">
          <input
            type="checkbox"
            checked={notice.is_pinned}
            onChange={(event) =>
              setNotice({ ...notice, is_pinned: event.target.checked })
            }
          />
          Mark as important / pinned
        </label>

        <label>
          Body
          <textarea
            value={notice.body}
            onChange={(event) =>
              setNotice({ ...notice, body: event.target.value })
            }
          />
        </label>

        <div className="actions">
          <button className="btn" onClick={save} disabled={attachmentBusy}>
            Save
          </button>
          <button
            className="btn secondary"
            onClick={() => act("publish")}
            disabled={attachmentBusy}
          >
            Publish
          </button>
          <button
            className="btn danger"
            onClick={() => act("archive")}
            disabled={attachmentBusy}
          >
            Archive
          </button>
        </div>
      </div>

      <section className="card" style={{ marginTop: 20 }}>
        <div className="actions" style={{ justifyContent: "space-between" }}>
          <div>
            <h2>Attachments</h2>
            <p className="muted">
              Upload a new file or attach an existing active file. Published
              notices expose active attachments publicly.
            </p>
          </div>
          <span className="badge">{attachments.length}</span>
        </div>

        <div className="admin-attachment-upload">
          <div className="actions">
            <input
              ref={fileInput}
              type="file"
              disabled={attachmentBusy}
            />
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
              onChange={(event) => setExistingFileId(event.target.value)}
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

        <div className="admin-attachment-list">
          {attachments.map((attachment) => (
            <div className="admin-attachment-row" key={attachment.id}>
              <div>
                <div className="admin-attachment-name">
                  {attachment.original_name}
                </div>
                <div className="muted" style={{ fontSize: 12 }}>
                  {attachment.mime_type} · {formatBytes(attachment.size_bytes)} ·{" "}
                  {attachment.state}
                </div>
                <div className="muted admin-attachment-id">
                  File ID: {attachment.file_id}
                </div>
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
            <div className="muted">No attachments linked to this notice.</div>
          )}
        </div>
      </section>
    </>
  );
}
