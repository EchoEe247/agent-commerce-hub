import test from "node:test";
import assert from "node:assert/strict";
import { canonicalWorkId } from "../src/core/ids.js";
import {
  modeAWorkActionability,
  type EvidenceClass,
  type FundingState,
  type PlatformId,
  type VerifierType,
  type WorkCandidate,
} from "../src/core/models.js";
import {
  evaluateRevenueWork,
  rankRevenueWork,
  REVENUE_WEIGHTS,
  type RevenueSourceProfile,
} from "../src/revenue/work-opportunity.js";

const NOW = "2026-08-27T07:00:00.000Z";

function work(overrides: {
  externalId: string;
  title?: string;
  source?: PlatformId;
  reward?: string;
  verifier?: VerifierType;
  fundingState?: FundingState;
  fundingEvidence?: EvidenceClass;
  status?: WorkCandidate["status"];
  requirements?: string[];
}): WorkCandidate {
  const source = overrides.source ?? "bountybook";
  const reward = overrides.reward ?? "10";
  return {
    id: canonicalWorkId({ source, externalId: overrides.externalId }),
    kind: "work",
    source,
    externalId: overrides.externalId,
    title: overrides.title ?? "Research 25 competitors and produce a structured report",
    reward: { amount: reward, asset: "USDC", usd: reward },
    funding: {
      state: overrides.fundingState ?? "funded",
      evidence: overrides.fundingEvidence ?? "observed",
    },
    verification: { type: overrides.verifier ?? "deterministic" },
    requirements: overrides.requirements ?? [],
    status: overrides.status ?? "open",
    observedAt: NOW,
    evidence: [],
    actionability: modeAWorkActionability({ canPrepareClaim: true }),
  };
}

const noCostNoKyc: RevenueSourceProfile = {
  upfrontCostUsd: 0,
  identityBarrier: "wallet",
  paymentConfidence: 0.9,
  humanActionRequired: false,
  notes: [],
};

test("revenue: weights total 100", () => {
  assert.deepEqual(REVENUE_WEIGHTS, {
    rewardValue: 25,
    paymentConfidence: 20,
    automationFit: 25,
    acceptancePredictability: 15,
    zeroCostFit: 10,
    accessFit: 5,
  });
  assert.equal(Object.values(REVENUE_WEIGHTS).reduce((a, b) => a + b, 0), 100);
});

test("revenue: research/data work is treated as highly automatable", () => {
  const result = evaluateRevenueWork(work({ externalId: "research" }), {
    sourceProfiles: { bountybook: noCostNoKyc },
  });
  assert.equal(result.eligible, true);
  assert.ok(result.automationFraction >= 0.9);
  assert.ok((result.expectedRevenueUsd ?? 0) > 0);
});

test("revenue: physical/in-person work is excluded by the automation floor", () => {
  const result = evaluateRevenueWork(
    work({ externalId: "physical", title: "Schedule five apartment viewings and visit in person" }),
    { sourceProfiles: { bountybook: noCostNoKyc } },
  );
  assert.equal(result.eligible, false);
  assert.ok(result.blockers.includes("automation_fit_below_minimum"));
});

test("revenue: known positive entry cost is a hard blocker by default", () => {
  const paidEntry: RevenueSourceProfile = { ...noCostNoKyc, upfrontCostUsd: 0.1 };
  const result = evaluateRevenueWork(work({ externalId: "bond" }), {
    sourceProfiles: { bountybook: paidEntry },
  });
  assert.equal(result.eligible, false);
  assert.ok(result.blockers.includes("known_upfront_cost"));
});

test("revenue: unresolved entry cost is flagged but not silently assumed paid", () => {
  const unknownEntry: RevenueSourceProfile = { ...noCostNoKyc, upfrontCostUsd: null };
  const discovery = evaluateRevenueWork(work({ externalId: "unknown-cost" }), {
    sourceProfiles: { bountybook: unknownEntry },
  });
  assert.equal(discovery.eligible, true);
  assert.ok(discovery.flags.includes("upfront_cost_unresolved"));

  const strict = evaluateRevenueWork(work({ externalId: "unknown-cost-strict" }), {
    sourceProfiles: { bountybook: unknownEntry },
    requireKnownZeroUpfront: true,
  });
  assert.equal(strict.eligible, false);
  assert.ok(strict.blockers.includes("upfront_cost_unresolved"));
});

test("revenue: mandatory KYC is excluded when avoidKycRequired is active", () => {
  const kyc: RevenueSourceProfile = { ...noCostNoKyc, identityBarrier: "kyc_required" };
  const result = evaluateRevenueWork(work({ externalId: "kyc" }), {
    sourceProfiles: { bountybook: kyc },
  });
  assert.equal(result.eligible, false);
  assert.ok(result.blockers.includes("kyc_required"));
});

test("revenue: manipulation and review-farming work is rejected", () => {
  const stars = evaluateRevenueWork(
    work({ externalId: "stars", title: "Increase Repository Stars By 100" }),
    { sourceProfiles: { bountybook: noCostNoKyc } },
  );
  assert.equal(stars.eligible, false);
  assert.ok(stars.flags.includes("engagement_manipulation"));
  assert.ok(stars.blockers.includes("integrity_risk"));

  const reviews = evaluateRevenueWork(
    work({ externalId: "reviews", title: "Recruit users to download and review our app" }),
    { sourceProfiles: { bountybook: noCostNoKyc } },
  );
  assert.equal(reviews.eligible, false);
  assert.ok(reviews.flags.includes("review_farming"));
});

test("revenue: expected revenue rises with reward and predictable verification", () => {
  const low = evaluateRevenueWork(work({ externalId: "low", reward: "5", verifier: "ai_oracle" }), {
    sourceProfiles: { bountybook: noCostNoKyc },
  });
  const high = evaluateRevenueWork(
    work({ externalId: "high", reward: "50", verifier: "deterministic" }),
    { sourceProfiles: { bountybook: noCostNoKyc } },
  );
  assert.ok((high.expectedRevenueUsd ?? 0) > (low.expectedRevenueUsd ?? 0));
  assert.ok(high.acceptanceProbability > low.acceptanceProbability);
});

test("revenue: rankRevenueWork orders by expected dollars and removes blockers", () => {
  const candidates = [
    work({ externalId: "small", reward: "5" }),
    work({ externalId: "large", reward: "40" }),
    work({ externalId: "bad", reward: "100", title: "Increase repository stars by 100" }),
  ];
  const ranked = rankRevenueWork(candidates, {
    sourceProfiles: { bountybook: noCostNoKyc },
  });
  assert.deepEqual(
    ranked.map((entry) => entry.work.externalId),
    ["large", "small"],
  );
});

test("revenue: funding must still be open and earnable", () => {
  const submitted = evaluateRevenueWork(
    work({ externalId: "submitted", fundingState: "submitted", status: "in_review" }),
    { sourceProfiles: { bountybook: noCostNoKyc } },
  );
  assert.equal(submitted.eligible, false);
  assert.ok(submitted.blockers.includes("work_not_open"));
  assert.ok(submitted.blockers.includes("funding_not_currently_earnable"));
});
