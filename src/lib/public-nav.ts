/**
 * Public navigation model, shared by the header, the mobile drawer and the
 * command palette so the destinations and their active-state rule are defined
 * exactly once.
 */

export type PublicNavItem = {
  href: string;
  label: string;
  /** Shortcut fragment links only count as active on the home page. */
  fragmentOnly?: boolean;
  icon: "home" | "megaphone" | "building" | "files" | "search";
};

export const PUBLIC_NAV: PublicNavItem[] = [
  { href: "/", label: "Home", icon: "home" },
  { href: "/#notices", label: "Notices", fragmentOnly: true, icon: "megaphone" },
  { href: "/departments", label: "Departments", icon: "building" },
  { href: "/archive", label: "Archive", icon: "files" },
  { href: "/search", label: "Search", icon: "search" },
];

/**
 * `/` matches only itself; every other prefix matches its own route and any
 * route nested below it, so `/departments/cse-noticeboard` keeps the
 * Departments item current.
 */
export function isPublicNavActive(pathname: string, href: string): boolean {
  const target = href.split("#")[0] || "/";
  if (target === "/") return pathname === "/";
  return pathname === target || pathname.startsWith(`${target}/`);
}
