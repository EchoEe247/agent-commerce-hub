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

test("near_constant requires dominant VALUE frequency >=95%, not dominant TYPE frequency", () => {
  // 12 distinct strings — all same type "string" but different values → NOT near-constant
  const manyDistinct = Array.from({ length: 12 }, (_, i) => ({ label: `value-${i}` }));
  const profileDistinct = profileField(manyDistinct, "label");
  assert.equal(profileDistinct.inferred_type, "string");
  assert.equal(profileDistinct.near_constant, false, "12 distinct string values must not be near-constant");

  // 19 of 20 rows share the same value → near-constant
  const dominated = Array.from({ length: 20 }, (_, i) => ({ label: i < 19 ? "X" : "Y" }));
  const profileDominated = profileField(dominated, "label");
  assert.equal(profileDominated.near_constant, true, ">=95% repeated value must be near-constant");
});

test("near_constant requires >=10 non-missing rows", () => {
  const few = Array.from({ length: 9 }, (_, i) => ({ label: "same" }));
  const profileFew = profileField(few, "label");
  assert.equal(profileFew.near_constant, false, "<10 rows must not be near-constant even if all identical");
});

test("distinct_count uses value canonicalization for objects, not reference identity", () => {
  const records = [
    { tag: { a: 1, b: 2 } },
    { tag: { b: 2, a: 1 } },  // same value, different key order
    { tag: { a: 1, b: 3 } },  // different value
  ];
  const profile = profileField(records, "tag");
  assert.equal(profile.distinct_count, 2, "two equivalent objects should count as one distinct value");
});

test("distinct_count uses value canonicalization for arrays", () => {
  const records = [
    { items: [1, 2, 3] },
    { items: [1, 2, 3] },  // same value
    { items: [3, 2, 1] },  // different order → different value
  ];
  const profile = profileField(records, "items");
  assert.equal(profile.distinct_count, 2, "two identical arrays should count as one distinct value");
});
