import test from "node:test";
import assert from "node:assert/strict";
import { fingerprintSchema } from "../src/dataset/fingerprint.mjs";

test("produces stable sha256 fingerprint independent of key order", () => {
  const fieldProfilesA = {
    age: { inferred_type: "integer", null_count: false },
    id: { inferred_type: "integer", null_count: false },
  };
  const fieldProfilesB = {
    id: { inferred_type: "integer", null_count: false },
    age: { inferred_type: "integer", null_count: false },
  };

  const fingerprintA = fingerprintSchema(fieldProfilesA);
  const fingerprintB = fingerprintSchema(fieldProfilesB);
  assert.equal(fingerprintA, fingerprintB);
  assert.ok(fingerprintA.startsWith("sha256:"));
});
