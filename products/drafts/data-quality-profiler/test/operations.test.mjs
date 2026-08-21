import test from "node:test";
import assert from "node:assert/strict";
import {
  duplicateAudit,
  qualityGate,
  schemaDrift,
  dataContractCheck,
} from "../src/dataset/operations.mjs";

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

test("schemaDrift reports added, removed, type, and nullable changes deterministically", () => {
  const result = schemaDrift({
    baseline: {
      format: "json",
      records: [{ id: 1, amount: 10, note: "ok" }, { id: 2, amount: 20, note: "ok" }],
    },
    current: {
      format: "json",
      records: [{ id: "1", extra: true, note: null }, { id: "2", extra: false, note: "ok" }],
    },
  });
  assert.equal(result.schema_version, "1.0");
  assert.deepEqual(result.added_fields, ["extra"]);
  assert.deepEqual(result.removed_fields, ["amount"]);
  assert.deepEqual(result.type_changes, [{ field: "id", baseline_type: "integer", current_type: "string" }]);
  assert.deepEqual(result.nullable_changes, [{ field: "note", baseline_nullable: false, current_nullable: true }]);
  assert.equal(result.breaking_change, true);
  assert.match(result.baseline_fingerprint, /^sha256:[a-f0-9]{64}$/);
  assert.match(result.current_fingerprint, /^sha256:[a-f0-9]{64}$/);
});

test("schemaDrift treats additive-only schema change as non-breaking", () => {
  const result = schemaDrift({
    baseline: { format: "json", records: [{ id: 1 }] },
    current: { format: "json", records: [{ id: 1, name: "A" }] },
  });
  assert.deepEqual(result.added_fields, ["name"]);
  assert.deepEqual(result.removed_fields, []);
  assert.deepEqual(result.type_changes, []);
  assert.equal(result.breaking_change, false);
});

test("schemaDrift rejects malformed body", () => {
  assert.throws(
    () => schemaDrift({ baseline: { format: "json", records: [] } }),
    /INVALID_DATASET/
  );
});

test("dataContractCheck enforces required fields, types, and extra-field policy", () => {
  const result = dataContractCheck({
    dataset: {
      format: "json",
      records: [{ id: 1, email: "a@example.com", extra: 1 }],
    },
    contract: {
      required_fields: ["id", "email"],
      field_types: { id: "integer", email: "string" },
      allow_extra_fields: false,
    },
  });
  assert.equal(result.schema_version, "1.0");
  assert.equal(result.compatible, false);
  assert.deepEqual(result.missing_required_fields, []);
  assert.deepEqual(result.extra_fields, ["extra"]);
  assert.deepEqual(result.type_mismatches, []);
  assert.ok(result.reasons.includes("EXTRA_FIELDS_NOT_ALLOWED"));
});

test("dataContractCheck reports missing fields and type mismatches", () => {
  const result = dataContractCheck({
    dataset: { format: "json", records: [{ id: "1" }] },
    contract: {
      required_fields: ["id", "email"],
      field_types: { id: "integer", email: "string" },
    },
  });
  assert.equal(result.compatible, false);
  assert.deepEqual(result.missing_required_fields, ["email"]);
  assert.deepEqual(result.type_mismatches, [{ field: "id", expected_type: "integer", observed_type: "string" }]);
});

test("dataContractCheck rejects malformed contracts", () => {
  assert.throws(
    () => dataContractCheck({ dataset: { format: "json", records: [] }, contract: { required_fields: [""] } }),
    /INVALID_DATASET/
  );
  assert.throws(
    () => dataContractCheck({ dataset: { format: "json", records: [] }, contract: { required_fields: ["id", "id"] } }),
    /INVALID_DATASET/
  );
  assert.throws(
    () => dataContractCheck({ dataset: { format: "json", records: [] }, contract: { field_types: { id: "nonsense" } } }),
    /INVALID_DATASET/
  );
  assert.throws(
    () => dataContractCheck({ dataset: { format: "json", records: [] }, contract: { allow_extra_fields: "yes" } }),
    /INVALID_DATASET/
  );
});
