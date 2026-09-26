import { describe, expect, it } from "vitest";
import { escapeLikePattern, LIKE_ESCAPE_CLAUSE } from "./sql-escape";

describe("escapeLikePattern", () => {
  it("leaves ordinary text untouched", () => {
    expect(escapeLikePattern("mid sem marks")).toBe("mid sem marks");
    expect(escapeLikePattern("")).toBe("");
  });

  it("escapes the percent wildcard so it cannot match everything", () => {
    expect(escapeLikePattern("%")).toBe("\\%");
    expect(escapeLikePattern("%%")).toBe("\\%\\%");
    expect(escapeLikePattern("100% attendance")).toBe("100\\% attendance");
  });

  it("escapes the single-character wildcard", () => {
    expect(escapeLikePattern("a_b")).toBe("a\\_b");
  });

  it("escapes the escape character itself before the other metacharacters", () => {
    expect(escapeLikePattern("a\\b")).toBe("a\\\\b");
    expect(escapeLikePattern("\\%")).toBe("\\\\\\%");
  });

  it("ships the matching ESCAPE clause", () => {
    expect(LIKE_ESCAPE_CLAUSE).toBe(String.raw`ESCAPE '\'`);
  });
});
