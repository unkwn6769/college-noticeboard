import { describe, expect, it } from "vitest";
import { publicErrorMessage } from "./http";

describe("publicErrorMessage", () => {
  it("translates internal domain codes into readable text", () => {
    expect(publicErrorMessage(new Error("NOTICE_NOT_FOUND_OR_PUBLISHED"), "Operation failed"))
      .toBe("This notice is already published, or it no longer exists.");
    expect(publicErrorMessage(new Error("NOTICE_NOT_FOUND"), "Operation failed"))
      .toBe("Notice not found.");
    expect(publicErrorMessage(new Error("INVALID_DEPARTMENT"), "Create failed"))
      .toBe("Unknown department.");
  });

  it("translates PostgreSQL error codes by property", () => {
    const duplicate = Object.assign(new Error("duplicate key value"), { code: "23505" });
    expect(publicErrorMessage(duplicate, "User creation failed")).toBe("User creation failed");
  });

  it("keeps human validation messages", () => {
    expect(publicErrorMessage(new Error("Title and body are required"), "Create failed"))
      .toBe("Title and body are required");
    expect(publicErrorMessage(new Error("Password must contain at least 10 characters"), "User creation failed"))
      .toBe("Password must contain at least 10 characters");
  });

  it("never leaks raw database or system errors", () => {
    const raw = new Error(
      'duplicate key value violates unique constraint "users_email_key"',
    );
    expect(publicErrorMessage(raw, "User creation failed")).toBe("User creation failed");

    const enumError = new Error('invalid input value for enum user_role: "SUPERUSER"');
    expect(publicErrorMessage(enumError, "User creation failed")).toBe("User creation failed");

    expect(publicErrorMessage(new Error("connect ECONNREFUSED 127.0.0.1:5432"), "Request failed"))
      .toBe("Request failed");
    expect(publicErrorMessage("boom", "Request failed")).toBe("Request failed");
    expect(publicErrorMessage(undefined, "Request failed")).toBe("Request failed");
  });
});
