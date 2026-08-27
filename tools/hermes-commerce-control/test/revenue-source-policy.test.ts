import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_REVENUE_SOURCE_PROFILES } from "../src/revenue/work-opportunity.js";
import { STRICT_ZERO_COST_SOURCE_PROFILES } from "../src/revenue/source-policy.js";

test("revenue source policy: BountyBook standard earn path is zero-spend", () => {
  const profile = STRICT_ZERO_COST_SOURCE_PROFILES.bountybook;
  assert.ok(profile);
  assert.equal(profile.upfrontCostUsd, 0);
  assert.equal(profile.identityBarrier, "wallet");
  assert.ok(profile.notes.some((note) => /claim|submit/i.test(note)));
  assert.ok(profile.notes.some((note) => /gas/i.test(note)));
});

test("revenue source policy: Agent Bounties keeps claim-specific cost unresolved", () => {
  const profile = STRICT_ZERO_COST_SOURCE_PROFILES.agent_bounties;
  assert.ok(profile);
  assert.equal(profile.upfrontCostUsd, null);
  assert.ok(profile.notes.some((note) => /bond|stake/i.test(note)));
});

test("revenue source policy: TryBounty defaults to unresolved onboarding and cost", () => {
  const profile = DEFAULT_REVENUE_SOURCE_PROFILES.trybounty;
  assert.equal(profile.upfrontCostUsd, null);
  assert.equal(profile.identityBarrier, "unknown");
  assert.ok(profile.notes.some((note) => /payout|onboarding/i.test(note)));
});
