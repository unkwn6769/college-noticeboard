"use client";
import { useEffect, useState } from "react";

type AuditEvent = {
  id: string;
  event_type: string;
  entity_type: string | null;
  entity_id: string | null;
  metadata: any;
  created_at: string;
  actor_email: string | null;
  actor_name: string | null;
};

type AuditResponse = {
  events: AuditEvent[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

export default function AuditPage() {
  const [data, setData] = useState<AuditResponse>({ events: [], page: 1, pageSize: 50, total: 0, totalPages: 1 });
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");

  const [eventTypes, setEventTypes] = useState<string[]>([]);
  const [entityTypes, setEntityTypes] = useState<string[]>([]);

  // Filters
  const [eventType, setEventType] = useState("");
  const [entityType, setEntityType] = useState("");
  const [entityId, setEntityId] = useState("");
  const [actorEmail, setActorEmail] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(1);

  // Load Meta
  useEffect(() => {
    let cancelled = false;
    fetch("/api/admin/audit?meta=true")
      .then(r => r.json())
      .then(d => {
        if (!cancelled && d.eventTypes) {
          setEventTypes(d.eventTypes);
          setEntityTypes(d.entityTypes);
        }
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  async function load(nextPage = page) {
    setLoading(true);
    setMsg("");

    const params = new URLSearchParams({
      page: String(nextPage),
      pageSize: "50",
    });

    if (eventType) params.set("eventType", eventType);
    if (entityType) params.set("entityType", entityType);
    if (entityId) params.set("entityId", entityId.trim());
    if (actorEmail) params.set("actorEmail", actorEmail.trim());
    if (dateFrom) params.set("dateFrom", dateFrom);
    if (dateTo) params.set("dateTo", dateTo);

    try {
      const r = await fetch(`/api/admin/audit?${params.toString()}`);
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Failed to load audit logs");
      setData(d);
      setPage(d.page);
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Error loading logs");
    } finally {
      setLoading(false);
    }
  }

  // Load when filters change (debounced effectively by form submit, but we can do on change for selects)
  useEffect(() => {
    void load(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventType, entityType, dateFrom, dateTo]);

  function applySearch(e: React.FormEvent) {
    e.preventDefault();
    void load(1);
  }

  function clearFilters() {
    setEventType("");
    setEntityType("");
    setEntityId("");
    setActorEmail("");
    setDateFrom("");
    setDateTo("");
    setPage(1);
    // useEffect will trigger load
  }

  const rangeStart = data.total === 0 ? 0 : (data.page - 1) * data.pageSize + 1;
  const rangeEnd = Math.min(data.page * data.pageSize, data.total);

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Audit Log</h1>
          <p className="muted">
            {loading ? "Loading..." : `${rangeStart.toLocaleString()}–${rangeEnd.toLocaleString()} of ${data.total.toLocaleString()} events`}
          </p>
        </div>
      </div>

      {msg && <div className="alert">{msg}</div>}

      <div className="card" style={{ marginBottom: 20 }}>
        <form onSubmit={applySearch} className="admin-search-form">
          <label>
            <span className="muted" style={{ fontSize: 13, marginBottom: 4, display: "block" }}>Action / Event Type</span>
            <select value={eventType} onChange={e => setEventType(e.target.value)}>
              <option value="">All events</option>
              {eventTypes.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </label>

          <label>
            <span className="muted" style={{ fontSize: 13, marginBottom: 4, display: "block" }}>Entity Type</span>
            <select value={entityType} onChange={e => setEntityType(e.target.value)}>
              <option value="">All entities</option>
              {entityTypes.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </label>

          <label>
            <span className="muted" style={{ fontSize: 13, marginBottom: 4, display: "block" }}>Entity ID</span>
            <input
              placeholder="UUID"
              value={entityId}
              onChange={e => setEntityId(e.target.value)}
            />
          </label>

          <label>
            <span className="muted" style={{ fontSize: 13, marginBottom: 4, display: "block" }}>Actor Email</span>
            <input
              placeholder="user@example.com"
              value={actorEmail}
              onChange={e => setActorEmail(e.target.value)}
            />
          </label>

          <label>
            <span className="muted" style={{ fontSize: 13, marginBottom: 4, display: "block" }}>From Date</span>
            <input
              type="date"
              value={dateFrom}
              onChange={e => setDateFrom(e.target.value)}
            />
          </label>

          <label>
            <span className="muted" style={{ fontSize: 13, marginBottom: 4, display: "block" }}>To Date</span>
            <input
              type="date"
              value={dateTo}
              onChange={e => setDateTo(e.target.value)}
            />
          </label>

          <div className="actions" style={{ gridColumn: "1 / -1" }}>
            <button type="submit" className="btn">Search</button>
            <button type="button" className="btn secondary" onClick={clearFilters}>Clear filters</button>
          </div>
        </form>
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Time</th>
              <th>Action</th>
              <th>Actor</th>
              <th>Resource</th>
              <th>Details</th>
            </tr>
          </thead>
          <tbody>
            {data.events.map(e => (
              <tr key={e.id}>
                <td className="muted" style={{ fontSize: 13, whiteSpace: "nowrap" }}>
                  {new Date(e.created_at).toLocaleString()}
                </td>
                <td><span className="badge badge-published" style={{ background: "#e2e8f0", color: "#0f172a" }}>{e.event_type}</span></td>
                <td>
                  {e.actor_name ? (
                    <>
                      <div style={{ fontWeight: 600 }}>{e.actor_name}</div>
                      <div className="muted" style={{ fontSize: 12 }}>{e.actor_email}</div>
                    </>
                  ) : (
                    <span className="muted">System</span>
                  )}
                </td>
                <td>
                  {(e.entity_type || e.entity_id) ? (
                    <>
                      <div style={{ fontWeight: 600, textTransform: "capitalize" }}>{e.entity_type}</div>
                      <div className="muted" style={{ fontSize: 11, fontFamily: "monospace" }}>{e.entity_id}</div>
                    </>
                  ) : <span className="muted">—</span>}
                </td>
                <td style={{ fontSize: 12 }}>
                  <code style={{ background: "#f8fafc", padding: "4px 8px", borderRadius: 6, display: "block", overflowWrap: "anywhere" }}>
                    {JSON.stringify(e.metadata)}
                  </code>
                </td>
              </tr>
            ))}
            {!loading && data.events.length === 0 && (
              <tr>
                <td colSpan={5}>
                  <div className="empty-state-inline" style={{ padding: "32px 0", border: "none" }}>
                    <span className="muted">No audit events match these filters.</span>
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="actions" style={{ justifyContent: "center", marginTop: 20, gap: 12 }}>
        <button
          className="btn secondary"
          disabled={loading || page <= 1}
          onClick={() => void load(page - 1)}
        >
          ← Previous
        </button>
        <span className="muted" style={{ display: "flex", alignItems: "center" }}>
          Page {data.page.toLocaleString()} of {data.totalPages.toLocaleString()}
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
