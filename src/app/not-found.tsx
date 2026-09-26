import Link from "next/link";
import { Compass, Home, Search } from "lucide-react";

import PublicNav from "@/src/components/PublicNav";
import PublicFooter from "@/src/components/PublicFooter";

export const metadata = {
  title: "Page not found",
  robots: { index: false, follow: true },
};

const SUGGESTIONS = [
  {
    href: "/",
    icon: Home,
    title: "Noticeboard home",
    hint: "Latest notices, departments and recent resources",
  },
  {
    href: "/departments",
    icon: Compass,
    title: "Department directory",
    hint: "Every registered department and its archive",
  },
  {
    href: "/search",
    icon: Search,
    title: "Search the noticeboard",
    hint: "Find a notice, department or archive file by name",
  },
] as const;

/**
 * A not-found page that is part of the product rather than a developer
 * default: it explains what happened and offers the three routes that
 * actually resolve most cases.
 */
export default function NotFound() {
  return (
    <>
      <PublicNav />
      <main className="page" id="main-content">
        <div className="container">
          <div className="stack stack-6" style={{ maxWidth: "42rem" }}>
            <div className="state" style={{ padding: "var(--space-9) var(--space-5)" }}>
              <span className="state-icon state-icon-info" aria-hidden="true">
                <svg viewBox="0 0 24 24" width={22} height={22} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
                  <circle cx="12" cy="12" r="9" />
                  <path d="M12 8v5M12 16.5h.01" />
                </svg>
              </span>
              <p className="eyebrow">Error 404</p>
              <h1 className="state-title" style={{ fontSize: "var(--text-2xl)" }}>
                We could not find that page
              </h1>
              <p className="state-text">
                The address may be mistyped, or the notice, department or archive
                resource it pointed to is no longer published. Nothing has been lost —
                unpublished notices simply stop being public.
              </p>
              <div className="state-actions">
                <Link className="btn" href="/">
                  Back to the noticeboard
                </Link>
                <Link className="btn btn-secondary" href="/search">
                  <Search aria-hidden="true" />
                  Search instead
                </Link>
              </div>
            </div>

            <div>
              <p className="eyebrow" style={{ marginBottom: 10 }}>
                Where would you like to go?
              </p>
              <div className="quick-access">
                {SUGGESTIONS.map((item) => {
                  const Icon = item.icon;
                  return (
                    <Link className="quick-access-item" key={item.href} href={item.href}>
                      <span className="quick-access-icon" aria-hidden="true">
                        <Icon />
                      </span>
                      <span className="quick-access-text">
                        <span className="quick-access-title">{item.title}</span>
                        <span className="quick-access-hint">{item.hint}</span>
                      </span>
                    </Link>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </main>
      <PublicFooter />
    </>
  );
}
