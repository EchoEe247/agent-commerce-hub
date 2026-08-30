# Human candidate qualification and assignment

This layer implements the pre-hire checks and assignment state that sit between worker recruitment and task execution.

It does not contact workers, hire anyone by itself, or move money. It consumes a financially viable frozen human-fulfillment contract and produces deterministic qualification, assignment, assignment-decision, and private worker-performance records.

Canonical module:

`tools/hermes-commerce-control/src/opportunities/human-candidate-assignment.ts`

## Candidate qualification

Each candidate receives a candidate-specific qualification plan. The plan contains explicit task requirements rather than a generic "looks suitable" score.

Requirement categories are:

- capability;
- equipment;
- credential;
- location;
- schedule;
- other.

Each requirement is either:

- `self_attestation`; or
- `evidence_required`.

Physical work cannot build a qualification plan without an explicit location requirement. This prevents a candidate from being marked qualified without confirming they can reach the verified task location/window.

The standard checks also require the candidate to state that they can meet the deadline, remain available for corrections/follow-up, communicate as required, and accept the stated compensation terms.

Qualification outcomes are:

- `qualified` — every hard requirement passed and all required qualification evidence is present;
- `needs_followup` — no hard failure exists, but an answer or required evidence is missing and can be corrected/clarified;
- `not_qualified` — the candidate explicitly cannot satisfy a task requirement or a standard execution condition.

`needs_followup` is intentionally distinct from rejection. An incomplete questionnaire should be corrected before the system decides that a worker cannot perform the task.

Qualification never starts execution and never authorizes payment.

## Assignment

Only a `qualified` candidate whose qualification belongs to the same contract/opportunity may receive an assignment.

The assignment begins as `offered`. It has an explicit acceptance deadline (`acceptBy`) that must be before the task deadline so the workflow preserves time to replace a candidate if necessary.

Assignment decisions are:

- `accepted` — execution may begin;
- `declined` — no execution; replacement allowed;
- `withdrawn` — no execution; replacement allowed;
- `expired` — no execution; replacement allowed.

A replacement assignment may record `replacesAssignmentId` so the history is explicit rather than overwriting the first worker attempt.

Worker acceptance still does not execute compensation. Payment remains a separate B2 financial action.

## Private worker performance history

After final task QA, the system can create a private worker-performance record using the existing human-fulfillment review outcome plus correction/communication/timeliness facts.

Future eligibility is deliberately nuanced:

- accepted work with normal communication/timing → `eligible`;
- good-faith work that did not pass final acceptance, or accepted work with material execution friction → `case_by_case`;
- unresolved suspicious evidence → `hold_for_manual_review`;
- review-established no meaningful effort or fraud → `do_not_reoffer`.

Suspicion is not silently converted into a fraud finding or permanent ban.

The record can note how many corrections were requested/completed, communication quality, timeliness, and a bounded private note. This gives future recruitment a factual reliability history without forcing every non-perfect task into the same category.

## Lifecycle persistence

`human-fulfillment-lifecycle.ts` now has durable event types for:

- candidate qualification;
- assignment;
- assignment decision;
- worker performance.

These events can reference the candidate, qualification, assignment, review, and performance records while preserving the existing append-only locked JSONL behavior.

## Current boundary

This layer is local decision/state machinery only. No Reddit/marketplace/direct transport is invoked, no worker is contacted, no compensation is promised or paid, and no production deployment is changed.
