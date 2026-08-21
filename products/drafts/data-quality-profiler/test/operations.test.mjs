import test from "node:test";
import assert from "node:assert/strict";
import { duplicateAudit, qualityGate } from "../src/dataset/operations.mjs";

const duplicateInput = {
  format: "json",
  records: [
    { id: 1, name: "A" },
    { name: "A", id: 1 },
    { id: 2, name: null },
  ],
};

test("duplicateAudit returns deterministic duplicate groups", () => {
  const result = duplicateAudit(duplicateInput);
  assert.equal(result.schema_version, "1.0");
  assert.equal(result.record_count, 3);
  assert.equal(result.unique_row_count, 2);
  assert.equal(result.duplicate_rows, 1);
  assert.equal(result.duplicate_ratio, 1 / 3);
  assert.equal(result.duplicate_groups.length, 1);
  assert.deepEqual(result.duplicate_groups[0].indexes, [0, 1]);
  assert.equal(result.duplicate_groups[0].count, 2);
});

test("duplicateAudit returns no groups for unique rows", () => {
  const result = duplicateAudit({
    format: "json",
    records: [{ id: 1 }, { id: 2 }],
  });
  assert.equal(result.duplicate_rows, 0);
  assert.equal(result.unique_row_count, 2);
  assert.deepEqual(result.duplicate_groups, []);
});

test("qualityGate fails explicit duplicate and missing thresholds", () => {
  const result = qualityGate({
    ...duplicateInput,
    minimum_quality_score: 0,
    max_duplicate_rows: 0,
    max_missing_values: 0,
    allow_mixed_types: true,
  });
  assert.equal(result.schema_version, "1.0");
  assert.equal(result.pass, false);
  assert.equal(result.checks.quality_score.pass, true);
  assert.equal(result.checks.duplicate_rows.pass, false);
  assert.equal(result.checks.missing_values.pass, false);
  assert.equal(result.checks.mixed_types.pass, true);
  assert.ok(result.reasons.includes("DUPLICATE_ROWS_EXCEEDED"));
  assert.ok(result.reasons.includes("MISSING_VALUES_EXCEEDED"));
});

test("qualityGate defaults to strict duplicate/missing/mixed-type policy", () => {
  const result = qualityGate({
    format: "json",
    records: [{ id: 1, value: "1" }, { id: 2, value: 2 }],
  });
  assert.equal(result.thresholds.minimum_quality_score, 80);
  assert.equal(result.thresholds.max_duplicate_rows, 0);
  assert.equal(result.thresholds.max_missing_values, 0);
  assert.equal(result.thresholds.allow_mixed_types, false);
  assert.equal(result.checks.mixed_types.pass, false);
  assert.equal(result.pass, false);
});

test("qualityGate rejects malformed thresholds", () => {
  assert.throws(
    () => qualityGate({ format: "json", records: [], minimum_quality_score: 101 }),
    /INVALID_DATASET/
  );
  assert.throws(
    () => qualityGate({ format: "json", records: [], max_duplicate_rows: -1 }),
    /INVALID_DATASET/
  );
  assert.throws(
    () => qualityGate({ format: "json", records: [], max_missing_values: -1 }),
    /INVALID_DATASET/
  );
  assert.throws(
    () => qualityGate({ format: "json", records: [], allow_mixed_types: "yes" }),
    /INVALID_DATASET/
  );
});
