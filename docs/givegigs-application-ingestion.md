# GiveGigs Application Ingestion Bridge

Canonical implementation:

`tools/hermes-commerce-control/src/opportunities/givegigs-application-ingestion.ts`

This bridge closes the read-side gap after a GiveGigs recruitment task has been posted. It reads public GiveGigs task applications, turns each usable provider worker identity into the existing human-candidate identity model, and produces a candidate-specific derivative of the already-frozen worker contract.

It does **not** accept an application, mark a worker hired, send a message, qualify a worker automatically, create an assignment, or execute payment.

## Provider contract

GiveGigs' public API documentation was re-checked on 2026-08-30. It documents:

- `GET /api/ai/tasks/:taskId` as a no-auth read endpoint;
- task detail as including applications;
- write endpoints as API-key authenticated;
- application acceptance / hiring as a separate write-side action.

The reader therefore uses the repository's shared `SafeFetch` boundary and sends no credential header. The task detail endpoint is derived only from a validated GiveGigs public task URL in the expected `/ai/gigs/tasks/<taskId>` namespace. Provider-supplied URLs cannot redirect the reader to another host.

## Application normalization

A normalized application contains:

- the GiveGigs task id;
- the provider worker id;
- an optional provider application id;
- a deterministic internal application reference;
- the candidate reference `givegigs:worker:<workerId>`;
- optional provider status and application timestamp;
- optional bounded applicant message text.

Applicant text is untrusted input. It is not evidence of qualification and is not copied into lifecycle state by the candidate-record helper.

The parser tolerates a small set of documented/likely provider wrappers for worker/application identifiers, skips malformed individual rows, and fails closed if a non-empty applications response yields no usable worker identity. It also verifies a provider task id when the response supplies one.

## Candidate-specific frozen contract

Public recruitment necessarily occurs before a concrete marketplace applicant is known. The original recruitment contract may therefore carry a non-candidate placeholder worker reference while still freezing the actual worker-visible task terms.

`bindGiveGigsApplicationToContract(...)` creates a new deterministic contract whose only changed worker term is `workerReference`.

The following remain exactly unchanged:

- task brief;
- acceptance criteria;
- evidence requirements;
- full compensation;
- good-faith-attempt compensation;
- deadline;
- upstream payout and gross-margin state;
- compensation policy;
- payment/execution boundary.

The candidate-specific `contractId` is derived using the same canonical contract identity inputs: policy version, recruitment draft id, and frozen terms. The original template is not mutated.

A financially blocked template cannot be candidate-bound. Application discovery must not convert an economically invalid task into a recruitable worker contract.

## Existing qualification pipeline

After binding, the resulting contract is passed directly to the existing candidate qualification module:

```text
GiveGigs public task detail
        |
        v
normalized application
        |
        v
candidate-specific frozen contract
        |
        v
buildHumanCandidateQualificationPlan(...)
        |
        v
qualified | needs_followup | not_qualified
        |
        v
assignment only after qualified
```

An application is not a qualification. Marketplace profile claims, application text, or provider status cannot set `assignmentAllowed`, start execution, or establish payment eligibility.

## Lifecycle state

`createGiveGigsCandidateRecordedEvent(...)` writes only the durable linkage needed by the append-only human-fulfillment lifecycle:

- opportunity / candidate-specific contract;
- recruitment draft;
- candidate reference;
- deterministic GiveGigs application reference;
- bounded provider-status note when available.

Raw applicant messages are intentionally omitted from the lifecycle helper to reduce unnecessary persistence of untrusted/potentially sensitive text.

## Safety boundary

This slice is read-only at the provider boundary. It performs no authenticated GiveGigs request and no external mutation. Hiring/accepting an application remains a future scoped B1-style external-write concern, while worker compensation/value movement remains a separate B2 concern.

The intended next validation is a real, verified upstream opportunity: post one explicitly approved recruitment task, observe applications through this read bridge, bind one candidate, run the existing qualification/assignment flow, and only then consider a separately authorized provider-side hire action.
