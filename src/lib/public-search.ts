import { listDepartmentStats, type DepartmentStats } from "./departments";
import { listFiles, type FileRecord } from "./files";
import { listPublishedNotices } from "./notices";
import { matchesPublicSearch, normalizePublicSearchQuery } from "./public-search-match";

export type PublicSearchResults = {
  query: string;
  notices: Awaited<ReturnType<typeof listPublishedNotices>>;
  departments: DepartmentStats[];
  files: FileRecord[];
};

export async function searchPublicNoticeboard(
  queryInput: string | undefined,
): Promise<PublicSearchResults> {
  const query = normalizePublicSearchQuery(queryInput);

  if (!query) {
    return { query: "", notices: [], departments: [], files: [] };
  }

  const [notices, departments, filesResult] = await Promise.all([
    listPublishedNotices(query, 12),
    listDepartmentStats(),
    listFiles({
      search: query,
      page: 1,
      pageSize: 12,
      origin: "LEGACY_IMPORT",
      state: "ACTIVE",
    }),
  ]);

  return {
    query,
    notices,
    departments: departments
      .filter((department) =>
        matchesPublicSearch(
          [department.shortName, department.name, department.description],
          query,
        ),
      )
      .slice(0, 8),
    files: filesResult.files,
  };
}
