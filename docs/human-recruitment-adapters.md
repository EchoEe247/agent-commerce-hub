# Human Recruitment Adapters and Lifecycle

This slice turns frozen human-fulfillment contract terms into worker-facing recruitment content while preserving the current Mode-A external-action boundary.

## Implemented

`tools/hermes-commerce-control/src/opportunities/human-recruitment-adapters.ts` renders channel-specific preparation payloads for:

- Reddit-style public posts;
- generic marketplace listings;
- direct/private outreach;
- other/custom recruitment surfaces.

The renderer consumes the frozen `HumanFulfillmentContractDraft`. It does not consume raw opportunity bodies or model/evaluator output.

Worker-facing payloads include only the terms a worker needs to evaluate the task: scope, acceptance criteria, evidence requirements, full compensation, pre-agreed good-faith-attempt compensation, and deadline when present.

They deliberately exclude upstream buyer payout, internal margin, source listing title/body, ranking score, model risk labels/reasons, and internal worker references.

A worker-facing payload cannot be produced when the contract's economic gate is blocked. The upstream total payout must already support positive gross margin after full worker compensation.

## External-action boundary

`human-recruitment-intent.ts` converts a prepared payload into an immutable `post` or `contact` intent and sends that intent through the central policy engine as `EXTERNAL_WRITE`.

In the current Mode-A runtime the result is therefore blocked by `A_MODE_EXTERNAL_WRITE` / `EXTERNAL_WRITE_DISABLED`.

The module contains no HTTP client, Reddit client, marketplace client, email sender, DM sender, browser automation, or other mutation executor. `externalMutationExecuted` is literal `false`.

This is intentional: the system can now prepare the exact external action and record why it cannot execute it yet, without weakening the existing B1 activation boundary.

## Persistent lifecycle

`human-fulfillment-lifecycle.ts` provides an append-only JSONL event store for human fulfillment activity. Supported event classes are:

- `recruitment_payload_prepared`;
- `external_action_intent_prepared`;
- `candidate_recorded`;
- `contract_recorded`;
- `worker_acceptance_recorded`;
- `attempt_evidence_recorded`;
- `review_recorded`.

Events are schema validated, deterministically identified, deduplicated by event ID, guarded by the existing file-lock helper, and tolerant of corrupt legacy lines. Crash-truncated final records are repaired before append using the same append-boundary approach as the opportunity store.

The lifecycle is local state only. Recording that an operator observed a candidate, acceptance, attempt, or review does not itself contact a worker, authorize money movement, or prove an external platform action occurred.

## Remaining activation gap

A future B1 recruitment implementation may consume these prepared payloads and intents, but it must add a real operator-authorization mechanism and a narrowly scoped external adapter. B1 should not be simulated by changing the intent's policy class or by bypassing `evaluatePolicy`.

Worker payment remains a separate B2/value-movement concern and is not enabled by this slice.
