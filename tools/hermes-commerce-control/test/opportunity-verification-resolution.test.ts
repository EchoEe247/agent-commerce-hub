import assert from "node:assert/strict";
import test from "node:test";
import { buildOpportunityVerificationResolution } from "../src/opportunities/verification-resolutions.js";

const base = {
  dossierId: `opdos_${"a".repeat(32)}`,
  checkId: `opcheck_${"b".repeat(32)}`,
  outcome: "satisfied" as const,
  recordedAt: "2026-08-27T16:00:00.000Z",
};

test("source-reference evidence requires a credential-free HTTP(S) URL", () => {
  assert.throws(() =>
    buildOpportunityVerificationResolution({
      ...base,
      evidence: { kind: "source_reference", reference: "not-a-url", note: "invalid source" },
    }),
  );
  assert.throws(() =>
    buildOpportunityVerificationResolution({
      ...base,
      evidence: { kind: "source_reference", reference: "https://user:pass@example.test/source", note: "credentialed source" },
    }),
  );
  const record = buildOpportunityVerificationResolution({
    ...base,
    evidence: { kind: "source_reference", reference: "https://example.test/source", note: "public source" },
  });
  assert.equal(record.evidence.reference, "https://example.test/source");
});

test("opaque executor quote references remain allowed", () => {
  const record = buildOpportunityVerificationResolution({
    ...base,
    evidence: { kind: "executor_quote", reference: "quote:executor-123", note: "quote captured locally" },
  });
  assert.equal(record.evidence.reference, "quote:executor-123");
});
