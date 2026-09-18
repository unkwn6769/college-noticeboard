import Link from "next/link";
import type { DepartmentStats } from "@/src/lib/departments";

export default function DepartmentCard({ department }: { department: DepartmentStats }) {
  return (
    <Link className="public-department-card" href={`/departments/${department.slug}`}>
      <div className="public-department-card-top">
        <span className="public-department-code">{department.shortName}</span>
        <span className="public-department-arrow" aria-hidden="true">↗</span>
      </div>
      <h3>{department.name}</h3>
      <p className="muted">{department.description}</p>
      <div className="public-department-card-bottom">
        <span>{department.resourceCount.toLocaleString("en-IN")} resources</span>
        <span>{department.resourceCount === 0 ? "No archive yet" : "Archive available"}</span>
      </div>
    </Link>
  );
}
