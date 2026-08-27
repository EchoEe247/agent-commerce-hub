import test from "node:test";
import assert from "node:assert/strict";
import { assessBountyBookReliability } from "../src/revenue/bountybook-reliability.js";

test("BountyBook reliability suppresses pursuit on a large near-zero pass sample", () => {
  const assessment = assessBountyBookReliability({
    total_verifications: 12474,
    pass_rate: 0.004248837582170916,
    fail_rate: 0.9957511624178291,
  });

  assert.equal(assessment.status, "degraded");
  assert.equal(assessment.pursuitSuppressed, true);
  assert.equal(assessment.totalVerifications, 12474);
  assert.equal(assessment.passRate, 0.004248837582170916);
});

test("BountyBook reliability allows pursuit when the live pass rate recovers", () => {
  const assessment = assessBountyBookReliability({
    total_verifications: 1000,
    pass_rate: 0.25,
    fail_rate: 0.75,
  });

  assert.equal(assessment.status, "healthy");
  assert.equal(assessment.pursuitSuppressed, false);
});

test("BountyBook reliability stays unknown for insufficient or malformed telemetry", () => {
  assert.equal(
    assessBountyBookReliability({ total_verifications: 20, pass_rate: 0 }).status,
    "unknown",
  );
  assert.equal(assessBountyBookReliability({ nope: true }).status, "unknown");
  assert.equal(assessBountyBookReliability(null).status, "unknown");
});
