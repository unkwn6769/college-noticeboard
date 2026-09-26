import { afterEach, describe, expect, it, vi } from "vitest";

type Captured = { text: string; values: unknown[] };

const captured: Captured[] = [];

vi.mock("@/src/lib/db/pool", () => ({
  getDbPool: () => ({
    query: (text: string, values: unknown[]) => {
      captured.push({ text, values });
      return Promise.resolve({ rows: [], rowCount: 0 });
    },
  }),
  withTransaction: async () => undefined,
}));

/** Every `$n` placeholder that appears in a statement. */
function placeholders(text: string): number[] {
  return [...text.matchAll(/\$(\d+)/g)].map((match) => Number(match[1]));
}

describe("listFiles query binding", () => {
  afterEach(() => {
    captured.length = 0;
  });

  it("binds exactly as many parameters as each statement references", async () => {
    const { listFiles } = await import("./files");
    captured.length = 0;
    await listFiles({ search: "notice", page: 2, pageSize: 10 });

    expect(captured).toHaveLength(2);
    for (const statement of captured) {
      const referenced = new Set(placeholders(statement.text));
      expect(statement.values).toHaveLength(referenced.size);
      expect([...referenced].sort((a, b) => a - b)).toEqual(
        statement.values.map((_, index) => index + 1),
      );
    }
  });

  it("escapes LIKE metacharacters typed into the search box", async () => {
    const { listFiles } = await import("./files");
    captured.length = 0;
    await listFiles({ search: "100%_x" });

    expect(captured).toHaveLength(2);
    for (const statement of captured) {
      expect(statement.text).toContain(String.raw`ESCAPE '\'`);
      expect(statement.values.at(-1)).toBe("%" + String.raw`100\%\_x` + "%");
    }
  });

  it("keeps an empty search on the unfiltered path", async () => {
    const { listFiles } = await import("./files");
    captured.length = 0;
    await listFiles({});
    for (const statement of captured) {
      expect(statement.values.at(-1)).toBe("%%");
    }
  });
});
