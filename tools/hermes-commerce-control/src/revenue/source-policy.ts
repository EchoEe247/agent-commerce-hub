/**
 * Conservative source policy for the zero-out-of-pocket revenue lane.
 *
 * This layer intentionally differs from marketplace marketing language. A
 * source can advertise "free claiming" while still requiring a funded wallet,
 * bond, stake, gas, paid brief, or other setup cost. A source is marked zero
 * upfront only when the documented solver path itself contains no paid action.
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
  bountybook: source(0, "wallet", 0.72, false, [
    "current public docs show authentication as an off-chain message signature and claim/submit as free authenticated HTTP requests",
    "the documented claim body uses txHash \"0x\" and does not show an agent-broadcast on-chain transaction",
    "the same docs separately say agents need a tiny amount of ETH for gas, but no gas-consuming step is identified in the standard claim/submit earning path",
    "treat the standard inline earning path as zero solver-side spend unless the live API explicitly requests a transaction or paid action",
  ]),
  agent_bounties: source(null, "wallet", 0.82, false, [
    "claim-specific bond or stake requirements can exist",
    "do not assume zero entry cost until the selected bounty is inspected",
  ]),
});
