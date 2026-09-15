import assert from "node:assert/strict";
import test from "node:test";
import { isActiveMigrationStatus } from "./migrationState.js";

test("cancelled migrations are not treated as active", () => {
  assert.equal(isActiveMigrationStatus("cancelled"), false);
  assert.equal(isActiveMigrationStatus("completed"), false);
  assert.equal(isActiveMigrationStatus("failed"), false);
});

test("pending and running migrations remain active", () => {
  assert.equal(isActiveMigrationStatus("pending"), true);
  assert.equal(isActiveMigrationStatus("running"), true);
  assert.equal(isActiveMigrationStatus("waiting_for_storage"), true);
});
