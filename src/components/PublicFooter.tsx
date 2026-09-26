import Link from "next/link";

const FOOTER_SECTIONS = [
  {
    title: "Notices",
    links: [
      { href: "/#notices", label: "Latest & important" },
      { href: "/departments/exams-noticeboard", label: "Examinations" },
      { href: "/departments/gen-noticeboard", label: "General notices" },
    ],
  },
  {
    title: "Directory",
    links: [
      { href: "/departments", label: "All departments" },
      { href: "/archive", label: "College archive" },
      { href: "/search", label: "Search the noticeboard" },
    ],
  },
  {
    title: "Staff",
    links: [
      { href: "/login", label: "Sign in" },
      { href: "/admin", label: "Admin workspace" },
    ],
  },
] as const;

/**
 * Footer: a real site map rather than a repeated copy of the header, so the
 * end of every page offers the destinations a visitor is most likely to want
 * next.
 */
export default function PublicFooter() {
  return (
    <footer className="site-footer no-print">
      <div className="container">
        <div className="site-footer-inner">
          <div>
            <p className="brand">
              <span className="brand-mark" aria-hidden="true">
                CN
              </span>
              <span className="brand-text">
                <span className="brand-name">College Noticeboard</span>
                <span className="brand-sub">Official announcements</span>
              </span>
            </p>
            <p className="site-footer-about">
              Official college notices, departmental resources and examination
              information, published from a single self-hosted noticeboard.
            </p>
          </div>

          {FOOTER_SECTIONS.map((section) => (
            <nav key={section.title} aria-label={section.title}>
              <h2>{section.title}</h2>
              <div className="site-footer-links">
                {section.links.map((link) => (
                  <Link key={link.href} href={link.href}>
                    {link.label}
                  </Link>
                ))}
              </div>
            </nav>
          ))}
        </div>

        <div className="site-footer-bottom">
          <p>Official announcements for the college community.</p>
          <p>Physical storage locations are never exposed publicly.</p>
        </div>
      </div>
    </footer>
  );
}
