/**
 * Conservative source policy for the zero-out-of-pocket revenue lane.
 *
 * This layer intentionally differs from marketplace marketing language. A
 * source can advertise "free claiming" while still requiring a funded wallet,
 * bond, stake, gas, paid brief, or other setup cost. Until a source is proven to
 * require zero solver-side spend, its upfront cost remains unresolved.
 */
import type { PlatformId } from "../core/models.js";
import type { RevenueSourceProfile } from "./work-opportunity.js";

function source(
  upfrontCostUsd: number | null,
  identityBarrier: RevenueSourceProfile["identityBarrier"],
  paymentConfidence: number,
  humanActionRequired: boolean,
  notes: readonly string[],
): RevenueSourceProfile {
  return Object.freeze({
    upfrontCostUsd,
    identityBarrier,
    paymentConfidence,
    humanActionRequired,
    notes: Object.freeze([...notes]),
  });
}

/**
 * Overrides only where current public evidence materially changes the default.
 * Unknown cost is deliberate: strict zero-cost scans reject it until resolved.
 */
export const STRICT_ZERO_COST_SOURCE_PROFILES: Partial<
  Record<PlatformId, RevenueSourceProfile>
> = Object.freeze({
  bountybook: source(null, "wallet", 0.72, false, [
    "public docs say claiming and submitting are free and 96% of a successful bounty goes to the agent",
    "the same quickstart tells agents to fund the Base wallet with a small amount of ETH for gas",
    "therefore solver-side setup cost is not proven zero; strict zero-cost mode must block execution",
  ]),
  agent_bounties: source(null, "wallet", 0.82, false, [
    "claim-specific bond or stake requirements can exist",
    "do not assume zero entry cost until the selected bounty is inspected",
  ]),
});
