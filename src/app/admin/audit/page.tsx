"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  ChevronRight,
  FilterX,
  Info,
  Search,
} from "lucide-react";

import PageHeader from "@/src/components/PageHeader";
import StatusBadge from "@/src/components/StatusBadge";
import EmptyState from "@/src/components/EmptyState";
import ErrorState from "@/src/components/ErrorState";
import Breadcrumbs from "@/src/components/Breadcrumbs";
import { SkeletonRegion, Skeleton } from "@/src/components/Skeleton";
import { auditEvent, auditTone, humanise } from "@/src/lib/status";
import { formatDateTime, formatRelativeTime } from "@/src/lib/format";

const PAGE_SIZE = 50;

type AuditEvent = {
  id: string;
  event_type: string;
  entity_type: string | null;
  entity_id: string | null;
  metadata: unknown;
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

const EMPTY: AuditResponse = { events: [], page: 1, pageSize: PAGE_SIZE, total: 0, totalPages: 1 };

/** Only well-formed, non-sensitive metadata is expanded on request. */
function safeMetadata(value: unknown): string {
  if (value === null || value === undefined) return "No metadata recorded.";
  if (typeof value === "string") return value;
  try {
    const text = JSON.stringify(value, null, 2);
    return text.length > 4000 ? `${text.slice(0, 4000)}\n…` : text;
  } catch {
    return "Metadata could not be displayed.";
  }
}

export default function AuditPage() {
  const [data, setData] = useState<AuditResponse>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  const [eventTypes, setEventTypes] = useState<string[]>([]);
  const [entityTypes, setEntityTypes] = useState<string[]>([]);

  const [eventType, setEventType] = useState("");
  const [entityType, setEntityType] = useState("");
  const [entityIdInput, setEntityIdInput] = useState("");
  const [entityId, setEntityId] = useState("");
  const [actorEmailInput, setActorEmailInput] = useState("");
  const [actorEmail, setActorEmail] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(1);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/admin/audit?meta=true")
      .then((response) => response.json())
      .then((payload) => {
        if (cancelled) return;
        if (Array.isArray(payload?.eventTypes)) setEventTypes(payload.eventTypes);
        if (Array.isArray(payload?.entityTypes)) setEntityTypes(payload.entityTypes);
      })
      .catch(() => {
        // Filters fall back to "All", which is still a usable view.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const load = useCallback(
    async (nextPage: number) => {
      setLoading(true);
      const params = new URLSearchParams({ page: String(nextPage), pageSize: String(PAGE_SIZE) });
      if (eventType) params.set("eventType", eventType);
      if (entityType) params.set("entityType", entityType);
      if (entityId) params.set("entityId", entityId);
      if (actorEmail) params.set("actorEmail", actorEmail);
      if (dateFrom) params.set("dateFrom", dateFrom);
      if (dateTo) params.set("dateTo", dateTo);

      try {
        const response = await fetch(`/api/admin/audit?${params.toString()}`, { cache: "no-store" });
        const payload = await response.json();
        if (!response.ok) {
          throw new Error(payload?.error ?? "The audit log could not be loaded.");
        }
        setData(payload);
        setPage(payload.page);
        setLoadError("");
      } catch (error) {
        setData(EMPTY);
        setLoadError(
          error instanceof Error ? error.message : "The audit log could not be loaded.",
        );
      } finally {
        setLoading(false);
      }
    },
    [eventType, entityType, entityId, actorEmail, dateFrom, dateTo],
  );

  useEffect(() => {
    void load(1);
  }, [load]);

  const rangeStart = data.total === 0 ? 0 : (data.page - 1) * PAGE_SIZE + 1;
  const rangeEnd = Math.min(data.page * PAGE_SIZE, data.total);
  const filtersActive = Boolean(
    eventType || entityType || entityId || actorEmail || dateFrom || dateTo,
  );

  const grouped = useMemo(() => {
    const byDay = new Map<string, AuditEvent[]>();
    for (const event of data.events) {
      const day = new Date(event.created_at).toDateString();
      const bucket = byDay.get(day);
      if (bucket) bucket.push(event);
      else byDay.set(day, [event]);
    }
    return Array.from(byDay.entries());
  }, [data.events]);

  function clearFilters() {
    setEventType("");
    setEntityType("");
    setEntityId("");
    setEntityIdInput("");
    setActorEmail("");
    setActorEmailInput("");
    setDateFrom("");
    setDateTo("");
  }

  return (
    <>
      <PageHeader
        breadcrumbs={
          <Breadcrumbs items={[{ label: "Admin", href: "/admin" }, { label: "Audit log" }]} />
        }
        eyebrow="Governance"
        title="Audit log"
        description="Every recorded administrative event, newest first. The log is append-only: entries are never edited or removed."
        actions={
          <span className="badge">
            <Activity aria-hidden="true" />
            {loading
              ? "Loading…"
              : `${rangeStart.toLocaleString("en-IN")}–${rangeEnd.toLocaleString("en-IN")} of ${data.total.toLocaleString("en-IN")} events`}
          </span>
        }
      />

      <form
        className="filter-bar"
        role="search"
        aria-label="Filter the audit log"
        onSubmit={(event) => {
          event.preventDefault();
          setEntityId(entityIdInput.trim());
          setActorEmail(actorEmailInput.trim());
        }}
      >
        <div className="field">
          <label className="field-label" htmlFor="audit-event">
            Event type
          </label>
          <select
            id="audit-event"
            className="select"
            value={eventType}
            onChange={(event) => {
              setEventType(event.target.value);
              setPage(1);
            }}
          >
            <option value="">All events</option>
            {eventTypes.map((type) => (
              <option key={type} value={type}>
                {humanise(type)}
              </option>
            ))}
          </select>
        </div>

        <div className="field">
          <label className="field-label" htmlFor="audit-entity-type">
            Entity type
          </label>
          <select
            id="audit-entity-type"
            className="select"
            value={entityType}
            onChange={(event) => {
              setEntityType(event.target.value);
              setPage(1);
            }}
          >
            <option value="">All entities</option>
            {entityTypes.map((type) => (
              <option key={type} value={type}>
                {humanise(type)}
              </option>
            ))}
          </select>
        </div>

        <div className="field">
          <label className="field-label" htmlFor="audit-entity-id">
            Entity ID
          </label>
          <input
            id="audit-entity-id"
            className="input mono"
            value={entityIdInput}
            placeholder="UUID"
            autoComplete="off"
            spellCheck={false}
            onChange={(event) => setEntityIdInput(event.target.value)}
          />
        </div>

        <div className="field">
          <label className="field-label" htmlFor="audit-actor">
            Actor email
          </label>
          <input
            id="audit-actor"
            className="input"
            type="email"
            value={actorEmailInput}
            placeholder="user@example.com"
            autoComplete="off"
            onChange={(event) => setActorEmailInput(event.target.value)}
          />
        </div>

        <div className="field">
          <label className="field-label" htmlFor="audit-from">
            From
          </label>
          <input
            id="audit-from"
            className="input"
            type="date"
            value={dateFrom}
            max={dateTo || undefined}
            onChange={(event) => {
              setDateFrom(event.target.value);
              setPage(1);
            }}
          />
        </div>

        <div className="field">
          <label className="field-label" htmlFor="audit-to">
            To
          </label>
          <input
            id="audit-to"
            className="input"
            type="date"
            value={dateTo}
            min={dateFrom || undefined}
            onChange={(event) => {
              setDateTo(event.target.value);
              setPage(1);
            }}
          />
        </div>

        <div className="filter-bar-actions">
          <button
            className="btn"
            type="submit"
            disabled={loading}
          >
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
            title="The audit log could not be loaded"
            message={loadError}
            onRetry={() => void load(page)}
          />
        </div>
      ) : loading ? (
        <div className="admin-section" style={{ marginTop: "var(--space-5)" }}>
          <SkeletonRegion label="Loading audit events.">
            <div className="stack stack-3">
              {Array.from({ length: 6 }, (_, index) => (
                <div key={index} className="row" style={{ gap: 16 }}>
                  <Skeleton width={28} height={28} circle />
                  <div style={{ flex: 1 }}>
                    <Skeleton width="35%" height={13} />
                    <Skeleton width="60%" height={11} />
                  </div>
                  <Skeleton width={90} height={11} />
                </div>
              ))}
            </div>
          </SkeletonRegion>
        </div>
      ) : data.events.length === 0 ? (
        <div style={{ marginTop: "var(--space-5)" }}>
          <EmptyState
            icon={filtersActive ? Search : Info}
            title={
              filtersActive
                ? "No audit events match these filters"
                : "The audit log is empty"
            }
            description={
              filtersActive
                ? "Nothing recorded matches the current event type, entity, actor or date range. Widen the date range or clear the filters."
                : "No administrative action has been recorded yet. Events appear here the moment a notice, file or account is changed."
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
        <div style={{ marginTop: "var(--space-5)" }} className="stack stack-6">
          {grouped.map(([day, events]) => (
            <section key={day} aria-label={`Events on ${day}`}>
              <div className="row row-3" style={{ marginBottom: 12 }}>
                <h2 className="metric-label" style={{ margin: 0 }}>
                  {day}
                </h2>
                <span className="badge">{events.length}</span>
              </div>

              <ol className="timeline" style={{ listStyle: "none", padding: 0, margin: 0 }}>
                {events.map((event) => (
                  <li className="timeline-item" key={event.id}>
                    <span className={`timeline-marker timeline-marker-${auditTone(event.event_type)}`} aria-hidden="true">
                      <Activity />
                    </span>
                    <div className="timeline-body">
                      <div className="timeline-head">
                        <span className="timeline-event mono">{event.event_type}</span>
                        <StatusBadge
                          descriptor={auditEvent(event.event_type)}
                          dot
                        />
                        <time
                          className="timeline-time"
                          dateTime={event.created_at}
                          title={formatDateTime(event.created_at)}
                        >
                          {formatRelativeTime(event.created_at)}
                        </time>
                      </div>

                      <p className="timeline-details">
                        {event.actor_name ? (
                          <>
                            <strong>{event.actor_name}</strong>
                            {event.actor_email ? ` · ${event.actor_email}` : ""}
                          </>
                        ) : (
                          "System"
                        )}
                        {event.entity_type || event.entity_id ? (
                          <>
                            {" — "}
                            {event.entity_type ? humanise(event.entity_type) : "resource"}
                            {event.entity_id ? ` ${event.entity_id}` : ""}
                          </>
                        ) : null}
                      </p>

                      <details className="metadata">
                        <summary>
                          <ChevronRight aria-hidden="true" />
                          Metadata
                        </summary>
                        <pre className="metadata-body">{safeMetadata(event.metadata)}</pre>
                      </details>
                    </div>
                  </li>
                ))}
              </ol>
            </section>
          ))}
        </div>
      )}

      {!loadError && data.totalPages > 1 ? (
        <nav className="pagination" aria-label="Audit log pagination">
          <p className="pagination-info">
            Page {data.page} of {data.totalPages} · {data.total.toLocaleString("en-IN")} events
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
              {rangeStart.toLocaleString("en-IN")}–{rangeEnd.toLocaleString("en-IN")}
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
      ) : null}
    </>
  );
}
