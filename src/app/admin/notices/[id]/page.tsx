"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  ExternalLink,
  FileUp,
  Paperclip,
  Pin,
  Save,
  Trash2,
  X,
} from "lucide-react";

import PageHeader from "@/src/components/PageHeader";
import Breadcrumbs from "@/src/components/Breadcrumbs";
import StatusBadge from "@/src/components/StatusBadge";
import ErrorState from "@/src/components/ErrorState";
import EmptyState from "@/src/components/EmptyState";
import FileIcon from "@/src/components/FileIcon";
import { SkeletonRegion, Skeleton, SkeletonText } from "@/src/components/Skeleton";
import { useConfirm } from "@/src/components/ConfirmDialog";
import { useToast } from "@/src/components/Toast";
import { DEPARTMENTS } from "@/src/lib/department-registry";
import { noticeStatus, fileState } from "@/src/lib/status";
import {
  departmentLabel,
  fileTypeLabel,
  formatBytes,
  formatDateTime,
} from "@/src/lib/format";

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

const MAX_TITLE = 200;
const MAX_BODY = 20000;

/** Reads a safe message from an API response without surfacing driver text. */
async function readError(response: Response, fallback: string): Promise<string> {
  const body = await response.json().catch(() => null);
  const message = body?.error;
  return typeof message === "string" && message.trim() ? message : fallback;
}

export default function EditNoticePage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const confirm = useConfirm();
  const { toast } = useToast();
  const fileInput = useRef<HTMLInputElement>(null);

  const [notice, setNotice] = useState<NoticeState | null>(null);
  const [attachments, setAttachments] = useState<AttachmentState[]>([]);
  const [existingFileId, setExistingFileId] = useState("");
  const [loadError, setLoadError] = useState("");
  const [saving, setSaving] = useState(false);
  const [acting, setActing] = useState("");
  const [attachmentBusy, setAttachmentBusy] = useState(false);
  const [dragging, setDragging] = useState(false);

  const loadAttachments = useCallback(async () => {
    const response = await fetch(`/api/notices/${params.id}/attachments`, {
      cache: "no-store",
    });
    if (!response.ok) throw new Error(await readError(response, "Unable to load attachments."));
    const data = await response.json();
    setAttachments(Array.isArray(data?.attachments) ? data.attachments : []);
  }, [params.id]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [noticeResponse, attachmentResponse] = await Promise.all([
          fetch(`/api/notices/${params.id}`, { cache: "no-store" }),
          fetch(`/api/notices/${params.id}/attachments`, { cache: "no-store" }),
        ]);
        if (!noticeResponse.ok) {
          throw new Error(await readError(noticeResponse, "This notice could not be loaded."));
        }
        if (!attachmentResponse.ok) {
          throw new Error(await readError(attachmentResponse, "Unable to load attachments."));
        }
        const noticeData = await noticeResponse.json();
        const attachmentData = await attachmentResponse.json();
        if (cancelled) return;
        setNotice(noticeData.notice);
        setAttachments(Array.isArray(attachmentData?.attachments) ? attachmentData.attachments : []);
        setLoadError("");
      } catch (error) {
        if (!cancelled) {
          setLoadError(error instanceof Error ? error.message : "Unable to load this notice.");
        }
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [params.id]);

  async function submitForm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const current = notice;
    if (!current) return;
    setSaving(true);

    try {
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
      if (!response.ok) {
        toast({
          tone: "danger",
          title: "The notice was not saved",
          text: await readError(response, "Save failed."),
        });
        return;
      }
      toast({ tone: "success", title: "Notice saved" });
      setNotice((value) => (value ? { ...value, updated_at: new Date().toISOString() } : value));
    } catch {
      toast({
        tone: "danger",
        title: "Could not reach the server",
        text: "The notice was not saved.",
      });
    } finally {
      setSaving(false);
    }
  }

  async function act(action: "publish" | "archive", label: string) {
    const ok = await confirm({
      title: `${label} this notice?`,
      subject: notice?.title,
      consequence:
        action === "publish"
          ? "The notice becomes visible on the public noticeboard immediately."
          : "The notice is withdrawn from the public noticeboard. It stays in the system and can be restored.",
      confirmLabel: label,
    });
    if (!ok) return;

    setActing(action);
    try {
      const response = await fetch(`/api/notices/${params.id}/${action}`, { method: "POST" });
      if (!response.ok) {
        toast({
          tone: "danger",
          title: `Notice was not ${action === "publish" ? "published" : "archived"}`,
          text: await readError(response, "The operation failed."),
        });
        return;
      }
      const refreshed = await fetch(`/api/notices/${params.id}`, { cache: "no-store" });
      const data = await refreshed.json();
      setNotice(data.notice);
      toast({ tone: "success", title: `Notice ${action === "publish" ? "published" : "archived"}` });
      void loadAttachments().catch(() => undefined);
    } catch {
      toast({ tone: "danger", title: "Could not reach the server", text: "Nothing was changed." });
    } finally {
      setActing("");
    }
  }

  async function uploadAndAttach(file: File) {
    setAttachmentBusy(true);
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
      if (!uploadResponse.ok) {
        toast({
          tone: "danger",
          title: "Upload failed",
          text: await readError(uploadResponse, "The file was not uploaded."),
        });
        return;
      }
      const uploadData = await uploadResponse.json();

      const attachmentResponse = await fetch(`/api/notices/${params.id}/attachments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileId: uploadData.fileId }),
      });
      if (!attachmentResponse.ok) {
        // Roll the orphaned upload back to quarantine so it is not stranded.
        await fetch(`/api/files/${uploadData.fileId}/delete`, { method: "DELETE" }).catch(
          () => undefined,
        );
        toast({
          tone: "danger",
          title: "The file could not be attached",
          text: await readError(attachmentResponse, "The upload was rolled back to quarantine."),
        });
        return;
      }

      setAttachments((current) => [
        ...current,
        {
          id: `pending-${uploadData.fileId}`,
          file_id: uploadData.fileId,
          original_name: file.name,
          mime_type: file.type || "application/octet-stream",
          size_bytes: String(file.size),
          state: "ACTIVE",
        },
      ]);
      if (fileInput.current) fileInput.current.value = "";
      toast({ tone: "success", title: "File attached", text: file.name });
      await loadAttachments();
    } catch {
      toast({ tone: "danger", title: "Could not reach the server", text: "Nothing was attached." });
    } finally {
      setAttachmentBusy(false);
      setDragging(false);
    }
  }

  async function attachExistingFile() {
    const fileId = existingFileId.trim();
    if (!fileId) {
      toast({ tone: "warning", title: "Enter a file UUID first" });
      return;
    }
    setAttachmentBusy(true);
    try {
      const response = await fetch(`/api/notices/${params.id}/attachments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileId }),
      });
      if (!response.ok) {
        toast({
          tone: "danger",
          title: "Could not attach that file",
          text: await readError(response, "Check the UUID and try again."),
        });
        return;
      }
      setExistingFileId("");
      await loadAttachments();
      toast({ tone: "success", title: "File attached" });
    } catch {
      toast({ tone: "danger", title: "Could not reach the server", text: "Nothing was attached." });
    } finally {
      setAttachmentBusy(false);
    }
  }

  async function removeAttachment(attachment: AttachmentState) {
    const ok = await confirm({
      title: "Remove this attachment?",
      subject: attachment.original_name,
      consequence:
        "The link between the notice and the file is removed. The file itself is not deleted and remains in the file library.",
      confirmLabel: "Remove attachment",
    });
    if (!ok) return;

    setAttachmentBusy(true);
    try {
      const response = await fetch(`/api/notices/${params.id}/attachments/${attachment.id}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        toast({
          tone: "danger",
          title: "Could not remove the attachment",
          text: await readError(response, "The attachment is unchanged."),
        });
        return;
      }
      await loadAttachments();
      toast({ tone: "success", title: "Attachment removed" });
    } catch {
      toast({ tone: "danger", title: "Could not reach the server", text: "Nothing was removed." });
    } finally {
      setAttachmentBusy(false);
    }
  }

  async function deleteNotice() {
    const ok = await confirm({
      title: "Delete this notice?",
      subject: notice?.title,
      consequence:
        "The notice is moved to the recycle bin and disappears from the public noticeboard. An owner can restore it from the recycle bin, but deleting is not a publishable state.",
      confirmLabel: "Move to recycle bin",
      tone: "danger",
    });
    if (!ok) return;

    setActing("delete");
    try {
      const response = await fetch(`/api/notices/${params.id}`, { method: "DELETE" });
      if (!response.ok) {
        toast({
          tone: "danger",
          title: "The notice was not deleted",
          text: await readError(response, "Delete failed."),
        });
        return;
      }
      toast({ tone: "success", title: "Notice moved to the recycle bin" });
      router.push("/admin/notices");
      router.refresh();
    } catch {
      toast({ tone: "danger", title: "Could not reach the server", text: "Nothing was deleted." });
    } finally {
      setActing("");
    }
  }

  if (loadError) {
    return (
      <ErrorState
        title="This notice could not be loaded"
        message={loadError}
        actions={
          <Link className="btn btn-secondary" href="/admin/notices">
            Back to notices
          </Link>
        }
      />
    );
  }

  if (!notice) {
    return (
      <SkeletonRegion label="Loading the notice editor.">
        <div className="page-header">
          <div className="page-header-text">
            <Skeleton width={90} height={12} />
            <Skeleton width={220} height={30} />
          </div>
        </div>
        <div className="form-section" aria-hidden="true">
          <SkeletonText lines={2} />
          <Skeleton height={40} />
          <SkeletonText lines={4} />
        </div>
      </SkeletonRegion>
    );
  }

  const status = noticeStatus(notice.status);
  const published = notice.status === "PUBLISHED";
  const busy = saving || attachmentBusy || acting !== "";

  return (
    <>
      <PageHeader
        breadcrumbs={
          <Breadcrumbs
            items={[
              { label: "Admin", href: "/admin" },
              { label: "Notices", href: "/admin/notices" },
              { label: "Edit notice" },
            ]}
          />
        }
        eyebrow="Content"
        title={notice.title}
        size="small"
        meta={
          <>
            <StatusBadge descriptor={status} dot />
            {notice.is_pinned ? (
              <span className="badge badge-warning">
                <Pin aria-hidden="true" />
                Pinned
              </span>
            ) : null}
            <span className="badge">
              {departmentLabel(notice.department) ?? "College-wide"}
            </span>
            <span className="meta">by {notice.author}</span>
          </>
        }
        actions={
          <>
            {published ? (
              <a
                className="btn btn-secondary btn-sm"
                href={`/notices/${params.id}`}
                target="_blank"
                rel="noreferrer"
              >
                <ExternalLink aria-hidden="true" />
                View public page
              </a>
            ) : null}
            <Link className="btn btn-ghost btn-sm" href="/admin/notices">
              <ArrowLeft aria-hidden="true" />
              Back
            </Link>
          </>
        }
      />

      <form onSubmit={submitForm}>
        <fieldset className="form-section" disabled={busy}>
          <legend className="form-section-heading">Notice content</legend>
          <p className="form-section-desc">
            The public reading view preserves line breaks. Titles are limited to{" "}
            {MAX_TITLE} characters and bodies to {MAX_BODY.toLocaleString("en-IN")}.
          </p>

          <div className="field">
            <label className="field-label" htmlFor="edit-title">
              Title
              <span className="spacer" />
              <span
                className="field-optional"
                style={{ textTransform: "none" }}
              >
                {MAX_TITLE - notice.title.length} left
              </span>
            </label>
            <input
              id="edit-title"
              className="input"
              value={notice.title}
              maxLength={MAX_TITLE}
              required
              onChange={(event) => setNotice({ ...notice, title: event.target.value })}
            />
          </div>

          <div className="field">
            <label className="field-label" htmlFor="edit-body">
              Body
              <span className="spacer" />
              <span className="field-optional" style={{ textTransform: "none" }}>
                {MAX_BODY - notice.body.length} left
              </span>
            </label>
            <textarea
              id="edit-body"
              className="textarea"
              value={notice.body}
              maxLength={MAX_BODY}
              required
              onChange={(event) => setNotice({ ...notice, body: event.target.value })}
            />
          </div>
        </fieldset>

        <fieldset className="form-section" disabled={busy}>
          <legend className="form-section-heading">Classification</legend>
          <div className="form-grid-2">
            <div className="field">
              <label className="field-label" htmlFor="edit-department">
                Department
              </label>
              <select
                id="edit-department"
                className="select"
                value={notice.department ?? ""}
                onChange={(event) =>
                  setNotice({ ...notice, department: event.target.value || null })
                }
              >
                <option value="">College-wide / general</option>
                {DEPARTMENTS.map((department) => (
                  <option key={department.slug} value={department.slug}>
                    {department.shortName} — {department.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="field">
              <label className="field-label" htmlFor="edit-category">
                Category
                <span className="field-optional">Optional</span>
              </label>
              <input
                id="edit-category"
                className="input"
                value={notice.category ?? ""}
                maxLength={64}
                placeholder="Academic, Examination, Event…"
                onChange={(event) =>
                  setNotice({ ...notice, category: event.target.value || null })
                }
              />
            </div>
          </div>

          <label className="checkbox-field" htmlFor="edit-pinned">
            <input
              id="edit-pinned"
              type="checkbox"
              checked={notice.is_pinned}
              onChange={(event) => setNotice({ ...notice, is_pinned: event.target.checked })}
            />
            <span>
              <span className="checkbox-field-text">Mark as important</span>
              <span className="checkbox-field-hint">
                Important notices are listed first everywhere and carry an “Important”
                badge.
              </span>
            </span>
          </label>
        </fieldset>

        <div className="form-actions">
          <button className="btn" type="submit" disabled={busy}>
            {saving ? <span className="spinner" aria-hidden="true" /> : <Save aria-hidden="true" />}
            {saving ? "Saving…" : "Save changes"}
          </button>

          {published ? (
            <button
              type="button"
              className="btn btn-secondary"
              disabled={busy}
              onClick={() => void act("archive", "Archive")}
            >
              {acting === "archive" ? <span className="spinner" aria-hidden="true" /> : null}
              Archive
            </button>
          ) : (
            <button
              type="button"
              className="btn btn-secondary"
              disabled={busy}
              onClick={() => void act("publish", "Publish")}
            >
              {acting === "publish" ? <span className="spinner" aria-hidden="true" /> : null}
              Publish
            </button>
          )}

          <span className="spacer" />

          <button
            type="button"
            className="btn btn-danger-outline"
            disabled={busy}
            onClick={() => void deleteNotice()}
          >
            <Trash2 aria-hidden="true" />
            Delete
          </button>
        </div>
      </form>

      <section className="form-section" style={{ marginTop: "var(--space-5)" }}>
        <div className="admin-section-head">
          <div>
            <h2 className="form-section-heading">
              <Paperclip aria-hidden="true" style={{ width: 15, height: 15, display: "inline", verticalAlign: "-2px" }} />{" "}
              Attachments
            </h2>
            <p className="form-section-desc">
              Only active attachments on a published notice are visible to the public.
            </p>
          </div>
          <span className="badge">{attachments.length}</span>
        </div>

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
            if (file) void uploadAndAttach(file);
          }}
        >
          <span className="dropzone-icon" aria-hidden="true">
            <FileUp />
          </span>
          <p className="dropzone-title">Drop a file here, or choose one below</p>
          <p className="dropzone-hint">
            Files are streamed to storage, checksummed, and published atomically.
          </p>
          <label className="file-field" style={{ width: "min(24rem, 100%)" }}>
            <span className="sr-only">File to attach to this notice</span>
            <input
              ref={fileInput}
              type="file"
              disabled={attachmentBusy}
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void uploadAndAttach(file);
              }}
            />
          </label>
          {attachmentBusy ? (
            <p className="dropzone-hint row row-2" style={{ marginTop: 4 }}>
              <span className="spinner" aria-hidden="true" />
              Uploading and attaching…
            </p>
          ) : null}
        </div>

        <div className="form-grid-2" style={{ marginTop: "var(--space-4)" }}>
          <div className="field">
            <label className="field-label" htmlFor="existing-file-id">
              Attach an existing file
            </label>
            <input
              id="existing-file-id"
              className="input mono"
              value={existingFileId}
              placeholder="File UUID"
              disabled={attachmentBusy}
              onChange={(event) => setExistingFileId(event.target.value)}
              autoComplete="off"
              spellCheck={false}
            />
            <p className="field-hint">
              Paste the file UUID from the Files page to link an existing active file.
            </p>
          </div>
          <div className="field" style={{ justifyContent: "flex-end" }}>
            <button
              type="button"
              className="btn btn-secondary"
              disabled={attachmentBusy || existingFileId.trim().length === 0}
              onClick={() => void attachExistingFile()}
            >
              Attach existing file
            </button>
          </div>
        </div>

        {attachments.length === 0 ? (
          <EmptyState
            compact
            icon={Paperclip}
            title="No attachments"
            description="This notice has no supporting documents. Upload one above to make it downloadable from the public page."
          />
        ) : (
          <ul className="stack stack-2" style={{ listStyle: "none", padding: 0, marginTop: "var(--space-4)" }}>
            {attachments.map((attachment) => (
              <li className="attachment" key={attachment.id}>
                <span className="resource-icon" aria-hidden="true">
                  <FileIcon
                    name={attachment.original_name}
                    mimeType={attachment.mime_type}
                  />
                </span>
                <span className="attachment-main">
                  <span className="attachment-name" title={attachment.original_name}>
                    {attachment.original_name}
                  </span>
                  <span className="attachment-meta">
                    {fileTypeLabel(attachment.original_name, attachment.mime_type)} ·{" "}
                    {formatBytes(attachment.size_bytes)} ·{" "}
                    <StatusBadge descriptor={fileState(attachment.state)} />
                  </span>
                </span>
                <span className="row row-2">
                  {attachment.state === "ACTIVE" ? (
                    <a
                      className="btn btn-ghost btn-sm"
                      href={`/api/files/${attachment.file_id}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <ExternalLink aria-hidden="true" />
                      Open
                    </a>
                  ) : null}
                  <button
                    type="button"
                    className="btn btn-danger-outline btn-sm"
                    disabled={attachmentBusy}
                    onClick={() => void removeAttachment(attachment)}
                  >
                    <X aria-hidden="true" />
                    Remove
                  </button>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className="meta" style={{ marginTop: "var(--space-5)" }}>
        Created {formatDateTime(notice.created_at)}
        {notice.published_at ? ` · Published ${formatDateTime(notice.published_at)}` : ""} ·
        Last updated {formatDateTime(notice.updated_at)}
      </p>
    </>
  );
}
