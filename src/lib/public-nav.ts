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
 *
 * A `fragmentOnly` item is a shortcut to a section of another page, not a page
 * in its own right, so it is never reported active. Marking `/#notices` as the
 * current page on `/` would put two `aria-current="page"` elements in the same
 * `nav` and would claim the visitor is on a "Notices page" when they are on the
 * home page.
 */
export function isPublicNavActive(pathname: string, item: PublicNavItem): boolean {
  if (item.fragmentOnly) return false;
  const target = item.href.split("#")[0] || "/";
  if (target === "/") return pathname === "/";
  return pathname === target || pathname.startsWith(`${target}/`);
}
