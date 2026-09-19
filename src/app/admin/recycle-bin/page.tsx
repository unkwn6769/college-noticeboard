"use client";

import { useEffect, useState } from "react";

type DeletedNotice = {
  id: string;
  title: string;
  department: string | null;
  status: string;
  author: string;
  deleted_at: string;
  created_at: string;
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

export default function RecycleBinPage() {
  const [notices, setNotices] = useState<DeletedNotice[]>([]);
  const [files, setFiles] = useState<QuarantinedFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<"notices" | "files">("notices");

  async function load() {
    setLoading(true);
    try {
      const r = await fetch("/api/admin/recycle-bin", { cache: "no-store" });
      const d = await r.json();
      setNotices(d.notices ?? []);
      setFiles(d.files ?? []);
    } catch {
      setMsg("Failed to load recycle bin.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  async function restoreNotice(id: string, title: string) {
    if (!window.confirm(`Restore notice "${title}"? It will become a draft.`)) return;
    setBusy(true);
    setMsg("");
    const r = await fetch(`/api/admin/recycle-bin/notices/${id}`, { method: "POST" });
    const d = await r.json();
    setMsg(r.ok ? `Notice restored as draft.` : (d.error ?? "Restore failed"));
    setBusy(false);
    await load();
  }

  async function purgeNotice(id: string, title: string) {
    if (!window.confirm(`Permanently delete notice "${title}"? This cannot be undone.`)) return;
    setBusy(true);
    setMsg("");
    const r = await fetch(`/api/admin/recycle-bin/notices/${id}`, { method: "DELETE" });
    const d = await r.json();
    setMsg(r.ok ? `Notice permanently deleted.` : (d.error ?? "Delete failed"));
    setBusy(false);
    await load();
  }

  async function restoreFile(id: string, name: string) {
    if (!window.confirm(`Restore file "${name}" to active storage?`)) return;
    setBusy(true);
    setMsg("");
    const r = await fetch(`/api/admin/recycle-bin/files/${id}`, { method: "POST" });
    const d = await r.json();
    setMsg(r.ok ? `File restored to active.` : (d.error ?? "Restore failed"));
    setBusy(false);
    await load();
  }

  async function purgeFile(id: string, name: string) {
    if (!window.confirm(`Permanently purge file "${name}"? The bytes will be deleted from storage. This cannot be undone.`)) return;
    setBusy(true);
    setMsg("");
    const r = await fetch(`/api/admin/recycle-bin/files/${id}`, { method: "DELETE" });
    const d = await r.json();
    setMsg(r.ok ? `File purged.` : (d.error ?? "Purge failed"));
    setBusy(false);
    await load();
  }

  const emptyAll = notices.length === 0 && files.length === 0;

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Recycle Bin</h1>
          <p className="muted">
            Deleted notices and quarantined files. Restore or permanently delete items.
            {!loading && ` ${notices.length} deleted notice${notices.length !== 1 ? "s" : ""}, ${files.length} quarantined file${files.length !== 1 ? "s" : ""}.`}
          </p>
        </div>
      </div>

      {msg && (
        <div className={msg.includes("failed") || msg.includes("Failed") ? "alert" : "alert-success"}>
          {msg}
        </div>
      )}

      {loading ? (
        <div className="loading-state">
          <div className="loading-spinner" />
          <p className="muted">Loading recycle bin…</p>
        </div>
      ) : emptyAll ? (
        <div className="empty-state">
          <div className="empty-state-icon">🗑️</div>
          <h2>Recycle bin is empty</h2>
          <p className="muted">No deleted notices or quarantined files.</p>
        </div>
      ) : (
        <>
          <div className="tab-bar">
            <button
              className={`tab-btn${tab === "notices" ? " active" : ""}`}
              onClick={() => setTab("notices")}
            >
              Notices <span className="badge">{notices.length}</span>
            </button>
            <button
              className={`tab-btn${tab === "files" ? " active" : ""}`}
              onClick={() => setTab("files")}
            >
              Files <span className="badge">{files.length}</span>
            </button>
          </div>

          {tab === "notices" && (
            notices.length === 0 ? (
              <div className="empty-state-inline" style={{ padding: "32px 0" }}>
                <span className="muted">No deleted notices.</span>
              </div>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Title</th>
                      <th>Department</th>
                      <th>Status when deleted</th>
                      <th>Author</th>
                      <th>Deleted at</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {notices.map((n) => (
                      <tr key={n.id}>
                        <td style={{ fontWeight: 600 }}>{n.title}</td>
                        <td className="muted" style={{ fontSize: 13 }}>
                          {n.department ? n.department.replace("-noticeboard", "").toUpperCase() : "College-wide"}
                        </td>
                        <td>
                          <span className="badge">{n.status}</span>
                        </td>
                        <td className="muted" style={{ fontSize: 13 }}>{n.author}</td>
                        <td className="muted" style={{ fontSize: 13, whiteSpace: "nowrap" }}>
                          {new Date(n.deleted_at).toLocaleString()}
                        </td>
                        <td>
                          <div className="actions">
                            <button
                              className="btn secondary"
                              onClick={() => restoreNotice(n.id, n.title)}
                              disabled={busy}
                            >
                              Restore
                            </button>
                            <button
                              className="btn danger"
                              onClick={() => purgeNotice(n.id, n.title)}
                              disabled={busy}
                            >
                              Delete permanently
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          )}

          {tab === "files" && (
            files.length === 0 ? (
              <div className="empty-state-inline" style={{ padding: "32px 0" }}>
                <span className="muted">No quarantined files.</span>
              </div>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Source</th>
                      <th>Type</th>
                      <th>Size</th>
                      <th>Quarantined at</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {files.map((f) => (
                      <tr key={f.id}>
                        <td style={{ fontWeight: 600 }}>
                          {f.original_name}
                          {f.legacy_department && (
                            <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>
                              {f.legacy_department.replace("-noticeboard", "")}
                            </div>
                          )}
                        </td>
                        <td>
                          <span className="badge">
                            {f.origin_type === "LEGACY_IMPORT" ? "Legacy" : "Upload"}
                          </span>
                        </td>
                        <td className="muted" style={{ fontSize: 13 }}>{f.mime_type}</td>
                        <td className="muted" style={{ fontSize: 13 }}>
                          {Number(f.size_bytes).toLocaleString()} B
                        </td>
                        <td className="muted" style={{ fontSize: 13, whiteSpace: "nowrap" }}>
                          {new Date(f.updated_at).toLocaleString()}
                        </td>
                        <td>
                          <div className="actions">
                            <button
                              className="btn secondary"
                              onClick={() => restoreFile(f.id, f.original_name)}
                              disabled={busy}
                            >
                              Restore
                            </button>
                            <button
                              className="btn danger"
                              onClick={() => purgeFile(f.id, f.original_name)}
                              disabled={busy}
                            >
                              Purge
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          )}
        </>
      )}
    </>
  );
}
