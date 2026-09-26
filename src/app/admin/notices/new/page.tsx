"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertCircle, ArrowLeft, FilePlus2, Info, Pin } from "lucide-react";

import PageHeader from "@/src/components/PageHeader";
import Breadcrumbs from "@/src/components/Breadcrumbs";
import { DEPARTMENTS } from "@/src/lib/department-registry";

const MAX_TITLE = 200;
const MAX_BODY = 20000;

export default function NewNoticePage() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");

  const titleRemaining = MAX_TITLE - title.length;
  const bodyRemaining = MAX_BODY - body.length;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    setBusy(true);
    setError("");

    try {
      const response = await fetch("/api/notices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: fields.get("title"),
          body: fields.get("body"),
          department: fields.get("department"),
          category: fields.get("category"),
          isPinned: fields.get("isPinned") === "on",
        }),
      });
      const data = await response.json().catch(() => null);

      if (!response.ok) {
        setError(data?.error ?? "The notice could not be created.");
        return;
      }
      router.push(`/admin/notices/${data.id}`);
      router.refresh();
    } catch {
      setError("Could not reach the server. The notice was not created.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader
        breadcrumbs={
          <Breadcrumbs
            items={[
              { label: "Admin", href: "/admin" },
              { label: "Notices", href: "/admin/notices" },
              { label: "New notice" },
            ]}
          />
        }
        eyebrow="Content"
        title="New notice"
        description="Notices are created as drafts. A draft is invisible to the public until you publish it from the notice editor."
        size="small"
        actions={
          <Link className="btn btn-secondary btn-sm" href="/admin/notices">
            <ArrowLeft aria-hidden="true" />
            Cancel
          </Link>
        }
      />

      {error ? (
        <div className="alert feedback" role="alert" aria-live="assertive">
          <AlertCircle aria-hidden="true" />
          {error}
        </div>
      ) : null}

      <form className="form" onSubmit={submit}>
        <fieldset className="form-section" disabled={busy}>
          <legend className="form-section-heading">Notice content</legend>
          <p className="form-section-desc">
            The title and body become public exactly as typed. Line breaks are preserved
            when the notice is displayed.
          </p>

          <div className="field">
            <label className="field-label" htmlFor="notice-title">
              Title
              <span className="spacer" />
              <span
                className="field-optional"
                style={
                  titleRemaining < 20
                    ? { color: "var(--danger)", textTransform: "none" }
                    : undefined
                }
              >
                {titleRemaining} left
              </span>
            </label>
            <input
              id="notice-title"
              className="input"
              name="title"
              required
              maxLength={MAX_TITLE}
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="A short, specific headline"
              autoComplete="off"
            />
          </div>

          <div className="field">
            <label className="field-label" htmlFor="notice-body">
              Body
              <span className="spacer" />
              <span className="field-optional" style={{ textTransform: "none" }}>
                {bodyRemaining} left
              </span>
            </label>
            <textarea
              id="notice-body"
              className="textarea"
              name="body"
              required
              maxLength={MAX_BODY}
              value={body}
              onChange={(event) => setBody(event.target.value)}
              placeholder="The full text of the announcement…"
            />
          </div>
        </fieldset>

        <fieldset className="form-section" disabled={busy}>
          <legend className="form-section-heading">Classification</legend>
          <p className="form-section-desc">
            Classification decides where the notice appears publicly and how it is grouped
            for visitors.
          </p>

          <div className="form-grid-2">
            <div className="field">
              <label className="field-label" htmlFor="notice-department">
                Department
              </label>
              <select id="notice-department" className="select" name="department" defaultValue="">
                <option value="">College-wide / general</option>
                {DEPARTMENTS.map((department) => (
                  <option key={department.slug} value={department.slug}>
                    {department.shortName} — {department.name}
                  </option>
                ))}
              </select>
              <p className="field-hint">
                College-wide notices appear on the homepage for every visitor.
              </p>
            </div>

            <div className="field">
              <label className="field-label" htmlFor="notice-category">
                Category
                <span className="field-optional">Optional</span>
              </label>
              <input
                id="notice-category"
                className="input"
                name="category"
                maxLength={64}
                placeholder="Academic, Examination, Event…"
                autoComplete="off"
              />
              <p className="field-hint">Up to 64 characters. Used as a filter chip.</p>
            </div>
          </div>

          <label className="checkbox-field" htmlFor="notice-pinned">
            <input id="notice-pinned" type="checkbox" name="isPinned" />
            <span>
              <span className="checkbox-field-text">
                <Pin
                  aria-hidden="true"
                  style={{ width: 13, height: 13, display: "inline", verticalAlign: "-2px" }}
                />{" "}
                Mark as important
              </span>
              <span className="checkbox-field-hint">
                Important notices are surfaced first in every public list and are marked
                with an “Important” badge.
              </span>
            </span>
          </label>
        </fieldset>

        <div className="form-actions">
          <button className="btn" type="submit" disabled={busy}>
            {busy ? <span className="spinner" aria-hidden="true" /> : <FilePlus2 aria-hidden="true" />}
            {busy ? "Creating…" : "Create draft"}
          </button>
          <Link className="btn btn-ghost" href="/admin/notices">
            Cancel
          </Link>
          <span className="spacer" />
          <p className="meta row row-2" style={{ margin: 0 }}>
            <Info aria-hidden="true" style={{ width: 14, height: 14 }} />
            The notice is saved as a draft. You can attach files before publishing.
          </p>
        </div>
      </form>
    </>
  );
}
