import test from "node:test";
import assert from "node:assert/strict";
import type { WorkCandidate } from "../src/core/models.js";
import { modeAWorkActionability } from "../src/core/models.js";
import { evaluateRevenueWork, type RevenueSourceProfile } from "../src/revenue/work-opportunity.js";
import { evaluateProfitEconomics, type ProfitSourceProfile } from "../src/revenue/profit-economics.js";

function work(reward = "12"): WorkCandidate {
  return {
    id: "wrk_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    kind: "work",
    source: "bountybook",
    externalId: "job-1",
    title: "Research and build a structured data report",
    description: "Analyze data and produce a report",
    reward: { amount: reward, asset: "USDC", usd: reward },
    funding: { state: "funded", evidence: "observed" },
    verification: { type: "deterministic" },
    requirements: ["research", "analysis", "report"],
    status: "open",
    observedAt: "2026-08-27T00:00:00.000Z",
    evidence: [],
    actionability: modeAWorkActionability({ canPrepareClaim: true }),
  };
}

const revenueProfile: RevenueSourceProfile = {
  upfrontCostUsd: 0,
  identityBarrier: "wallet",
  paymentConfidence: 0.95,
  humanActionRequired: false,
  notes: [],
};

function profitProfile(input: Partial<ProfitSourceProfile> = {}): ProfitSourceProfile {
  return {
    successFeeFraction: 0.04,
    attemptCostUsd: 0.05,
    successFixedCostUsd: 0,
    notes: [],
    ...input,
  };
}

test("profit: platform fee and gas are deducted from successful profit", () => {
  const candidate = work("12");
  const revenue = evaluateRevenueWork(candidate, {
    sourceProfiles: { bountybook: revenueProfile },
    capabilities: ["research", "analysis", "report"],
  });
  const profit = evaluateProfitEconomics(candidate, revenue, {
    sourceProfiles: { bountybook: profitProfile() },
    minSuccessProbability: 0,
    minExpectedNetProfitUsd: 0,
  });

  assert.equal(profit.successFeeUsd, 0.48);
  assert.equal(profit.netProfitOnSuccessUsd, 11.47);
  assert.equal(profit.lossIfNoPayoutUsd, 0.05);
  assert.ok((profit.expectedNetProfitUsd ?? 0) < 11.47);
});

test("profit: a failed attempt's gas is charged even when payout is zero", () => {
  const candidate = work("12");
  const revenue = evaluateRevenueWork(candidate, {
    sourceProfiles: { bountybook: revenueProfile },
    capabilities: ["research"],
  });
  const profit = evaluateProfitEconomics(candidate, revenue, {
    sourceProfiles: { bountybook: profitProfile({ attemptCostUsd: 0.2 }) },
    minSuccessProbability: 0,
    minExpectedNetProfitUsd: 0,
  });

  assert.equal(profit.lossIfNoPayoutUsd, 0.2);
  assert.ok((profit.expectedNetProfitUsd ?? 0) < (profit.netProfitOnSuccessUsd ?? 0));
});

test("profit: unresolved gas/fees blocks pursuit instead of assuming zero", () => {
  const candidate = work();
  const revenue = evaluateRevenueWork(candidate, {
    sourceProfiles: { bountybook: revenueProfile },
    capabilities: ["research"],
  });
  const profit = evaluateProfitEconomics(candidate, revenue, {
    sourceProfiles: {
      bountybook: profitProfile({ attemptCostUsd: null }),
    },
  });

  assert.equal(profit.costsResolved, false);
  assert.equal(profit.expectedNetProfitUsd, null);
  assert.equal(profit.pursuitEligible, false);
  assert.ok(profit.blockers.includes("costs_unresolved"));
  assert.ok(profit.flags.includes("failure_loss_unresolved"));
});

test("profit: low expected dollars are rejected even when gross reward is positive", () => {
  const candidate = work("1");
  const revenue = evaluateRevenueWork(candidate, {
    sourceProfiles: { bountybook: revenueProfile },
    capabilities: ["research"],
  });
  const profit = evaluateProfitEconomics(candidate, revenue, {
    sourceProfiles: { bountybook: profitProfile() },
    minSuccessProbability: 0,
    minExpectedNetProfitUsd: 3,
  });

  assert.equal(profit.pursuitEligible, false);
  assert.ok(profit.blockers.includes("expected_net_profit_below_minimum"));
});

test("profit: too much money at risk on failure is rejected", () => {
  const candidate = work("25");
  const revenue = evaluateRevenueWork(candidate, {
    sourceProfiles: { bountybook: revenueProfile },
    capabilities: ["research"],
  });
  const profit = evaluateProfitEconomics(candidate, revenue, {
    sourceProfiles: { bountybook: profitProfile({ attemptCostUsd: 1 }) },
    minSuccessProbability: 0,
    minExpectedNetProfitUsd: 0,
    maxLossIfNoPayoutUsd: 0.25,
  });

  assert.equal(profit.pursuitEligible, false);
  assert.ok(profit.blockers.includes("failure_loss_above_limit"));
});

test("profit: success probability is a hard pursuit gate", () => {
  const candidate = work("50");
  const revenue = evaluateRevenueWork(candidate, {
    sourceProfiles: {
      bountybook: { ...revenueProfile, paymentConfidence: 0.4 },
    },
    capabilities: ["research"],
  });
  const profit = evaluateProfitEconomics(candidate, revenue, {
    sourceProfiles: { bountybook: profitProfile() },
    minSuccessProbability: 0.7,
    minExpectedNetProfitUsd: 0,
  });

  assert.equal(profit.pursuitEligible, false);
  assert.ok(profit.blockers.includes("success_probability_below_minimum"));
});
