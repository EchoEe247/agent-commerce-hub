import assert from "node:assert/strict";
import test from "node:test";
import type { OpportunityEvaluationResultStore, PersistedOpportunityEvaluation } from "../src/opportunities/evaluation-results.js";
import type { OpportunityCandidate } from "../src/opportunities/models.js";
import { rankStoredOpportunities } from "../src/opportunities/ranking.js";
import type { OpportunityStore } from "../src/opportunities/store.js";

const opportunities: readonly OpportunityCandidate[] = [
  {
    id: "opp_ai",
    source: "reddit_rss",
    externalId: "ai",
    title: "[HIRING] Remote API automation",
    body: "Budget $150 per project. Need API integration. Remote.",
    observedAt: "2026-08-27T15:00:00.000Z",
    tags: ["reddit", "automation"],
    metadata: {},
  },
  {
    id: "opp_manual",
    source: "reddit_rss",
    externalId: "manual",
    title: "[HIRING] Remote operations partner",
    body: "Paid remote operations support.",
    observedAt: "2026-08-27T14:59:00.000Z",
    tags: ["reddit"],
    metadata: {},
  },
  {
    id: "opp_supply",
    source: "reddit_rss",
    externalId: "supply",
    title: "[FOR HIRE] Automation developer",
    body: "Available for projects. Remote.",
    observedAt: "2026-08-27T14:58:00.000Z",
    tags: ["reddit"],
    metadata: {},
  },
];

const opportunityStore: OpportunityStore = {
  async seenIds() {
    return new Set(opportunities.map((row) => row.id));
  },
  async saveMany() {
    throw new Error("ranking fixture is read-only");
  },
  async list(limit = 500) {
    return opportunities.slice(0, limit);
  },
};

function evaluation(
  opportunityId: string,
  evaluatorId: string,
  evaluatedAt: string,
  overrides: Partial<PersistedOpportunityEvaluation["evaluation"]> = {},
): PersistedOpportunityEvaluation {
  return {
    requestId: `req_${opportunityId}_${evaluatorId}_${evaluatedAt}`,
    opportunityId,
    evaluatorId,
    evaluatedAt,
    evaluation: {
      schemaVersion: 1,
      recommendation: "manual_review",
      executionRoute: "human_remote",
      risk: "medium",
      confidence: 0.5,
      estimatedEffortMinutes: null,
      economics: { payout: null, executionCost: null, margin: null },
      capabilities: { aiCanComplete: false, humanRequired: true, physicalPresence: false },
      reasons: ["fixture"],
      blockers: [],
      nextChecks: [],
      ...overrides,
    },
  };
}

function evaluationStore(rows: readonly PersistedOpportunityEvaluation[]): OpportunityEvaluationResultStore {
  return {
    async seenKeys() {
      return new Set();
    },
    async append() {
      throw new Error("ranking fixture is read-only");
    },
    async list(limit = 1_000) {
      return rows.slice(0, limit);
    },
  };
}

test("pursue/low-risk AI opportunity outranks manual-review work", async () => {
  const rows = [
    evaluation("opp_ai", "local-openai:hy3-free", "2026-08-27T15:01:00.000Z", {
      recommendation: "pursue",
      executionRoute: "ai_direct",
      risk: "low",
      confidence: 0.9,
      estimatedEffortMinutes: 60,
      economics: {
        payout: { minUsd: 150, maxUsd: null, basis: "observed" },
        executionCost: { minUsd: 0, maxUsd: 10, basis: "inferred" },
        margin: { minUsd: 140, maxUsd: 150, basis: "inferred" },
      },
      capabilities: { aiCanComplete: true, humanRequired: false, physicalPresence: false },
    }),
    evaluation("opp_manual", "local-openai:hy3-free", "2026-08-27T15:02:00.000Z"),
  ];
  const ranked = await rankStoredOpportunities(opportunityStore, evaluationStore(rows), { requireDemand: true });
  assert.equal(ranked[0]?.opportunity.id, "opp_ai");
  assert.equal(ranked[0]?.operatorAction, "review_for_pursuit");
  assert.equal(ranked[0]?.priorityBand, "high");
  assert.ok((ranked[0]?.score ?? 0) > (ranked[1]?.score ?? 0));
});

test("high-risk pursue and unresolved blockers are routed to manual review", async () => {
  const rows = [
    evaluation("opp_ai", "local-openai:hy3-free", "2026-08-27T15:01:00.000Z", {
      recommendation: "pursue",
      risk: "high",
      confidence: 0.8,
      blockers: ["counterparty identity not verified"],
    }),
  ];
  const ranked = await rankStoredOpportunities(opportunityStore, evaluationStore(rows), { requireDemand: true });
  assert.equal(ranked[0]?.operatorAction, "manual_review");
  assert.match(ranked[0]?.routingReasons.join(" ") ?? "", /high-risk|blocker/i);
});

test("current deterministic reject overrides a stale positive evaluation", async () => {
  const rows = [
    evaluation("opp_supply", "local-openai:hy3-free", "2026-08-27T15:01:00.000Z", {
      recommendation: "pursue",
      executionRoute: "ai_direct",
      risk: "low",
      confidence: 0.95,
      capabilities: { aiCanComplete: true, humanRequired: false, physicalPresence: false },
    }),
  ];
  const ranked = await rankStoredOpportunities(
    opportunityStore,
    evaluationStore(rows),
    { requireDemand: true },
    { actions: ["reject"] },
  );
  assert.equal(ranked.length, 1);
  assert.equal(ranked[0]?.operatorAction, "reject");
  assert.equal(ranked[0]?.score, 0);
  assert.equal(ranked[0]?.priorityBand, "blocked");
});

test("latest evaluation wins by default and evaluator filter can select an older model result", async () => {
  const older = evaluation("opp_ai", "local-openai:hy3-free", "2026-08-27T15:01:00.000Z", {
    recommendation: "manual_review",
  });
  const newer = evaluation("opp_ai", "local-openai:mimo-v2.5-free", "2026-08-27T15:03:00.000Z", {
    recommendation: "pursue",
    executionRoute: "ai_direct",
    risk: "low",
    confidence: 0.8,
    capabilities: { aiCanComplete: true, humanRequired: false, physicalPresence: false },
  });

  const latest = await rankStoredOpportunities(opportunityStore, evaluationStore([older, newer]), { requireDemand: true });
  assert.equal(latest[0]?.evaluationRecord.evaluatorId, "local-openai:mimo-v2.5-free");
  assert.equal(latest[0]?.operatorAction, "review_for_pursuit");

  const filtered = await rankStoredOpportunities(
    opportunityStore,
    evaluationStore([older, newer]),
    { requireDemand: true },
    { evaluatorId: "local-openai:hy3-free" },
  );
  assert.equal(filtered[0]?.evaluationRecord.evaluatorId, "local-openai:hy3-free");
  assert.equal(filtered[0]?.operatorAction, "manual_review");
});

test("minimum score and action filters are applied after ranking", async () => {
  const rows = [
    evaluation("opp_ai", "local-openai:hy3-free", "2026-08-27T15:01:00.000Z", {
      recommendation: "pursue",
      executionRoute: "ai_direct",
      risk: "low",
      confidence: 0.9,
      capabilities: { aiCanComplete: true, humanRequired: false, physicalPresence: false },
    }),
    evaluation("opp_manual", "local-openai:hy3-free", "2026-08-27T15:02:00.000Z"),
  ];
  const ranked = await rankStoredOpportunities(
    opportunityStore,
    evaluationStore(rows),
    { requireDemand: true },
    { actions: ["review_for_pursuit"], minimumScore: 60, limit: 1 },
  );
  assert.equal(ranked.length, 1);
  assert.equal(ranked[0]?.opportunity.id, "opp_ai");
});
