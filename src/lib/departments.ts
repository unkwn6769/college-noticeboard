import { getDbPool } from "@/src/lib/db/pool";
import { DEPARTMENTS, getDepartment, type Department } from "./department-registry";

export type { Department };
export { DEPARTMENTS, getDepartment };

export type DepartmentStats = Department & {
  resourceCount: number;
  latestUpdate: string | null;
};

export async function listDepartmentStats(): Promise<DepartmentStats[]> {
  const result = await getDbPool().query<{ legacy_department: string; resource_count: number; latest_update: string | null }>(
    `SELECT
       legacy_department,
       COUNT(*)::int AS resource_count,
       MAX(created_at) AS latest_update
     FROM files
     WHERE state='ACTIVE'
       AND origin_type='LEGACY_IMPORT'
       AND legacy_department IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM legacy_scanner_items s WHERE s.legacy_relative_path=files.legacy_relative_path AND s.status='IMPORTED' AND s.file_id IS NOT NULL AND s.file_id<>files.id)
     GROUP BY legacy_department`,
  );

  const stats = new Map(result.rows.map((row) => [row.legacy_department, row]));

  return DEPARTMENTS.map((department) => {
    const row = stats.get(department.slug);
    return {
      ...department,
      resourceCount: row?.resource_count ?? 0,
      latestUpdate: row?.latest_update ?? null,
    };
  });
}
