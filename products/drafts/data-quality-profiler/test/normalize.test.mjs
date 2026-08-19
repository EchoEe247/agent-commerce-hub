import test from "node:test";
import assert from "node:assert/strict";
import { normalizeDataset } from "../src/dataset/normalize.mjs";

test("normalizes JSON records with sorted field union", () => {
  const result = normalizeDataset({
    format: "json",
    records: [{ id: 1, name: "A" }, { id: 2, name: null }],
  });
  assert.deepEqual(result.fieldNames, ["id", "name"]);
  assert.equal(result.records.length, 2);
  assert.equal(result.records[1].name, null);
});

test("normalizes CSV text into records", () => {
  const result = normalizeDataset({
    format: "csv",
    data: "id,name\n1,A\n2,",
  });
  assert.deepEqual(result.records, [{ id: "1", name: "A" }, { id: "2", name: "" }]);
});

test("rejects unsupported format", () => {
  assert.throws(() => normalizeDataset({ format: "xml" }), /UNSUPPORTED_FORMAT/);
});

test("rejects non-array json records", () => {
  assert.throws(() => normalizeDataset({ format: "json", records: "bad" }), /INVALID_DATASET/);
});

test("rejects non-object json record", () => {
  assert.throws(
    () => normalizeDataset({ format: "json", records: [1, "a", true] }),
    /INVALID_RECORD_SHAPE/
  );
});

test("rejects too many records", () => {
  const records = Array.from({ length: 1001 }, (_, i) => ({ id: i }));
  assert.throws(() => normalizeDataset({ format: "json", records }), /TOO_MANY_RECORDS/);
});

test("rejects too many fields", () => {
  const record = Object.fromEntries(Array.from({ length: 251 }, (_, i) => [i, i]));
  assert.throws(() => normalizeDataset({ format: "json", records: [record] }), /TOO_MANY_FIELDS/);
});

test("rejects depth 9", () => {
  let deep = { a: 1 };
  for (let i = 0; i < 9; i++) deep = { next: deep };
  assert.throws(() => normalizeDataset({ format: "json", records: [deep] }), /NESTING_TOO_DEEP/);
});

test("rejects malformed CSV quoting", () => {
  assert.throws(
    () => normalizeDataset({ format: "csv", data: "id,name\n1,\"unclosed" }),
    /MALFORMED_CSV/
  );
});
