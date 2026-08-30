import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { loadConfig } from "../src/config.js";
import type { HumanFulfillmentContractDraft } from "../src/opportunities/human-fulfillment.js";
import {
  buildHumanRecruitmentPayload,
  type HumanRecruitmentPayload,
} from "../src/opportunities/human-recruitment-adapters.js";
import { createHumanRecruitmentActionIntent } from "../src/opportunities/human-recruitment-intent.js";
import {
  createHumanFulfillmentLifecycleEvent,
  JsonlHumanFulfillmentLifecycleStore,
} from "../src/opportunities/human-fulfillment-lifecycle.js";

const CONTRACT: HumanFulfillmentContractDraft = {
  schemaVersion: 1,
  policyVersion: 1,
  contractId: "hcontract_test",
  recruitmentDraftId: "hrecruit_test",
  opportunityId: "opp_test",
  kind: "remote",
  terms: {
    workerReference: "candidate-17",
    taskBrief: "Verify ten storefront listings against the supplied checklist.",
    acceptanceCriteria: ["All ten listings checked", "Each discrepancy is documented"],
    evidenceRequirements: ["Return one completed checklist", "Include URLs for discrepancies"],
    fullCompensationUsd: 40,
    goodFaithAttemptCompensationUsd: 10,
    dueAt: "2026-08-31T18:00:00.000Z",
  },
  financial: {
    upstreamPayout: { minUsd: 100, maxUsd: null, basis: "observed" },
    grossMarginFloorUsd: 60,
    paymentAuthorizationReady: true,
    blockers: [],
  },
  compensationPolicy: {
    accepted: "full_agreed_compensation",
    goodFaithFailed: "contract_defined_partial_compensation",
    noMeaningfulEffort: "no_compensation",
    establishedFraud: "no_compensation",
    suspicious: "manual_review_no_automatic_denial",
  },
  boundary: {
    contractIsDraft: true,
    workerAcceptanceRequired: true,
    explicitFinancialAuthorizationRequired: true,
    paymentExecutionAllowed: false,
  },
};

function redditPayload(): HumanRecruitmentPayload {
  return buildHumanRecruitmentPayload(CONTRACT, {
    channel: "reddit",
    target: "r/forhire",
    rulesVerifiedAt: "2026-08-30T10:00:00.000Z",
  });
}

test("reddit adapter emits only frozen worker terms, not internal upstream economics or source metadata", () => {
  const payload = redditPayload();
  assert.equal(payload.channel, "reddit");
  assert.equal(payload.delivery, "public_post");
  assert.match(payload.rendered.title, /^\[HIRING\]/);
  assert.match(payload.rendered.body, /\$40\.00/);
  assert.match(payload.rendered.body, /\$10\.00/);
  const serialized = JSON.stringify(payload);
  assert.equal(serialized.includes("100"), false, "upstream payout must not leak into worker payload");
  assert.equal(serialized.includes("candidate-17"), false, "internal worker reference must not leak");
  assert.equal(payload.boundary.externalActionsAllowed, false);
});

test("direct adapter is private-message only", () => {
  const payload = buildHumanRecruitmentPayload(CONTRACT, {
    channel: "direct",
    target: "known-candidate",
    rulesVerifiedAt: "2026-08-30T10:00:00.000Z",
  });
  assert.equal(payload.delivery, "private_message");
  assert.throws(() =>
    buildHumanRecruitmentPayload(CONTRACT, {
      channel: "direct",
      target: "known-candidate",
      rulesVerifiedAt: "2026-08-30T10:00:00.000Z",
      delivery: "public_post",
    }),
  );
});

test("worker-facing payload is blocked when the economic case is not ready", () => {
  const blocked: HumanFulfillmentContractDraft = {
    ...CONTRACT,
    financial: {
      upstreamPayout: null,
      grossMarginFloorUsd: null,
      paymentAuthorizationReady: false,
      blockers: ["upstream total USD payout is not established"],
    },
  };
  assert.throws(() =>
    buildHumanRecruitmentPayload(blocked, {
      channel: "marketplace",
      target: "marketplace:test",
      rulesVerifiedAt: "2026-08-30T10:00:00.000Z",
    }),
  );
});

test("recruitment action intent reaches central policy and remains blocked in Mode A", () => {
  const intent = createHumanRecruitmentActionIntent(
    loadConfig({}),
    redditPayload(),
    () => "2026-08-30T10:05:00.000Z",
  );
  assert.equal(intent.action, "post");
  assert.equal(intent.decision.decision, "block");
  assert.equal(intent.decision.rule, "A_MODE_EXTERNAL_WRITE");
  assert.equal(intent.decision.reason, "EXTERNAL_WRITE_DISABLED");
  assert.equal(intent.boundary.externalMutationExecuted, false);
  assert.equal(intent.boundary.operatorApprovalRequired, true);
});

test("human fulfillment lifecycle is append-only, deduplicated and filterable", async () => {
  const root = await mkdtemp(join(tmpdir(), "human-lifecycle-"));
  const path = join(root, "events.jsonl");
  try {
    const store = new JsonlHumanFulfillmentLifecycleStore(path);
    const prepared = createHumanFulfillmentLifecycleEvent({
      type: "recruitment_payload_prepared",
      opportunityId: "opp_test",
      occurredAt: "2026-08-30T10:00:00.000Z",
      contractId: CONTRACT.contractId,
      payloadId: redditPayload().payloadId,
    });
    const candidate = createHumanFulfillmentLifecycleEvent({
      type: "candidate_recorded",
      opportunityId: "opp_test",
      occurredAt: "2026-08-30T10:10:00.000Z",
      candidateReference: "candidate-17",
    });
    assert.equal(await store.append(prepared), true);
    assert.equal(await store.append(prepared), false);
    assert.equal(await store.append(candidate), true);
    assert.equal((await store.list("opp_test")).length, 2);
    assert.equal((await store.list("different")).length, 0);
    const body = await readFile(path, "utf8");
    assert.equal(body.trim().split("\n").length, 2);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
