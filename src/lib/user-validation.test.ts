import { describe, expect, it } from "vitest";
import { isUserRole, isUuid, isValidEmail, MAX_DISPLAY_NAME_LENGTH } from "./user-validation";

describe("isValidEmail", () => {
  it("accepts ordinary addresses", () => {
    expect(isValidEmail("admin@example.com")).toBe(true);
    expect(isValidEmail("first.last+tag@sub.example.co.in")).toBe(true);
  });

  it("rejects malformed addresses", () => {
    for (const value of [
      "",
      "not-an-email",
      "@example.com",
      "user@",
      "user@localhost",
      "user@@example.com",
      "user name@example.com",
      "user..name@example.com",
      "user@.example.com",
      "user@example.",
      "a".repeat(250) + "@example.com",
    ]) {
      expect(isValidEmail(value), value).toBe(false);
    }
  });
});

describe("isUserRole", () => {
  it("only accepts the roles the database defines", () => {
    expect(isUserRole("USER")).toBe(true);
    expect(isUserRole("ADMIN")).toBe(true);
    expect(isUserRole("OWNER")).toBe(true);
    expect(isUserRole("SUPERUSER")).toBe(false);
    expect(isUserRole("owner")).toBe(false);
    expect(isUserRole(undefined)).toBe(false);
    expect(isUserRole(1)).toBe(false);
  });
});

describe("display name boundary", () => {
  it("is exported for the form/API contract", () => {
    expect(MAX_DISPLAY_NAME_LENGTH).toBe(120);
  });
});

describe("isUuid", () => {
  it("accepts canonical UUIDs and rejects malformed identifiers", () => {
    expect(isUuid("3f1b7f6e-0f2a-4a6d-9d0e-1a2b3c4d5e6f")).toBe(true);
    expect(isUuid("not-a-uuid")).toBe(false);
    expect(isUuid("")).toBe(false);
  });
});
