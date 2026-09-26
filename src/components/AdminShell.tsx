"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Command,
  ExternalLink,
  LogOut,
  Menu,
  Search,
} from "lucide-react";
import CommandPalette, { useCommandPaletteShortcuts } from "@/src/components/CommandPalette";
import Drawer from "@/src/components/Drawer";
import ThemeToggle from "@/src/components/ThemeToggle";
import { useToast } from "@/src/components/Toast";
import {
  ADMIN_NAV,
  ADMIN_NAV_GROUPS,
  adminNavItemFor,
  isAdminNavActive,
} from "@/src/lib/admin-nav";

type SessionUser = {
  email: string;
  displayName: string;
  role: string;
} | null;

function initialsOf(displayName: string): string {
  const parts = displayName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2);
  return `${parts[0][0]}${parts[parts.length - 1][0]}`;
}

function NavList({
  pathname,
  isOwner,
  onNavigate,
}: {
  pathname: string;
  isOwner: boolean;
  onNavigate?: () => void;
}) {
  return (
    <nav className="app-sidebar-nav" aria-label="Admin sections">
      {ADMIN_NAV_GROUPS.map((group) => {
        const items = ADMIN_NAV.filter(
          (item) => item.group === group && (!item.ownerOnly || isOwner),
        );
        if (items.length === 0) return null;
        return (
          <div key={group}>
            <p className="nav-group-label">{group}</p>
            <div className="nav-group">
              {items.map((item) => {
                const Icon = item.icon;
                const active = isAdminNavActive(pathname, item);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className="nav-item"
                    aria-current={active ? "page" : undefined}
                    onClick={onNavigate}
                  >
                    <Icon aria-hidden="true" />
                    <span className="nav-item-label">{item.label}</span>
                  </Link>
                );
              })}
            </div>
          </div>
        );
      })}
    </nav>
  );
}

function SidebarBody({
  pathname,
  user,
  isOwner,
  onNavigate,
  onLogout,
}: {
  pathname: string;
  user: SessionUser;
  isOwner: boolean;
  onNavigate?: () => void;
  onLogout: () => void;
}) {
  return (
    <>
      <Link className="app-sidebar-brand" href="/admin" onClick={onNavigate}>
        <span className="brand-mark" aria-hidden="true">
          CN
        </span>
        <span className="brand-text">
          <span className="brand-name">Noticeboard</span>
          <span className="brand-sub">Admin workspace</span>
        </span>
      </Link>

      <NavList pathname={pathname} isOwner={isOwner} onNavigate={onNavigate} />

      <div className="app-sidebar-foot">
        {user ? (
          <div className="app-user">
            <span className="app-avatar" aria-hidden="true">
              {initialsOf(user.displayName)}
            </span>
            <span className="app-user-text">
              <span className="app-user-name">{user.displayName}</span>
              <span className="app-user-role">{user.role}</span>
            </span>
          </div>
        ) : null}
        <Link className="nav-item" href="/" target="_blank" rel="noreferrer" onClick={onNavigate}>
          <ExternalLink aria-hidden="true" />
          <span className="nav-item-label">View public site</span>
        </Link>
        <button
          type="button"
          className="nav-item nav-item-button"
          onClick={onLogout}
        >
          <LogOut aria-hidden="true" />
          <span className="nav-item-label">Sign out</span>
        </button>
      </div>
    </>
  );
}

/**
 * The authenticated application shell.
 *
 * Desktop: a persistent grouped sidebar with a compact contextual top bar.
 * Below 1024px the sidebar becomes a drawer, and the top bar keeps the
 * current location, the command palette entry, the theme control and sign-out
 * reachable without horizontal scrolling.
 */
export default function AdminShell({
  user,
  children,
}: {
  user: SessionUser;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { toast } = useToast();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [isOwner, setIsOwner] = useState(user?.role === "OWNER");

  useEffect(() => {
    setDrawerOpen(false);
  }, [pathname]);

  useEffect(() => {
    setIsOwner(user?.role === "OWNER");
  }, [user?.role]);

  const logout = useCallback(async () => {
    try {
      const response = await fetch("/api/auth/logout", { method: "POST" });
      if (!response.ok) {
        toast({ tone: "danger", title: "Sign-out failed", text: "Please try again." });
        return;
      }
      router.push("/login");
      router.refresh();
    } catch {
      toast({ tone: "danger", title: "Could not reach the server", text: "Nothing was changed." });
    }
  }, [router, toast]);

  const commands = useMemo(
    () => [
      ...ADMIN_NAV.filter((item) => !item.ownerOnly || isOwner).map((item) => ({
        id: item.href,
        label: item.label,
        group: "Navigate",
        hint: item.group,
        keywords: `${item.label} ${item.description}`,
        run: () => router.push(item.href),
      })),
      {
        id: "new-notice",
        label: "Create a new notice",
        group: "Create",
        keywords: "draft publish write announcement",
        run: () => router.push("/admin/notices/new"),
      },
      {
        id: "upload-file",
        label: "Upload a file",
        group: "Create",
        keywords: "attach upload storage",
        run: () => router.push("/admin/files"),
      },
      {
        id: "public-search",
        label: "Open the public noticeboard",
        group: "Create",
        keywords: "find notice visitor public site",
        run: () => window.open("/search", "_blank", "noreferrer"),
      },
    ],
    [router, isOwner],
  );

  useCommandPaletteShortcuts(setPaletteOpen, !drawerOpen);

  const current = adminNavItemFor(pathname);

  return (
    <div className="app-shell">
      <aside className="app-sidebar no-print">
        <SidebarBody
          pathname={pathname}
          user={user}
          isOwner={isOwner}
          onLogout={() => void logout()}
        />
      </aside>

      <div className="app-main">
        <header className="app-topbar no-print">
          <button
            type="button"
            className="btn btn-ghost btn-icon app-mobile-menu"
            aria-expanded={drawerOpen}
            aria-controls="admin-drawer"
            onClick={() => setDrawerOpen((open) => !open)}
          >
            <Menu aria-hidden="true" />
            <span className="sr-only">Open admin menu</span>
          </button>

          <div className="app-topbar-title">
            <p className="app-topbar-heading">{current?.label ?? "Admin"}</p>
            <p className="app-topbar-sub">
              {current?.description ?? "College noticeboard operations"}
            </p>
          </div>

          <div className="app-topbar-actions">
            <button
              type="button"
              className="site-header-search"
              onClick={() => setPaletteOpen(true)}
            >
              <Command aria-hidden="true" />
              <span>Commands</span>
              <span className="kbd" aria-hidden="true">
                ⌘K
              </span>
            </button>
            <ThemeToggle />
            <Link className="btn btn-ghost btn-icon" href="/" target="_blank" rel="noreferrer">
              <Search aria-hidden="true" />
              <span className="sr-only">Open the public noticeboard</span>
            </Link>
          </div>
        </header>

        <main className="app-content" id="main-content">
          {children}
        </main>
      </div>

      <Drawer
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        title="Admin menu"
        side="left"
        id="admin-drawer"
        header={
          <span className="brand-text">
            <span className="brand-name">Admin workspace</span>
            <span className="brand-sub">{user?.role ?? "Staff"}</span>
          </span>
        }
      >
        <div className="app-sidebar app-sidebar-mobile">
          <SidebarBody
            pathname={pathname}
            user={user}
            isOwner={isOwner}
            onNavigate={() => setDrawerOpen(false)}
            onLogout={() => void logout()}
          />
        </div>
      </Drawer>

      <CommandPalette
        open={paletteOpen}
        onOpenChange={setPaletteOpen}
        commands={commands}
        placeholder="Jump to a section or run an action…"
      />
    </div>
  );
}
