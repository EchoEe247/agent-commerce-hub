import test from "node:test";
import assert from "node:assert/strict";
import { profileDataset } from "../src/dataset/profile.mjs";

test("profiles dataset with duplicates, missing values, mixed types, constants, and identifiers", () => {
  const records = [
    { customer_id: 1, age: 10, code: "A", active: true, note: "x" },
    { customer_id: 2, age: 20, code: "A", active: true, note: "x" },
    { customer_id: 1, age: 10, code: "A", active: true, note: "x" },
    { customer_id: null, age: null, code: "A", active: true, note: "x" },
    { customer_id: 4, age: null, code: "B", active: false, note: "x" },
  ];
  const normalized = { records, fieldNames: ["customer_id", "age", "code", "active", "note"] };
  const profile = profileDataset(normalized);

  assert.equal(profile.record_count, 5);
  assert.equal(profile.field_count, 5);
  assert.equal(profile.duplicate_rows, 1);

  const warningCodes = profile.warnings.map((w) => w.code);
  assert.ok(warningCodes.includes("DUPLICATE_ROWS"));
  assert.ok(warningCodes.includes("MISSING_VALUES"));
  assert.ok(warningCodes.includes("CONSTANT_FIELD"));
  assert.ok(warningCodes.includes("IDENTIFIER_INTEGRITY"));
});

test("canonicalizes duplicate rows despite key order", () => {
  const records = [
    { a: 1, b: 2 },
    { b: 2, a: 1 },
  ];
  const profile = profileDataset({ records, fieldNames: ["a", "b"] });
  assert.equal(profile.duplicate_rows, 1);
});
