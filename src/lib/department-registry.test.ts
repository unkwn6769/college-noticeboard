import { describe, expect, it } from "vitest";
import { DEPARTMENTS, getDepartment } from "./department-registry";

describe("department registry", () => {
  it("contains all 15 public departments", () => {
    expect(DEPARTMENTS).toHaveLength(15);
    expect(new Set(DEPARTMENTS.map((department) => department.slug)).size).toBe(15);
  });

  it("keeps CSIT visible even without resources", () => {
    expect(getDepartment("csit-noticeboard")?.shortName).toBe("CSIT");
  });
});
