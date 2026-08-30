# Human attempt, correction, and replacement orchestration

This layer connects an accepted human assignment to bounded execution follow-up without changing the frozen worker contract or deciding compensation prematurely.

Canonical module:

`tools/hermes-commerce-control/src/opportunities/human-attempt-orchestration.ts`

It is local decision/state machinery. It does not contact a worker, perform a correction request remotely, replace a worker on an external platform, or move money.

## Attempt submission

A worker attempt can be recorded only after the same candidate has explicitly accepted the same assignment and contract.

An attempt records:

- deterministic attempt id;
- assignment / contract / opportunity / candidate identity;
- attempt number;
- submission timestamp;
- whether it missed the frozen task deadline;
- bounded evidence summary;
- optional evidence references;
- optional bounded note.

The attempt cannot mutate the frozen contract and cannot execute payment.

## Attempt assessment

One submitted attempt can be assessed as:

- `accepted`;
- `correction_required`;
- `worker_failed`;
- `manual_review`;
- `external_blocker`.

`accepted` recommends the existing final review outcome `accepted`, but does not itself decide compensation.

`correction_required` requires at least one concrete deficiency and allows a bounded correction request.

`worker_failed` may justify considering replacement, but deliberately does **not** choose between `good_faith_failed`, `no_meaningful_effort`, or another compensation outcome. The existing evidence-backed final review remains authoritative for that decision.

`manual_review` maps to the existing `suspicious` review path and does not automatically establish worker fault, fraud, non-payment, or replacement.

`external_blocker` identifies a blocker caused by the operator, upstream counterparty, site/access conditions, or another external party. It does not establish worker fault.

## Frozen correction requests

A correction request is allowed only from a `correction_required` assessment.

Each request freezes:

- the exact deficiencies being corrected;
- correction number;
- maximum pre-set correction cycles;
- request time;
- correction deadline;
- a hash of the original frozen task brief, acceptance criteria, evidence requirements, full compensation, good-faith-attempt compensation, and task deadline.

The correction deadline must be after the request and cannot extend beyond the original frozen task deadline.

The boundary explicitly records:

- `newScopeAllowed: false`;
- `compensationChangeAllowed: false`;
- `paymentExecutionAllowed: false`.

This prevents a correction from silently becoming unpaid scope expansion or a retroactive compensation change.

## Correction response

A correction response records bounded evidence against one correction request and marks whether the response was late.

A correction response never self-certifies task completion. It requires a fresh attempt assessment before the workflow can proceed to final review.

## External blockers and good-faith attempts

External blocker records separate worker performance from operator/upstream/site failures.

If a good-faith attempt is documented, the record recommends the existing `good_faith_failed` review path, which uses the compensation amount already frozen in the contract.

If no good-faith attempt is documented, the record stays on the existing manual/suspicious review path rather than inventing worker fault.

External blocker records explicitly disallow worker-performance penalties from the blocker itself.

## Replacement authorization

Replacement is an explicit local authorization record. Supported reasons are:

- `assignment_declined`;
- `assignment_withdrawn`;
- `assignment_expired`;
- `worker_cannot_continue`;
- `correction_deadline_expired`;
- `correction_cycles_exhausted`;
- `no_meaningful_effort_established`.

The reason must match the underlying state. Examples:

- an `assignment_declined` replacement requires an actual declined assignment decision;
- `correction_deadline_expired` requires an accepted assignment, the matching correction request, and an authorization time after its correction deadline;
- `correction_cycles_exhausted` requires the matching request to have reached its pre-set maximum cycle count;
- `no_meaningful_effort_established` requires the existing final review to contain that exact evidence-backed outcome.

Replacement never changes the current worker's compensation outcome. Compensation remains governed by the frozen contract plus final review.

## Lifecycle persistence

`human-fulfillment-lifecycle.ts` supports durable references/events for:

- attempt submission;
- attempt assessment;
- correction request;
- correction response;
- external blocker;
- replacement authorization.

These extend the existing append-only, deterministic, file-locked lifecycle rather than creating a second execution store.

## Current boundary

This layer does not create a credential-bearing worker transport and does not execute any external worker mutation. It also does not enable B2 or worker payment.

The intended human execution path is:

`qualified candidate → assignment accepted → attempt → assessment → correction loop when justified → final review → performance history / replacement as appropriate`

External recruitment/contact and worker payment remain separate explicitly authorized concerns.