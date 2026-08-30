import assert from "node:assert/strict";
import test from "node:test";
import {
  createHumanFulfillmentLifecycleEvent,
  HUMAN_FULFILLMENT_EVENT_TYPES,
} from "../src/opportunities/human-fulfillment-lifecycle.js";

test("candidate qualification, assignment, decision and performance have durable lifecycle event types", () => {
  for (const expected of [
    "candidate_qualification_recorded",
    "assignment_recorded",
    "assignment_decision_recorded",
    "worker_performance_recorded",
  ] as const) {
    assert.ok(HUMAN_FULFILLMENT_EVENT_TYPES.includes(expected));
  }

  const qualification = createHumanFulfillmentLifecycleEvent({
    type: "candidate_qualification_recorded",
    opportunityId: "opp_1",
    occurredAt: "2026-08-30T12:00:00.000Z",
    contractId: "hcontract_1",
    candidateReference: "candidate-42",
    qualificationId: "hqual_1",
    note: "qualified",
  });
  assert.equal(qualification.qualificationId, "hqual_1");
  assert.equal(qualification.candidateReference, "candidate-42");

  const assignment = createHumanFulfillmentLifecycleEvent({
    type: "assignment_recorded",
    opportunityId: "opp_1",
    occurredAt: "2026-08-30T12:10:00.000Z",
    contractId: "hcontract_1",
    candidateReference: "candidate-42",
    qualificationId: "hqual_1",
    assignmentId: "hassign_1",
  });
  assert.equal(assignment.assignmentId, "hassign_1");

  const decision = createHumanFulfillmentLifecycleEvent({
    type: "assignment_decision_recorded",
    opportunityId: "opp_1",
    occurredAt: "2026-08-30T12:20:00.000Z",
    contractId: "hcontract_1",
    candidateReference: "candidate-42",
    assignmentId: "hassign_1",
    assignmentDecisionId: "hassigndec_1",
    note: "accepted",
  });
  assert.equal(decision.assignmentDecisionId, "hassigndec_1");

  const performance = createHumanFulfillmentLifecycleEvent({
    type: "worker_performance_recorded",
    opportunityId: "opp_1",
    occurredAt: "2026-08-31T18:00:00.000Z",
    contractId: "hcontract_1",
    candidateReference: "candidate-42",
    assignmentId: "hassign_1",
    reviewId: "review_1",
    performanceId: "hperf_1",
  });
  assert.equal(performance.performanceId, "hperf_1");
  assert.equal(performance.reviewId, "review_1");
});
