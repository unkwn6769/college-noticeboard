import {
  Activity,
  Archive,
  FileStack,
  HardDrive,
  LayoutDashboard,
  Megaphone,
  ScanLine,
  ShieldCheck,
  Users,
} from "lucide-react";

export type AdminNavItem = {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  exact?: boolean;
  /** Grouping gives the sidebar structure instead of one long list. */
  group: "Overview" | "Content" | "Operations" | "Governance";
  ownerOnly?: boolean;
  description: string;
};

export const ADMIN_NAV: AdminNavItem[] = [
  {
    href: "/admin",
    label: "Dashboard",
    icon: LayoutDashboard,
    exact: true,
    group: "Overview",
    description: "Operational overview",
  },
  {
    href: "/admin/notices",
    label: "Notices",
    icon: Megaphone,
    group: "Content",
    description: "Create, edit and publish notices",
  },
  {
    href: "/admin/files",
    label: "Files",
    icon: FileStack,
    group: "Content",
    description: "Upload, replace and quarantine files",
  },
  {
    href: "/admin/audit",
    label: "Audit log",
    icon: Activity,
    group: "Governance",
    description: "Every recorded system event",
  },
  {
    href: "/admin/recycle-bin",
    label: "Recycle bin",
    icon: Archive,
    group: "Governance",
    description: "Restore or permanently purge deleted items",
  },
  {
    href: "/admin/storage",
    label: "Storage",
    icon: HardDrive,
    group: "Operations",
    description: "Disk and database storage analytics",
  },
  {
    href: "/admin/integrity",
    label: "Integrity",
    icon: ShieldCheck,
    group: "Operations",
    description: "Storage and database consistency checks",
  },
  {
    href: "/admin/scanner",
    label: "Scanner",
    icon: ScanLine,
    group: "Operations",
    description: "Legacy archive preview and import",
  },
  {
    href: "/admin/users",
    label: "Users",
    icon: Users,
    group: "Governance",
    ownerOnly: true,
    description: "Owner-only account administration",
  },
];

export const ADMIN_NAV_GROUPS = [
  "Overview",
  "Content",
  "Operations",
  "Governance",
] as const;

/** The label shown in the top bar for a given route. */
export function adminNavItemFor(pathname: string): AdminNavItem | null {
  for (const item of ADMIN_NAV) {
    if (item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(`${item.href}/`)) {
      return item;
    }
  }
  return null;
}

export function isAdminNavActive(pathname: string, item: AdminNavItem): boolean {
  return item.exact
    ? pathname === item.href
    : pathname === item.href || pathname.startsWith(`${item.href}/`);
}
