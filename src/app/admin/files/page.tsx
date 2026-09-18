"use client";

import { useEffect, useRef, useState } from "react";

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
};

type FileResponse = {
  files: FileRow[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

const PAGE_SIZE = 50;

export default function FilesPage() {
  const [data, setData] = useState<FileResponse>({
    files: [],
    page: 1,
    pageSize: PAGE_SIZE,
    total: 0,
    totalPages: 1,
  });
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [department, setDepartment] = useState("");
  const [origin, setOrigin] = useState("");
  const [state, setState] = useState("");
  const [page, setPage] = useState(1);
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(true);
  const [departments, setDepartments] = useState<string[]>([]);
  const input = useRef<HTMLInputElement>(null);

  async function load(nextPage = page) {
    setLoading(true);

    const params = new URLSearchParams({
      page: String(nextPage),
      pageSize: String(PAGE_SIZE),
    });

    if (search) params.set("search", search);
    if (department) params.set("department", department);
    if (origin) params.set("origin", origin);
    if (state) params.set("state", state);

    try {
      const response = await fetch(`/api/files?${params.toString()}`, {
        cache: "no-store",
      });
      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error ?? "Unable to load files");
      }

      setData(result);
      setPage(result.page);
    } catch (error) {
      setMsg(error instanceof Error ? error.message : "Unable to load files");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load(1);
    // Filters are applied whenever the committed filter state changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, department, origin, state]);

  useEffect(() => {
    let cancelled = false;

    async function loadDepartments() {
      try {
        const response = await fetch("/api/files/meta", { cache: "no-store" });
        const result = await response.json();

        if (!response.ok) {
          throw new Error(result.error ?? "Unable to load departments");
        }

        if (!cancelled) {
          setDepartments(result.departments ?? []);
        }
      } catch (error) {
        if (!cancelled) {
          setMsg(
            error instanceof Error
              ? error.message
              : "Unable to load departments",
          );
        }
      }
    }

    void loadDepartments();

    return () => {
      cancelled = true;
    };
  }, []);

  async function upload(replaceId?: string) {
    const file = input.current?.files?.[0];
    if (!file) return;

    setMsg("Uploading…");

    const headers = {
      "X-File-Name": encodeURIComponent(file.name),
      "X-File-Size": String(file.size),
      "Content-Type": file.type || "application/octet-stream",
    };

    const url = replaceId
      ? `/api/files/${replaceId}/replace`
      : "/api/files";

    const response = await fetch(url, {
      method: "POST",
      headers,
      body: file,
    });

    const result = await response.json();

    setMsg(
      response.ok
        ? `Success: ${result.fileId ?? replaceId}`
        : (result.error ?? "Upload failed"),
    );

    if (input.current) input.current.value = "";
    await load(page);
  }

  async function remove(id: string) {
    const response = await fetch(`/api/files/${id}/delete`, {
      method: "DELETE",
    });
    const result = await response.json();

    setMsg(
      response.ok
        ? "File quarantined"
        : (result.error ?? "Delete failed"),
    );

    await load(page);
  }

  function applySearch(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPage(1);
    setSearch(searchInput.trim());
  }

  const rangeStart = data.total === 0 ? 0 : (data.page - 1) * PAGE_SIZE + 1;
  const rangeEnd = Math.min(data.page * PAGE_SIZE, data.total);

  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "flex-start", marginBottom: 20 }}>
        <div>
          <h1>Files & Archive</h1>
          <p className="muted">
            {loading
              ? "Loading…"
              : `${rangeStart.toLocaleString()}–${rangeEnd.toLocaleString()} of ${data.total.toLocaleString()} files`}
          </p>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 20 }}>
        <form
          onSubmit={applySearch}
          style={{ display: "grid", gridTemplateColumns: "minmax(220px, 2fr) repeat(3, minmax(150px, 1fr)) auto", gap: 10, alignItems: "end" }}
        >
          <label>
            <span className="muted">Search</span>
            <input
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              placeholder="Filename or legacy path"
              style={{ width: "100%" }}
            />
          </label>

          <label>
            <span className="muted">Department</span>
            <select
              value={department}
              onChange={(event) => {
                setPage(1);
                setDepartment(event.target.value);
              }}
              style={{ width: "100%" }}
            >
              <option value="">All departments</option>
              {departments.map((value) => (
                <option key={value} value={value}>
                  {value.replace("-noticeboard", "")}
                </option>
              ))}
            </select>
          </label>

          <label>
            <span className="muted">Source</span>
            <select
              value={origin}
              onChange={(event) => {
                setPage(1);
                setOrigin(event.target.value);
              }}
              style={{ width: "100%" }}
            >
              <option value="">All sources</option>
              <option value="LEGACY_IMPORT">Legacy archive</option>
              <option value="USER_UPLOAD">User uploads</option>
            </select>
          </label>

          <label>
            <span className="muted">State</span>
            <select
              value={state}
              onChange={(event) => {
                setPage(1);
                setState(event.target.value);
              }}
              style={{ width: "100%" }}
            >
              <option value="">All states</option>
              <option value="ACTIVE">Active</option>
              <option value="QUARANTINED">Quarantined</option>
              <option value="STAGING">Staging</option>
              <option value="PURGED">Purged</option>
            </select>
          </label>

          <button className="btn" type="submit">
            Search
          </button>
        </form>

        <div className="actions" style={{ marginTop: 12 }}>
          <input ref={input} type="file" />
          <button className="btn secondary" onClick={() => upload()}>
            Upload
          </button>
          {msg && <span className="muted">{msg}</span>}
        </div>
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Source</th>
              <th>Department</th>
              <th>Type</th>
              <th>Size</th>
              <th>State</th>
              <th>Actions</th>
            </tr>
          </thead>

          <tbody>
            {data.files.map((file) => (
              <tr key={file.id}>
                <td>
                  <div>{file.original_name}</div>
                  {file.legacy_relative_path && (
                    <div className="muted" style={{ fontSize: 12, maxWidth: 480, overflowWrap: "anywhere" }}>
                      {file.legacy_relative_path}
                    </div>
                  )}
                </td>

                <td>
                  <span className="badge">
                    {file.origin_type === "LEGACY_IMPORT" ? "Legacy" : "Upload"}
                  </span>
                </td>

                <td>
                  {file.legacy_department
                    ? file.legacy_department.replace("-noticeboard", "")
                    : "—"}
                </td>

                <td>{file.mime_type}</td>

                <td>{Number(file.size_bytes).toLocaleString()} B</td>

                <td>
                  <span className="badge">
                    {file.state} · v{file.version_number}
                  </span>
                </td>

                <td>
                  {file.state === "ACTIVE" && (
                    <div className="actions">
                      <a
                        className="btn secondary"
                        href={`/api/files/${file.id}`}
                      >
                        View
                      </a>

                      {file.origin_type !== "LEGACY_IMPORT" && (
                        <>
                          <button
                            className="btn secondary"
                            onClick={() => upload(file.id)}
                          >
                            Replace
                          </button>

                          <button
                            className="btn danger"
                            onClick={() => remove(file.id)}
                          >
                            Delete
                          </button>
                        </>
                      )}
                    </div>
                  )}
                </td>
              </tr>
            ))}

            {!loading && data.files.length === 0 && (
              <tr>
                <td colSpan={7} style={{ textAlign: "center", padding: 32 }}>
                  No files match these filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div
        className="actions"
        style={{
          justifyContent: "center",
          marginTop: 20,
          gap: 12,
        }}
      >
        <button
          className="btn secondary"
          disabled={loading || page <= 1}
          onClick={() => void load(page - 1)}
        >
          ← Previous
        </button>

        <span className="muted">
          Page {data.page.toLocaleString()} of{" "}
          {data.totalPages.toLocaleString()}
        </span>

        <button
          className="btn secondary"
          disabled={loading || page >= data.totalPages}
          onClick={() => void load(page + 1)}
        >
          Next →
        </button>
      </div>
    </>
  );
}
