/**
 * Profit economics layered over the revenue evaluator.
 *
 * Revenue is not profit. This module makes the distinction explicit and gives
 * failed attempts a cost. A task that can lose gas/entry fees without producing
 * a payout must not be ranked as if the advertised reward were free money.
 *
 * Unknown fees/costs remain unresolved rather than being guessed as zero.
 */
import type { PlatformId, WorkCandidate } from "../core/models.js";
import type { RevenueEvaluation } from "./work-opportunity.js";

export interface ProfitSourceProfile {
  /** Fraction of the advertised reward removed only after a successful payout. */
  readonly successFeeFraction: number | null;
  /** Cost paid for an attempt even if the submission fails or is rejected. */
  readonly attemptCostUsd: number | null;
  /** Additional fixed cost paid only after success. */
  readonly successFixedCostUsd: number | null;
  readonly notes: readonly string[];
}

export const DEFAULT_PROFIT_SOURCE_PROFILES: Readonly<Record<PlatformId, ProfitSourceProfile>> =
  Object.freeze({
    cdp_bazaar: profile(null, null, null, ["work-payout economics are not established for this source"]),
    agent402: profile(null, null, null, ["work-payout economics are not established for this source"]),
    piprail: profile(null, null, null, ["work-payout economics are not established for this source"]),
    agent_bounties: profile(null, null, null, [
      "claim-specific bond/stake and transaction-cost requirements may vary",
      "do not assume a failed attempt is free",
    ]),
    bountybook: profile(0.04, null, 0, [
      "public docs state a 4% fee is taken after successful verification",
      "Base gas is required for the agent wallet, but its live USD cost is dynamic and therefore unresolved here",
      "a failed/rejected attempt can still consume gas, so gas must be deducted from expected profit before pursuit",
    ]),
    trybounty: profile(null, null, null, [
      "public pages show escrow-funded work, but solver payout fees and attempt costs are not yet resolved",
    ]),
    the402: profile(null, null, null, ["current work-payout economics require revalidation"]),
    paysh: profile(null, null, null, ["work-payout economics are not established for this source"]),
  });

export interface ProfitEvaluationOptions {
  readonly minExpectedNetProfitUsd?: number | undefined;
  readonly minSuccessProbability?: number | undefined;
  readonly maxLossIfNoPayoutUsd?: number | undefined;
  readonly requireResolvedCosts?: boolean | undefined;
  readonly sourceProfiles?: Partial<Record<PlatformId, ProfitSourceProfile>> | undefined;
}

export interface ProfitEvaluation {
  readonly pursuitEligible: boolean;
  readonly blockers: readonly string[];
  readonly flags: readonly string[];
  readonly successProbability: number;
  readonly advertisedRewardUsd: number | null;
  readonly successFeeUsd: number | null;
  readonly attemptCostUsd: number | null;
  readonly successFixedCostUsd: number | null;
  /** What remains if the task succeeds, before valuing operator time. */
  readonly netProfitOnSuccessUsd: number | null;
  /** Expected profit after success probability and costs that can be lost on failure. */
  readonly expectedNetProfitUsd: number | null;
  /** Maximum known cash loss from an unsuccessful attempt. */
  readonly lossIfNoPayoutUsd: number | null;
  readonly costsResolved: boolean;
  readonly sourceProfile: ProfitSourceProfile;
}

function profile(
  successFeeFraction: number | null,
  attemptCostUsd: number | null,
  successFixedCostUsd: number | null,
  notes: readonly string[],
): ProfitSourceProfile {
  return Object.freeze({
    successFeeFraction:
      successFeeFraction === null ? null : Math.min(1, Math.max(0, successFeeFraction)),
    attemptCostUsd: attemptCostUsd === null ? null : Math.max(0, attemptCostUsd),
    successFixedCostUsd: successFixedCostUsd === null ? null : Math.max(0, successFixedCostUsd),
    notes: Object.freeze([...notes]),
  });
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

function round4(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}

function resolveProfile(
  source: PlatformId,
  overrides: ProfitEvaluationOptions["sourceProfiles"],
): ProfitSourceProfile {
  return overrides?.[source] ?? DEFAULT_PROFIT_SOURCE_PROFILES[source];
}

export function evaluateProfitEconomics(
  work: WorkCandidate,
  revenue: RevenueEvaluation,
  options: ProfitEvaluationOptions = {},
): ProfitEvaluation {
  const sourceProfile = resolveProfile(work.source, options.sourceProfiles);
  const minExpectedNetProfitUsd = Math.max(0, options.minExpectedNetProfitUsd ?? 3);
  const minSuccessProbability = clamp01(options.minSuccessProbability ?? 0.5);
  const maxLossIfNoPayoutUsd = Math.max(0, options.maxLossIfNoPayoutUsd ?? 0.25);
  const requireResolvedCosts = options.requireResolvedCosts ?? true;

  // Revenue evaluator already treats automation fit as part of expected payout.
  // Keep it here in the probability term so a theoretically payable job that we
  // are poorly suited to execute does not look deceptively safe.
  const successProbability = round4(
    clamp01(
      revenue.paymentConfidence * revenue.acceptanceProbability * revenue.automationFraction,
    ),
  );

  const advertisedRewardUsd = revenue.rewardUsd;
  const costsResolved =
    sourceProfile.successFeeFraction !== null &&
    sourceProfile.attemptCostUsd !== null &&
    sourceProfile.successFixedCostUsd !== null;

  const successFeeUsd =
    advertisedRewardUsd === null || sourceProfile.successFeeFraction === null
      ? null
      : round4(advertisedRewardUsd * sourceProfile.successFeeFraction);

  const netProfitOnSuccessUsd =
    advertisedRewardUsd === null ||
    successFeeUsd === null ||
    sourceProfile.attemptCostUsd === null ||
    sourceProfile.successFixedCostUsd === null
      ? null
      : round4(
          advertisedRewardUsd -
            successFeeUsd -
            sourceProfile.attemptCostUsd -
            sourceProfile.successFixedCostUsd,
        );

  const expectedNetProfitUsd =
    advertisedRewardUsd === null ||
    successFeeUsd === null ||
    sourceProfile.attemptCostUsd === null ||
    sourceProfile.successFixedCostUsd === null
      ? null
      : round4(
          successProbability *
            (advertisedRewardUsd - successFeeUsd - sourceProfile.successFixedCostUsd) -
            sourceProfile.attemptCostUsd,
        );

  const lossIfNoPayoutUsd =
    sourceProfile.attemptCostUsd === null ? null : round4(sourceProfile.attemptCostUsd);

  const blockers: string[] = [];
  const flags: string[] = [];

  if (!revenue.eligible) blockers.push("revenue_gate_failed");
  if (!costsResolved) flags.push("costs_unresolved");
  if (requireResolvedCosts && !costsResolved) blockers.push("costs_unresolved");
  if (successProbability < minSuccessProbability) blockers.push("success_probability_below_minimum");
  if (expectedNetProfitUsd !== null && expectedNetProfitUsd < minExpectedNetProfitUsd) {
    blockers.push("expected_net_profit_below_minimum");
  }
  if (lossIfNoPayoutUsd !== null && lossIfNoPayoutUsd > maxLossIfNoPayoutUsd) {
    blockers.push("failure_loss_above_limit");
  }
  if (lossIfNoPayoutUsd === null) flags.push("failure_loss_unresolved");

  return Object.freeze({
    pursuitEligible: blockers.length === 0,
    blockers: Object.freeze([...new Set(blockers)].sort()),
    flags: Object.freeze([...new Set(flags)].sort()),
    successProbability,
    advertisedRewardUsd,
    successFeeUsd,
    attemptCostUsd: sourceProfile.attemptCostUsd,
    successFixedCostUsd: sourceProfile.successFixedCostUsd,
    netProfitOnSuccessUsd,
    expectedNetProfitUsd,
    lossIfNoPayoutUsd,
    costsResolved,
    sourceProfile,
  });
}
