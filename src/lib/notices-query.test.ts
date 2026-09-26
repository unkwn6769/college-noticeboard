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

function placeholders(text: string): number[] {
  return [...text.matchAll(/\$(\d+)/g)].map((match) => Number(match[1]));
}

describe("listPublishedNotices query binding", () => {
  afterEach(() => {
    captured.length = 0;
  });

  it("binds every referenced parameter exactly once", async () => {
    const { listPublishedNotices } = await import("./notices");
    captured.length = 0;
    await listPublishedNotices("exam", 5, { department: "cse-noticeboard" });

    expect(captured).toHaveLength(1);
    const referenced = [...new Set(placeholders(captured[0].text))].sort((a, b) => a - b);
    expect(captured[0].values).toHaveLength(referenced.length);
    expect(referenced).toEqual([1, 2, 3, 4]);
  });

  it("escapes LIKE metacharacters so a wildcard search matches nothing", async () => {
    const { listPublishedNotices } = await import("./notices");
    captured.length = 0;
    await listPublishedNotices("%%");

    const statement = captured[0];
    expect(statement.text).toContain(String.raw`ESCAPE '\'`);
    expect(statement.values[3]).toBe("%" + String.raw`\%\%` + "%");
  });
});
