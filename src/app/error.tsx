"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle, ArrowLeft, RotateCcw } from "lucide-react";

/**
 * Application-level error boundary.
 *
 * Communicates that something failed and offers recovery, without ever
 * surfacing an internal error string to the browser. The digest is shown
 * because it is the only handle an operator can give to a maintainer, and it
 * is not derived from request data.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Operational breadcrumb only; no request data or user content is logged.
    console.error("Page render failed", error.digest ?? "");
  }, [error]);

  return (
    <div className="auth-shell">
      <main className="auth-card" id="main-content">
        <span className="dialog-icon dialog-icon-danger" aria-hidden="true">
          <AlertTriangle />
        </span>
        <h1 className="auth-title" style={{ marginTop: "var(--space-4)" }}>
          Something went wrong
        </h1>
        <p className="auth-description">
          This page could not be rendered. Nothing was changed. The failure has been
          recorded; you can try again, or return to a page that is known to work.
        </p>

        {error.digest ? (
          <p className="auth-hint">
            Reference for the maintainer: <span className="hash">{error.digest}</span>
          </p>
        ) : null}

        <div className="state-actions" style={{ marginTop: "var(--space-5)" }}>
          <button type="button" className="btn" onClick={reset}>
            <RotateCcw aria-hidden="true" />
            Try again
          </button>
          <Link className="btn btn-secondary" href="/">
            <ArrowLeft aria-hidden="true" />
            Noticeboard home
          </Link>
        </div>
      </main>
    </div>
  );
}
