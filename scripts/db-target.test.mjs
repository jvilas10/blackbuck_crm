import assert from "node:assert/strict";
import { test } from "node:test";
import { resolveDatabaseTarget } from "./db-target.mjs";

test("database bootstrap uses distinct development and staging namespaces", () => {
  assert.equal(resolveDatabaseTarget({
    CRM_ENV: "development", MONGODB_URI: "mongodb://localhost:27017/custom",
  }).dbName, "blackbuck_crm_dev");
  assert.equal(resolveDatabaseTarget({
    CRM_ENV: "staging", MONGODB_URI: "mongodb+srv://example.invalid/custom",
  }).dbName, "blackbuck_crm_staging");
});

test("database bootstrap refuses unsupported environments and local staging URIs", () => {
  assert.throws(() => resolveDatabaseTarget({
    CRM_ENV: "production", MONGODB_URI: "mongodb+srv://example.invalid",
  }), /CRM_ENV/);
  assert.throws(() => resolveDatabaseTarget({
    CRM_ENV: "staging", MONGODB_URI: "mongodb://localhost:27017",
  }), /Atlas SRV/);
});
