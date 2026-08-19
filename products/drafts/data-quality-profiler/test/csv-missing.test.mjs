import test from "node:test";
import assert from "node:assert/strict";
import { normalizeDataset } from "../src/dataset/normalize.mjs";
import { profileDataset } from "../src/dataset/profile.mjs";

test("CSV empty cells count as missing values", () => {
  const csvData = "id,name,score\n1,Alice,90\n2,,\n3,,70";
  const normalized = normalizeDataset({ format: "csv", data: csvData });
  assert.equal(normalized.format, "csv");

  const profile = profileDataset(normalized);

  // name column: row 2 has empty string, row 3 has empty string → 2 missing
  assert.equal(profile.fields.name.null_count, 2, "CSV empty cells must count as missing");
  assert.equal(profile.fields.name.null_pct, 66.67);

  // score column: row 2 has empty string → 1 missing
  assert.equal(profile.fields.score.null_count, 1, "single CSV empty cell must count as missing");

  // id column: no empty cells
  assert.equal(profile.fields.id.null_count, 0);
});

test("CSV format is propagated through normalization to profiling", () => {
  const csvData = "x,y\n1,2\n3,\n,5";
  const normalized = normalizeDataset({ format: "csv", data: csvData });
  const profile = profileDataset(normalized);
  // y column: row 2 has empty string → 1 missing
  assert.equal(profile.fields.y.null_count, 1, "format=csv must propagate so empty strings count as missing");
  // x column: row 3 has empty string → 1 missing
  assert.equal(profile.fields.x.null_count, 1);
});

test("JSON format does not treat empty strings as missing", () => {
  const normalized = normalizeDataset({ format: "json", records: [{ a: "" }, { a: "hello" }] });
  const profile = profileDataset(normalized);
  assert.equal(profile.fields.a.null_count, 0, "JSON empty string should not be treated as missing");
});
