"use client";
import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";

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

  function isActive(href: string) {
    return pathname === href || pathname.startsWith(href + "/");
  }

  return (
    <header className="topbar">
      <div className="container topbar-inner">
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <a className="brand" href="/admin">
            <span style={{ opacity: 0.6, fontSize: 12, fontWeight: 600, marginRight: 6 }}>Admin</span>
            Noticeboard
          </a>
        </div>

        <button
          className="admin-nav-toggle"
          aria-label="Toggle navigation"
          onClick={() => setMobileOpen((v) => !v)}
        >
          ☰
        </button>

        <nav className={`nav admin-nav${mobileOpen ? " open" : ""}`} aria-label="Admin navigation">
          <a href="/admin" className={isActive("/admin") && pathname === "/admin" ? "nav-active" : ""}>Dashboard</a>
          <a href="/admin/notices" className={isActive("/admin/notices") ? "nav-active" : ""}>Notices</a>
          <a href="/admin/files" className={isActive("/admin/files") ? "nav-active" : ""}>Files</a>
          <a href="/admin/recycle-bin" className={isActive("/admin/recycle-bin") ? "nav-active" : ""}>Recycle Bin</a>
          <a href="/admin/audit" className={isActive("/admin/audit") ? "nav-active" : ""}>Audit</a>
          <a href="/admin/storage" className={isActive("/admin/storage") ? "nav-active" : ""}>Storage</a>
          <a href="/admin/integrity" className={isActive("/admin/integrity") ? "nav-active" : ""}>Integrity</a>
          <a href="/admin/scanner" className={isActive("/admin/scanner") ? "nav-active" : ""}>Scanner</a>
          {isOwner && (
            <a href="/admin/users" className={isActive("/admin/users") ? "nav-active" : ""}>Users</a>
          )}
          <a href="/" target="_blank" rel="noreferrer" style={{ opacity: 0.7 }}>Public ↗</a>
          <button className="btn secondary" onClick={logout} style={{ marginLeft: 4 }}>
            Logout
          </button>
        </nav>
      </div>
    </header>
  );
}
