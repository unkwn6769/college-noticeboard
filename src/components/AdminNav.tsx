"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export default function AdminNav() {
  const router = useRouter();
  const [isOwner, setIsOwner] = useState(false);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((data) => setIsOwner(data.user?.role === "OWNER"))
      .catch(() => setIsOwner(false));
  }, []);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <header className="topbar">
      <div className="container topbar-inner">
        <a className="brand" href="/admin">Admin</a>
        <nav className="nav">
          <a href="/admin/notices">Notices</a>
          <a href="/admin/files">Files</a>
          {isOwner && <a href="/admin/users">Users</a>}
          <a href="/admin/audit">Audit</a>
          <a href="/admin/storage">Storage</a>
          <button className="btn secondary" onClick={logout}>Logout</button>
        </nav>
      </div>
    </header>
  );
}
