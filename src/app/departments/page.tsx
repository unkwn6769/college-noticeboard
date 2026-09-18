import PublicNav from "@/src/components/PublicNav";
import PublicFooter from "@/src/components/PublicFooter";
import DepartmentCard from "@/src/components/DepartmentCard";
import SectionHeader from "@/src/components/SectionHeader";
import { listDepartmentStats } from "@/src/lib/departments";

export const dynamic = "force-dynamic";

export default async function DepartmentsPage() {
  const departments = await listDepartmentStats();
  const totalResources = departments.reduce((sum, department) => sum + department.resourceCount, 0);

  return (
    <>
      <PublicNav />
      <main className="container page public-page">
        <section className="public-page-heading">
          <p className="public-eyebrow">Departments</p>
          <h1>Find your department</h1>
          <p className="lead">Browse the college archive by department, including examination and general notices.</p>
        </section>

        <section className="public-stats compact-stats" aria-label="Department archive statistics">
          <div className="public-stat card-soft"><span className="stat-label">Departments</span><span className="stat-value">{departments.length}</span></div>
          <div className="public-stat card-soft"><span className="stat-label">Archive resources</span><span className="stat-value">{totalResources.toLocaleString("en-IN")}</span></div>
        </section>

        <section className="public-section-block">
          <SectionHeader eyebrow="Directory" title="All departments" description="Every department remains visible, including departments with no migrated resources." />
          <div className="public-department-grid">
            {departments.map((department) => <DepartmentCard key={department.slug} department={department} />)}
          </div>
        </section>
      </main>
      <PublicFooter />
    </>
  );
}
