/**
 * Revenue-first evaluation for earnable work.
 *
 * The existing work ranking answers "is this a credible bounty?". This layer
 * answers a different operator question: "is this a plausible zero-cost,
 * mostly-agent-deliverable path to an actual payout?"
 *
 * It is intentionally deterministic and conservative. Unknown onboarding or
 * payout details are surfaced as uncertainty rather than silently treated as
 * safe. Nothing in this module performs a claim, submission, payment or signup.
 */
import { toRankingNumber } from "../core/money.js";
import type { EvidenceClass, PlatformId, VerifierType, WorkCandidate } from "../core/models.js";

export const REVENUE_WEIGHTS = Object.freeze({
  rewardValue: 25,
  paymentConfidence: 20,
  automationFit: 25,
  acceptancePredictability: 15,
  zeroCostFit: 10,
  accessFit: 5,
});

export type IdentityBarrier = "none" | "wallet" | "account" | "kyc_required" | "unknown";

export interface RevenueSourceProfile {
  /** 0 means no known solver-side entry cost. null means unresolved. */
  readonly upfrontCostUsd: number | null;
  readonly identityBarrier: IdentityBarrier;
  /** 0..1 confidence that a successful accepted submission results in payment. */
  readonly paymentConfidence: number;
  /** Whether a human/operator interaction is normally required before submission. */
  readonly humanActionRequired: boolean;
  readonly notes: readonly string[];
}

/**
 * Conservative source defaults based on the adapters' own observed payment and
 * action boundaries. These are policy hints, not claims about future onboarding.
 */
export const DEFAULT_REVENUE_SOURCE_PROFILES: Readonly<Record<PlatformId, RevenueSourceProfile>> =
  Object.freeze({
    cdp_bazaar: profile(null, "unknown", 0.55, false, ["primarily a paid-service catalog"]),
    agent402: profile(null, "unknown", 0.55, false, ["primarily a paid-service catalog"]),
    piprail: profile(null, "unknown", 0.5, false, ["payment-routing surface; work access varies"]),
    agent_bounties: profile(null, "wallet", 0.82, false, [
      "canonical settlement event is the strongest payment proof",
      "some bounties may impose claim-specific bond/stake requirements; treat entry cost as unresolved",
    ]),
    bountybook: profile(0, "wallet", 0.72, false, [
      "platform advertises escrowed USDC work",
      "claim authentication uses an Ethereum identity; no solver entry fee is documented by the adapter",
    ]),
    the402: profile(0, "wallet", 0.45, false, [
      "historically wallet-native; current commercial availability must be rechecked before action",
    ]),
    paysh: profile(null, "unknown", 0.45, false, ["payment metadata surface; work access varies"]),
  });

export interface RevenueEvaluationOptions {
  readonly minRewardUsd?: number | undefined;
  readonly minAutomationFraction?: number | undefined;
  /** Reject sources with a known positive entry cost. Defaults true. */
  readonly zeroUpfrontOnly?: boolean | undefined;
  /** Also reject unresolved entry-cost sources. Defaults false so discovery is not blinded. */
  readonly requireKnownZeroUpfront?: boolean | undefined;
  /** Reject sources known to require government-ID/KYC. Defaults true. */
  readonly avoidKycRequired?: boolean | undefined;
  /** Exclude engagement manipulation / review farming / obvious academic-cheating tasks. */
  readonly excludeIntegrityRisk?: boolean | undefined;
  readonly capabilities?: readonly string[] | undefined;
  readonly sourceProfiles?: Partial<Record<PlatformId, RevenueSourceProfile>> | undefined;
  /** USD reward at which the reward component saturates. Defaults $50. */
  readonly rewardSaturationUsd?: number | undefined;
}

export interface RevenueBreakdown {
  readonly rewardValue: number;
  readonly paymentConfidence: number;
  readonly automationFit: number;
  readonly acceptancePredictability: number;
  readonly zeroCostFit: number;
  readonly accessFit: number;
  readonly total: number;
}

export interface RevenueEvaluation {
  readonly eligible: boolean;
  readonly blockers: readonly string[];
  readonly flags: readonly string[];
  readonly rewardUsd: number | null;
  readonly automationFraction: number;
  readonly acceptanceProbability: number;
  readonly paymentConfidence: number;
  readonly expectedRevenueUsd: number | null;
  readonly sourceProfile: RevenueSourceProfile;
  readonly breakdown: RevenueBreakdown;
}

export interface RankedRevenueWork {
  readonly work: WorkCandidate;
  readonly revenue: RevenueEvaluation;
}

function profile(
  upfrontCostUsd: number | null,
  identityBarrier: IdentityBarrier,
  paymentConfidence: number,
  humanActionRequired: boolean,
  notes: readonly string[],
): RevenueSourceProfile {
  return Object.freeze({
    upfrontCostUsd,
    identityBarrier,
    paymentConfidence: clamp01(paymentConfidence),
    humanActionRequired,
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

function textOf(work: WorkCandidate): string {
  return `${work.title}\n${work.description ?? ""}\n${work.requirements.join("\n")}`.toLowerCase();
}

const HIGH_AUTOMATION_PATTERNS = [
  /\bresearch\b/,
  /\banaly[sz]e\b/,
  /\bcompetitive\b/,
  /\bcompile\b/,
  /\bidentify\b/,
  /\bprospect\b/,
  /\blead(?:s| generation)?\b/,
  /\bdataset\b/,
  /\bdata\b/,
  /\breport\b/,
  /\bcode\b/,
  /\bbuild\b/,
  /\bautomation\b/,
  /\baudit\b/,
  /\bscrap(?:e|ing)\b/,
  /\bsummar(?:y|ize|ise)\b/,
  /\bcompare\b/,
  /\bmap\b/,
  /\blist\b/,
  /\bcontent pipeline\b/,
];

const MEDIUM_AUTOMATION_PATTERNS = [
  /\bimage\b/,
  /\bdesign\b/,
  /\bvideo\b/,
  /\bedit\b/,
  /\bcarousel\b/,
  /\bheadshot\b/,
];

const LOW_AUTOMATION_PATTERNS = [
  /\bin[- ]?person\b/,
  /\bphysical\b/,
  /\bapartment\b/,
  /\bviewing\b/,
  /\bpick(?:up| up)\b/,
  /\bshipping\b/,
  /\bphone call\b/,
  /\bcall (?:the|a|an|five|\d)\b/,
  /\bvisit\b/,
];

const INTEGRITY_RISK_PATTERNS: ReadonlyArray<{ pattern: RegExp; flag: string }> = [
  { pattern: /\bincrease .*\bstars?\b/, flag: "engagement_manipulation" },
  { pattern: /\b(?:fake|buy|farm) (?:reviews?|ratings?|followers?|likes?|upvotes?|stars?)\b/, flag: "engagement_manipulation" },
  { pattern: /\bdownload and review\b/, flag: "review_farming" },
  { pattern: /\brecruit .*\breview\b/, flag: "review_farming" },
  { pattern: /\bwrite \d+[ -]word essay\b/, flag: "academic_work_risk" },
  { pattern: /\bhomework\b|\bexam answers?\b/, flag: "academic_work_risk" },
];

function automationFraction(work: WorkCandidate, capabilities: readonly string[]): number {
  const text = textOf(work);
  if (LOW_AUTOMATION_PATTERNS.some((pattern) => pattern.test(text))) return 0.15;

  let base = HIGH_AUTOMATION_PATTERNS.some((pattern) => pattern.test(text))
    ? 0.9
    : MEDIUM_AUTOMATION_PATTERNS.some((pattern) => pattern.test(text))
      ? 0.65
      : 0.5;

  if (capabilities.length > 0) {
    const normalized = capabilities.map((capability) => capability.trim().toLowerCase()).filter(Boolean);
    const hits = normalized.filter((capability) => text.includes(capability)).length;
    if (hits > 0) base = Math.min(0.98, base + Math.min(0.08, hits * 0.02));
  }
  return round4(base);
}

const VERIFIER_ACCEPTANCE: Readonly<Record<VerifierType, number>> = Object.freeze({
  deterministic: 0.82,
  hybrid: 0.68,
  operator: 0.55,
  ai_oracle: 0.48,
  unknown: 0.32,
});

const FUNDING_CONFIDENCE: Readonly<Record<EvidenceClass, number>> = Object.freeze({
  verified: 1,
  observed: 0.78,
  inferred: 0.55,
  tentative: 0.3,
});

function integrityFlags(work: WorkCandidate): string[] {
  const text = textOf(work);
  return [...new Set(INTEGRITY_RISK_PATTERNS.filter(({ pattern }) => pattern.test(text)).map(({ flag }) => flag))].sort();
}

function rewardUsd(work: WorkCandidate): number | null {
  const raw = work.reward.usd;
  if (raw === undefined) return null;
  const parsed = toRankingNumber(raw);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function resolveSourceProfile(
  source: PlatformId,
  overrides: RevenueEvaluationOptions["sourceProfiles"],
): RevenueSourceProfile {
  return overrides?.[source] ?? DEFAULT_REVENUE_SOURCE_PROFILES[source];
}

export function evaluateRevenueWork(
  work: WorkCandidate,
  options: RevenueEvaluationOptions = {},
): RevenueEvaluation {
  const minRewardUsd = options.minRewardUsd ?? 1;
  const minAutomationFraction = clamp01(options.minAutomationFraction ?? 0.5);
  const zeroUpfrontOnly = options.zeroUpfrontOnly ?? true;
  const requireKnownZeroUpfront = options.requireKnownZeroUpfront ?? false;
  const avoidKycRequired = options.avoidKycRequired ?? true;
  const excludeIntegrityRisk = options.excludeIntegrityRisk ?? true;
  const capabilities = options.capabilities ?? [];
  const sourceProfile = resolveSourceProfile(work.source, options.sourceProfiles);
  const reward = rewardUsd(work);
  const automation = automationFraction(work, capabilities);
  const flags = integrityFlags(work);
  const blockers: string[] = [];

  if (work.status !== "open") blockers.push("work_not_open");
  if (work.funding.state !== "funded") blockers.push("funding_not_currently_earnable");
  if (reward === null) blockers.push("reward_usd_unknown");
  else if (reward < minRewardUsd) blockers.push("reward_below_minimum");
  if (automation < minAutomationFraction) blockers.push("automation_fit_below_minimum");

  if (zeroUpfrontOnly && sourceProfile.upfrontCostUsd !== null && sourceProfile.upfrontCostUsd > 0) {
    blockers.push("known_upfront_cost");
  }
  if (requireKnownZeroUpfront && sourceProfile.upfrontCostUsd === null) {
    blockers.push("upfront_cost_unresolved");
  }
  if (avoidKycRequired && sourceProfile.identityBarrier === "kyc_required") {
    blockers.push("kyc_required");
  }
  if (excludeIntegrityRisk && flags.length > 0) blockers.push("integrity_risk");

  if (sourceProfile.upfrontCostUsd === null) flags.push("upfront_cost_unresolved");
  if (sourceProfile.identityBarrier === "unknown") flags.push("identity_requirement_unresolved");
  if (sourceProfile.humanActionRequired) flags.push("human_action_required");

  const acceptanceProbability = VERIFIER_ACCEPTANCE[work.verification.type];
  const paymentConfidence = round4(
    clamp01(sourceProfile.paymentConfidence * FUNDING_CONFIDENCE[work.funding.evidence]),
  );
  const expectedRevenueUsd =
    reward === null
      ? null
      : round4(reward * paymentConfidence * acceptanceProbability * automation);

  const saturation = Math.max(1, options.rewardSaturationUsd ?? 50);
  const rewardFraction = reward === null ? 0 : clamp01(Math.log10(1 + reward) / Math.log10(1 + saturation));
  const zeroCostFraction =
    sourceProfile.upfrontCostUsd === 0 ? 1 : sourceProfile.upfrontCostUsd === null ? 0.4 : 0;
  const accessFraction =
    sourceProfile.identityBarrier === "none" || sourceProfile.identityBarrier === "wallet"
      ? 1
      : sourceProfile.identityBarrier === "account"
        ? 0.7
        : sourceProfile.identityBarrier === "unknown"
          ? 0.4
          : 0;

  const breakdown: RevenueBreakdown = Object.freeze({
    rewardValue: round4(REVENUE_WEIGHTS.rewardValue * rewardFraction),
    paymentConfidence: round4(REVENUE_WEIGHTS.paymentConfidence * paymentConfidence),
    automationFit: round4(REVENUE_WEIGHTS.automationFit * automation),
    acceptancePredictability: round4(
      REVENUE_WEIGHTS.acceptancePredictability * acceptanceProbability,
    ),
    zeroCostFit: round4(REVENUE_WEIGHTS.zeroCostFit * zeroCostFraction),
    accessFit: round4(REVENUE_WEIGHTS.accessFit * accessFraction),
    total: 0,
  });
  const total = round4(
    breakdown.rewardValue +
      breakdown.paymentConfidence +
      breakdown.automationFit +
      breakdown.acceptancePredictability +
      breakdown.zeroCostFit +
      breakdown.accessFit,
  );

  return Object.freeze({
    eligible: blockers.length === 0,
    blockers: Object.freeze([...new Set(blockers)].sort()),
    flags: Object.freeze([...new Set(flags)].sort()),
    rewardUsd: reward,
    automationFraction: automation,
    acceptanceProbability,
    paymentConfidence,
    expectedRevenueUsd,
    sourceProfile,
    breakdown: Object.freeze({ ...breakdown, total }),
  });
}

export function rankRevenueWork(
  work: readonly WorkCandidate[],
  options: RevenueEvaluationOptions = {},
): RankedRevenueWork[] {
  const ranked = work
    .map((candidate) => Object.freeze({ work: candidate, revenue: evaluateRevenueWork(candidate, options) }))
    .filter((entry) => entry.revenue.eligible);

  ranked.sort((a, b) => {
    const aExpected = a.revenue.expectedRevenueUsd ?? -1;
    const bExpected = b.revenue.expectedRevenueUsd ?? -1;
    if (bExpected !== aExpected) return bExpected - aExpected;
    if (b.revenue.breakdown.total !== a.revenue.breakdown.total) {
      return b.revenue.breakdown.total - a.revenue.breakdown.total;
    }
    return a.work.id < b.work.id ? -1 : a.work.id > b.work.id ? 1 : 0;
  });
  return ranked;
}
