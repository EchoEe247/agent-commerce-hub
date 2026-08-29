import test from "node:test";
import assert from "node:assert/strict";
import { LIMITS, assertMaxDepth } from "../src/dataset/limits.mjs";

test("allows depth up to limit", () => {
  let deep = { a: 1 };
  for (let i = 0; i < LIMITS.nestingDepth - 1; i++) deep = { next: deep };
  assert.doesNotThrow(() => assertMaxDepth(deep, LIMITS.nestingDepth));
});

test("throws when exceeding limit", () => {
  let deep = { a: 1 };
  for (let i = 0; i < LIMITS.nestingDepth; i++) deep = { next: deep };
  assert.throws(() => assertMaxDepth(deep, LIMITS.nestingDepth), /NESTING_TOO_DEEP/);
});
