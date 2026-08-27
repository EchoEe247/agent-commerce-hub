import assert from "node:assert/strict";
import test from "node:test";
import { buildOpportunityEvaluationPacket } from "../src/opportunities/evaluation.js";
import { buildPreparedOpportunityEvaluation } from "../src/opportunities/evaluation-queue.js";
import type { PersistedOpportunityEvaluation } from "../src/opportunities/evaluation-results.js";
import type { OpportunityCandidate } from "../src/opportunities/models.js";
import { prepareOpportunityOperatorPacket } from "../src/opportunities/operator-packet.js";
import {
  buildOpportunityPursuitDossier,
  buildOpportunityPursuitDossiers,
} from "../src/opportunities/pursuit-dossier.js";
import { rankOpportunity } from "../src/opportunities/ranking.js";
import { triageOpportunity } from "../src/opportunities/triage.js";

const candidate: OpportunityCandidate = {
  id: "opp_dossier",
  source: "reddit_rss",
  externalId: "dossier",
  title: "[HIRING] Remote API automation",
  body: "Need API integration. Budget $200. Remote.",
  url: "https://www.reddit.com/r/forhire/comments/example/dossier/",
  community: "forhire",
  observedAt: "2026-08-27T15:00:00.000Z",
  tags: ["reddit", "automation"],
  metadata: {},
};

function operatorPacket(
  overrides: Partial<PersistedOpportunityEvaluation["evaluation"]> = {},
) {
  const triage = triageOpportunity(candidate, { requireDemand: true });
  const evaluationPacket = buildOpportunityEvaluationPacket(candidate, triage);
  const requestId = buildPreparedOpportunityEvaluation(evaluationPacket).requestId;
  const record: PersistedOpportunityEvaluation = {
    requestId,
    opportunityId: candidate.id,
    evaluatorId: "local-openai:hy3-free",
    evaluatedAt: "2026-08-27T15:05:00.000Z",
    evaluation: {
      schemaVersion: 1,
      recommendation: "manual_review",
      executionRoute: "human_remote",
      risk: "medium",
      confidence: 0.5,
      estimatedEffortMinutes: null,
      economics: { payout: null, executionCost: null, margin: null },
      capabilities: { aiCanComplete: false, humanRequired: true, physicalPresence: false },
      reasons: ["scope and economics need clarification"],
      blockers: [],
      nextChecks: ["Confirm scope and acceptance criteria"],
      ...overrides,
    },
  };
  return prepareOpportunityOperatorPacket(rankOpportunity(candidate, triage, record, requestId));
}

test("dossier preserves checks and blocks pursuit while economics are unresolved", () => {
  const dossier = buildOpportunityPursuitDossier(operatorPacket());
  assert.match(dossier.dossierId, /^opdos_[a-f0-9]{32}$/);
  assert.equal(dossier.status, "blocked_on_checks");
  assert.equal(dossier.safeNextStep, "resolve_checks");
  assert.equal(dossier.economics.payoutKnown, false);
  assert.equal(dossier.economics.executionCostKnown, false);
  assert.equal(dossier.economics.marginKnown, false);
  assert.equal(dossier.verification.blocking, true);
  assert.match(dossier.verification.requiredChecks.join(" "), /compensation and payment terms/i);
  assert.match(dossier.verification.requiredChecks.join(" "), /execution cost/i);
  assert.equal(dossier.contactBrief.status, "clarification_draft_ready");
  assert.equal(dossier.contactBrief.sendAllowed, false);
  assert.equal(dossier.boundary.externalActionsAllowed, false);
});

test("clean pursue state can become decision-ready but never send-authorized", () => {
  const dossier = buildOpportunityPursuitDossier(
    operatorPacket({
      recommendation: "pursue",
      executionRoute: "ai_direct",
      risk: "low",
      confidence: 0.9,
      estimatedEffortMinutes: 45,
      economics: {
        payout: { minUsd: 200, maxUsd: null, basis: "observed" },
        executionCost: { minUsd: 0, maxUsd: 10, basis: "inferred" },
        margin: { minUsd: 190, maxUsd: 200, basis: "inferred" },
      },
      capabilities: { aiCanComplete: true, humanRequired: false, physicalPresence: false },
      blockers: [],
      nextChecks: [],
    }),
  );
  assert.equal(dossier.status, "ready_for_pursuit_decision");
  assert.equal(dossier.safeNextStep, "decide_whether_to_prepare_contact");
  assert.equal(dossier.verification.blocking, false);
  assert.equal(dossier.contactBrief.status, "operator_draft_ready");
  assert.equal(dossier.contactBrief.sendAllowed, false);
  assert.equal(dossier.boundary.externalActionsAllowed, false);
});

test("dossier identity is stable and changes when required checks change", () => {
  const first = buildOpportunityPursuitDossier(operatorPacket());
  const second = buildOpportunityPursuitDossier(operatorPacket());
  const changed = buildOpportunityPursuitDossier(
    operatorPacket({ nextChecks: ["Confirm a different requirement"] }),
  );
  assert.equal(first.dossierId, second.dossierId);
  assert.notEqual(first.dossierId, changed.dossierId);
});

test("dossier does not carry the raw listing body", () => {
  const dossier = buildOpportunityPursuitDossier(operatorPacket());
  assert.equal("body" in dossier.opportunity, false);
  assert.doesNotMatch(JSON.stringify(dossier), /Need API integration\. Budget \$200/);
});

test("batch builder respects zero and positive limits", () => {
  const packet = operatorPacket();
  assert.deepEqual(buildOpportunityPursuitDossiers([packet], 0), []);
  assert.equal(buildOpportunityPursuitDossiers([packet], 1).length, 1);
});
