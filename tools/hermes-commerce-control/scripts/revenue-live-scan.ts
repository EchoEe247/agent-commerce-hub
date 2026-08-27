#!/usr/bin/env node
/**
 * Read-only live revenue scan.
 *
 * Queries the already-supported public work adapters, keeps only currently
 * earnable work, then applies the revenue-first evaluator. It never prepares or
 * broadcasts a claim, sends credentials, signs anything, or moves value.
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
  rankRevenueWork,
  type RevenueEvaluationOptions,
} from "../src/revenue/work-opportunity.js";
import { STRICT_ZERO_COST_SOURCE_PROFILES } from "../src/revenue/source-policy.js";

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

const revenueOptions: RevenueEvaluationOptions = {
  minRewardUsd: 1,
  minAutomationFraction: 0.5,
  zeroUpfrontOnly: true,
  requireKnownZeroUpfront: true,
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
const ranked = rankRevenueWork(earnable, revenueOptions);
const rejected = earnable
  .map((work) => ({ work, revenue: evaluateRevenueWork(work, revenueOptions) }))
  .filter((entry) => !entry.revenue.eligible)
  .map((entry) => ({
    id: entry.work.id,
    source: entry.work.source,
    title: entry.work.title,
    rewardUsd: entry.revenue.rewardUsd,
    blockers: entry.revenue.blockers,
    flags: entry.revenue.flags,
    sourceNotes: entry.revenue.sourceProfile.notes,
  }));

const payload = {
  schemaVersion: 1,
  mode: "A",
  policy: "strict-zero-upfront",
  scanStartedAt,
  generatedAt: new Date().toISOString(),
  financialActionExecuted: false,
  externalMutationExecuted: false,
  sources: discovered.sources,
  counts: {
    discovered: discovered.results.length,
    earnable: earnable.length,
    revenueEligible: ranked.length,
    rejected: rejected.length,
  },
  opportunities: ranked.map((entry, index) => ({
    rank: index + 1,
    id: entry.work.id,
    source: entry.work.source,
    externalId: entry.work.externalId,
    title: entry.work.title,
    url: entry.work.url ?? null,
    reward: entry.work.reward,
    verifier: entry.work.verification.type,
    funding: entry.work.funding,
    expectedRevenueUsd: entry.revenue.expectedRevenueUsd,
    automationFraction: entry.revenue.automationFraction,
    paymentConfidence: entry.revenue.paymentConfidence,
    acceptanceProbability: entry.revenue.acceptanceProbability,
    score: entry.revenue.breakdown.total,
    flags: entry.revenue.flags,
    sourceNotes: entry.revenue.sourceProfile.notes,
  })),
  rejected,
};

process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
