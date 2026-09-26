"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";

const ADMIN_LINKS = [
  { href: "/admin", label: "Dashboard", exact: true },
  { href: "/admin/notices", label: "Notices", exact: false },
  { href: "/admin/files", label: "Files", exact: false },
  { href: "/admin/recycle-bin", label: "Recycle Bin", exact: false },
  { href: "/admin/audit", label: "Audit", exact: false },
  { href: "/admin/storage", label: "Storage", exact: false },
  { href: "/admin/integrity", label: "Integrity", exact: false },
  { href: "/admin/scanner", label: "Scanner", exact: false },
] as const;

export default function AdminNav() {
  const router = useRouter();
  const pathname = usePathname();
  const [isOwner, setIsOwner] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((data) => setIsOwner(data.user?.role === "OWNER"))
      .catch(() => setIsOwner(false));
  }, []);

  // Close mobile menu on navigation
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  function isActive(href: string, exact: boolean) {
    if (exact) return pathname === href;
    return pathname === href || pathname.startsWith(`${href}/`);
  }

  return (
    <header className="topbar">
      <div className="container topbar-inner">
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <Link className="brand" href="/admin">
            <span style={{ opacity: 0.6, fontSize: 12, fontWeight: 600, marginRight: 6 }}>Admin</span>
            Noticeboard
          </Link>
        </div>

        <button
          className="admin-nav-toggle"
          aria-label="Toggle navigation"
          aria-expanded={mobileOpen}
          aria-controls="admin-primary-nav"
          onClick={() => setMobileOpen((v) => !v)}
        >
          ☰
        </button>

        <nav
          id="admin-primary-nav"
          className={`nav admin-nav${mobileOpen ? " open" : ""}`}
          aria-label="Admin navigation"
        >
          {ADMIN_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={isActive(link.href, link.exact) ? "nav-active" : undefined}
              aria-current={isActive(link.href, link.exact) ? "page" : undefined}
            >
              {link.label}
            </Link>
          ))}
          {isOwner && (
            <Link
              href="/admin/users"
              className={isActive("/admin/users", false) ? "nav-active" : undefined}
              aria-current={isActive("/admin/users", false) ? "page" : undefined}
            >
              Users
            </Link>
          )}
          <Link href="/" target="_blank" rel="noreferrer" style={{ opacity: 0.7 }}>Public ↗</Link>
          <button className="btn secondary" onClick={logout} style={{ marginLeft: 4 }}>
            Logout
          </button>
        </nav>
      </div>
    </header>
  );
}
