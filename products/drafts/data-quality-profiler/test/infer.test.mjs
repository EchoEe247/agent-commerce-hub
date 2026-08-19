import test from "node:test";
import assert from "node:assert/strict";
import { classifyValue, profileField } from "../src/dataset/infer.mjs";

test("classifies primitive values", () => {
  assert.equal(classifyValue(null), "null");
  assert.equal(classifyValue(true), "boolean");
  assert.equal(classifyValue(1), "integer");
  assert.equal(classifyValue(1.5), "number");
  assert.equal(classifyValue("23"), "string");
  assert.equal(classifyValue([]), "array");
  assert.equal(classifyValue({}), "object");
});

test("profiles field statistics", () => {
  const records = [
    { age: 10, code: "A" },
    { age: 20, code: "A" },
    { age: null, code: "A" },
  ];
  const profile = profileField(records, "age");
  assert.equal(profile.inferred_type, "integer");
  assert.equal(profile.null_count, 1);
  assert.equal(profile.null_pct, 33.33);
  assert.equal(profile.distinct_count, 2);
  assert.equal(profile.min, 10);
  assert.equal(profile.max, 20);
  assert.equal(profile.mean, 15);
  assert.equal(profile.median, 15);

  const codeProfile = profileField(records, "code");
  assert.equal(codeProfile.constant, true);
  assert.equal(codeProfile.string_min_length, 1);
  assert.equal(codeProfile.string_max_length, 1);
  assert.equal(codeProfile.string_mean_length, 1);
});

test("detects mixed types and conflicts", () => {
  const records = [{ x: 1 }, { x: "1" }];
  const profile = profileField(records, "x");
  assert.equal(profile.inferred_type, "mixed");
  assert.deepEqual(profile.type_conflicts, { integer: 1, string: 1 });
});
