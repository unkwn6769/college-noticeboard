import { getDepartment } from "./department-registry";

export type NoticeMetadata = {
  department: string | null;
  category: string | null;
  isPinned: boolean;
};

export function normalizeNoticeMetadata(input: {
  department?: unknown;
  category?: unknown;
  isPinned?: unknown;
}): NoticeMetadata {
  const department = typeof input.department === "string" ? input.department.trim() : "";
  const category = typeof input.category === "string" ? input.category.trim() : "";

  if (department && !getDepartment(department)) {
    throw new Error("INVALID_DEPARTMENT");
  }

  return {
    department: department || null,
    category: category ? category.slice(0, 64) : null,
    isPinned: input.isPinned === true,
  };
}
