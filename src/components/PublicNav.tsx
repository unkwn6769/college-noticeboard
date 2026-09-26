"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Building2, Files, Home, LogIn, Megaphone, Menu, Search } from "lucide-react";
import Drawer from "@/src/components/Drawer";
import ThemeToggle from "@/src/components/ThemeToggle";
import { isPublicNavActive, PUBLIC_NAV, type PublicNavItem } from "@/src/lib/public-nav";

const NAV_ICONS: Record<PublicNavItem["icon"], typeof Home> = {
  home: Home,
  megaphone: Megaphone,
  building: Building2,
  files: Files,
  search: Search,
};

const BRAND = (
  <>
    <span className="brand-mark" aria-hidden="true">
      CN
    </span>
    <span className="brand-text">
      <span className="brand-name">College Noticeboard</span>
      <span className="brand-sub">Official announcements</span>
    </span>
  </>
);

/**
 * Institutional public header.
 *
 * Desktop: persistent horizontal navigation with a live search entry.
 * Mobile: the same destinations move into a right-hand drawer so nothing is
 * squeezed or clipped; the header keeps the brand, search and theme control
 * reachable at every width. The drawer is the shared `Drawer` component, so
 * opening the menu traps Tab, closes on Escape and returns focus to the
 * toggle.
 */
export default function PublicNav() {
  const pathname = usePathname();
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    setDrawerOpen(false);
  }, [pathname]);

  return (
    <>
      <header className="site-header no-print">
        <div className="container site-header-inner">
          <Link className="brand" href="/">
            {BRAND}
          </Link>

          <nav className="site-nav site-nav-desktop" aria-label="Primary">
            {PUBLIC_NAV.map((item) => {
              const active = isPublicNavActive(pathname, item);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className="site-nav-link"
                  aria-current={active ? "page" : undefined}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <div className="site-header-actions">
            <Link className="site-header-search" href="/search">
              <Search aria-hidden="true" />
              <span>Search</span>
              <span className="kbd" aria-hidden="true">
                /
              </span>
            </Link>
            <ThemeToggle />
            <button
              type="button"
              className="btn btn-ghost btn-icon header-toggle"
              aria-expanded={drawerOpen}
              aria-controls="public-drawer"
              onClick={() => setDrawerOpen((open) => !open)}
            >
              <Menu aria-hidden="true" />
              <span className="sr-only">Open main menu</span>
            </button>
          </div>
        </div>
      </header>

      <Drawer
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        title="Main menu"
        id="public-drawer"
        header={<span className="brand">{BRAND}</span>}
      >
        <div className="drawer-body">
          <nav aria-label="Primary">
            <p className="drawer-section-label">Browse</p>
            <div className="drawer-nav">
              {PUBLIC_NAV.map((item) => {
                const active = isPublicNavActive(pathname, item);
                const Icon = NAV_ICONS[item.icon];
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className="drawer-nav-link"
                    aria-current={active ? "page" : undefined}
                  >
                    <Icon aria-hidden="true" />
                    {item.label}
                  </Link>
                );
              })}
            </div>
          </nav>

          <nav aria-label="Shortcuts">
            <p className="drawer-section-label">Quick access</p>
            <div className="drawer-nav">
              <Link className="drawer-nav-link" href="/search?q=notice">
                <Search aria-hidden="true" />
                Search notices
              </Link>
              <Link className="drawer-nav-link" href="/departments/exams-noticeboard">
                <Megaphone aria-hidden="true" />
                Examination notices
              </Link>
              <Link className="drawer-nav-link" href="/archive">
                <Files aria-hidden="true" />
                Browse the archive
              </Link>
              <Link className="drawer-nav-link" href="/departments">
                <Building2 aria-hidden="true" />
                All departments
              </Link>
              <Link className="drawer-nav-link" href="/login">
                <LogIn aria-hidden="true" />
                Staff sign-in
              </Link>
            </div>
          </nav>
        </div>
      </Drawer>
    </>
  );
}
