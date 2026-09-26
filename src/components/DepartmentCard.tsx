import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import type { DepartmentStats } from "@/src/lib/departments";
import { formatDate } from "@/src/lib/format";

type Props = {
  department: DepartmentStats;
  /** `/departments` for the noticeboard view, `/archive` for the archive view. */
  hrefBase?: string;
};

/**
 * A department as a first-class entity: identity, purpose and how much
 * material it holds. Departments with no migrated resources stay visible and
 * say so, rather than disappearing from the directory.
 */
export default function DepartmentCard({ department, hrefBase = "/departments" }: Props) {
  const hasArchive = department.resourceCount > 0;

  return (
    <Link
      className="department-card"
      href={`${hrefBase}/${department.slug}`}
      aria-label={`${department.name} — ${department.resourceCount.toLocaleString("en-IN")} archived resources`}
    >
      <span className="department-card-top">
        <span className="department-code">{department.shortName}</span>
        <ArrowUpRight aria-hidden="true" width={16} height={16} className="subtle" />
      </span>

      <span className="department-card-title">{department.name}</span>
      <p className="department-card-description">{department.description}</p>

      <span className="department-card-foot">
        <span>{department.resourceCount.toLocaleString("en-IN")} resources</span>
        <span>{hasArchive ? formatDate(department.latestUpdate) : "No archive yet"}</span>
      </span>
    </Link>
  );
}
