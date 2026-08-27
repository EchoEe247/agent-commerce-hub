#!/usr/bin/env node
/**
 * Read-only live revenue/profit scan.
 *
 * Queries supported public work adapters, keeps only currently earnable work,
 * then applies revenue and profit economics. Advertised reward is never treated
 * as profit: success fees, attempt costs, failed-attempt loss and payout
 * probability are explicit. Unknown costs stay unresolved and block pursuit.
 *
 * This script never prepares or broadcasts a claim, sends credentials, signs
 * anything, or moves value.
 */
import { loadConfig } from "../src/config.js";
import { AdapterRegistry } from "../src/adapters/registry.js";
import type { CommerceAdapter } from "../src/adapters/interface.js";
import { CdpBazaarAdapter } from "../src/adapters/cdp-bazaar/index.js";
import { Agent402Adapter } from "../src/adapters/agent402/index.js";
import { PipRailAdapter } from "../src/adapters/piprail/index.js";
import { AgentBountiesAdapter } from "../src/adapters/agent-bounties/index.js";
import { BountyBookAdapter } from "../src/adapters/bountybook/index.js";
import { TryBountyAdapter } from "../src/adapters/trybounty/index.js";
import { The402Adapter } from "../src/adapters/the402/index.js";
import { PayShAdapter } from "../src/adapters/paysh/index.js";
import { aggregateWork } from "../src/aggregate/work.js";
import {
  evaluateRevenueWork,
  type RevenueEvaluationOptions,
} from "../src/revenue/work-opportunity.js";
import { evaluateProfitEconomics } from "../src/revenue/profit-economics.js";
import { STRICT_ZERO_COST_SOURCE_PROFILES } from "../src/revenue/source-policy.js";
import { assessBountyBookReliability } from "../src/revenue/bountybook-reliability.js";

const config = loadConfig(process.env);
const adapters: CommerceAdapter[] = [
  new CdpBazaarAdapter(config.adapters.cdp_bazaar.baseUrl),
  new Agent402Adapter(config.adapters.agent402.baseUrl),
  new PipRailAdapter(),
  new AgentBountiesAdapter(config.adapters.agent_bounties.baseUrl),
  new BountyBookAdapter(),
  new TryBountyAdapter(config.adapters.trybounty.baseUrl),
  new The402Adapter(config.adapters.the402.baseUrl),
  new PayShAdapter(),
];

async function readBountyBookReliability(): Promise<
  ReturnType<typeof assessBountyBookReliability> & { readonly httpStatus: number | null }
> {
  try {
    const response = await fetch("https://api.bountybook.ai/oracle/stats", {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(10_000),
    });
    let body: unknown = null;
    if (response.ok) {
      try {
        body = await response.json();
      } catch {
        body = null;
      }
    }
    return Object.freeze({
      ...assessBountyBookReliability(body),
      httpStatus: response.status,
    });
  } catch {
    return Object.freeze({
      ...assessBountyBookReliability(null),
      httpStatus: null,
    });
  }
}

const bountybookReliability = await readBountyBookReliability();
const bountybookSuppressed = bountybookReliability.pursuitSuppressed;

const revenueOptions: RevenueEvaluationOptions = {
  minRewardUsd: 1,
  minAutomationFraction: 0.5,
  // Small, known execution costs are acceptable when the expected net profit
  // and downside limits justify them. Unknown costs are still blocked by the
  // profit layer below.
  zeroUpfrontOnly: false,
  requireKnownZeroUpfront: false,
  avoidKycRequired: true,
  excludeIntegrityRisk: true,
  sourceProfiles: STRICT_ZERO_COST_SOURCE_PROFILES,
  capabilities: [
    "research",
    "data",
    "analysis",
    "code",
    "automation",
    "lead",
    "prospect",
    "report",
    "dataset",
  ],
};

const registry = new AdapterRegistry(config, adapters);
const scanStartedAt = new Date().toISOString();
const discovered = await registry.discoverWork({ limit: 50, minReward: "1" });
const earnable = aggregateWork(discovered.results);

const evaluated = earnable.map((work) => {
  const revenue = evaluateRevenueWork(work, revenueOptions);
  const profit = evaluateProfitEconomics(work, revenue, {
    minExpectedNetProfitUsd: 3,
    minSuccessProbability: 0.5,
    maxLossIfNoPayoutUsd: 0.25,
    requireResolvedCosts: true,
  });
  return { work, revenue, profit };
});

function sourceReliabilityBlocked(source: string): boolean {
  return source === "bountybook" && bountybookSuppressed;
}

const pursuit = evaluated
  .filter(
    (entry) =>
      entry.revenue.eligible &&
      entry.profit.pursuitEligible &&
      !sourceReliabilityBlocked(entry.work.source),
  )
  .sort((a, b) => {
    const ap = a.profit.expectedNetProfitUsd ?? -1;
    const bp = b.profit.expectedNetProfitUsd ?? -1;
    if (bp !== ap) return bp - ap;
    if (b.profit.successProbability !== a.profit.successProbability) {
      return b.profit.successProbability - a.profit.successProbability;
    }
    return a.work.id < b.work.id ? -1 : a.work.id > b.work.id ? 1 : 0;
  });

const watchlist = evaluated
  .filter(
    (entry) =>
      entry.revenue.eligible &&
      (!entry.profit.pursuitEligible || sourceReliabilityBlocked(entry.work.source)),
  )
  .map((entry) => {
    const reliabilityBlocked = sourceReliabilityBlocked(entry.work.source);
    return {
      id: entry.work.id,
      source: entry.work.source,
      externalId: entry.work.externalId,
      title: entry.work.title,
      url: entry.work.url ?? null,
      rewardUsd: entry.revenue.rewardUsd,
      expectedRevenueUsd: entry.revenue.expectedRevenueUsd,
      successProbability: entry.profit.successProbability,
      expectedNetProfitUsd: entry.profit.expectedNetProfitUsd,
      lossIfNoPayoutUsd: entry.profit.lossIfNoPayoutUsd,
      blockers: [
        ...new Set([
          ...entry.profit.blockers,
          ...(reliabilityBlocked ? ["source_verifier_degraded"] : []),
        ]),
      ].sort(),
      flags: entry.profit.flags,
      sourceNotes: [
        ...entry.profit.sourceProfile.notes,
        ...(reliabilityBlocked ? [bountybookReliability.reason] : []),
      ],
    };
  });

const rejected = evaluated
  .filter((entry) => !entry.revenue.eligible)
  .map((entry) => ({
    id: entry.work.id,
    source: entry.work.source,
    externalId: entry.work.externalId,
    title: entry.work.title,
    url: entry.work.url ?? null,
    rewardUsd: entry.revenue.rewardUsd,
    blockers: entry.revenue.blockers,
    flags: entry.revenue.flags,
    sourceNotes: entry.revenue.sourceProfile.notes,
  }));

const payload = {
  schemaVersion: 3,
  mode: "A",
  policy: {
    boundedRiskMode: true,
    zeroUpfrontRequired: false,
    resolvedCostsRequired: true,
    minimumExpectedNetProfitUsd: 3,
    minimumSuccessProbability: 0.5,
    maximumLossIfNoPayoutUsd: 0.25,
    liveSourceReliabilityGate: true,
  },
  scanStartedAt,
  generatedAt: new Date().toISOString(),
  financialActionExecuted: false,
  externalMutationExecuted: false,
  sourceReliability: {
    bountybook: bountybookReliability,
  },
  sources: discovered.sources,
  counts: {
    discovered: discovered.results.length,
    earnable: earnable.length,
    pursuitEligible: pursuit.length,
    watchlist: watchlist.length,
    revenueRejected: rejected.length,
  },
  opportunities: pursuit.map((entry, index) => ({
    rank: index + 1,
    id: entry.work.id,
    source: entry.work.source,
    externalId: entry.work.externalId,
    title: entry.work.title,
    url: entry.work.url ?? null,
    reward: entry.work.reward,
    verifier: entry.work.verification.type,
    funding: entry.work.funding,
    advertisedRewardUsd: entry.profit.advertisedRewardUsd,
    successFeeUsd: entry.profit.successFeeUsd,
    attemptCostUsd: entry.profit.attemptCostUsd,
    netProfitOnSuccessUsd: entry.profit.netProfitOnSuccessUsd,
    expectedNetProfitUsd: entry.profit.expectedNetProfitUsd,
    lossIfNoPayoutUsd: entry.profit.lossIfNoPayoutUsd,
    successProbability: entry.profit.successProbability,
    automationFraction: entry.revenue.automationFraction,
    paymentConfidence: entry.revenue.paymentConfidence,
    acceptanceProbability: entry.revenue.acceptanceProbability,
    flags: [...entry.revenue.flags, ...entry.profit.flags],
    sourceNotes: [...entry.revenue.sourceProfile.notes, ...entry.profit.sourceProfile.notes],
  })),
  watchlist,
  rejected,
};

process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
