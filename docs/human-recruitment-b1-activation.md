# Human recruitment B1 activation

This document defines the first live external-write slice for human fulfillment.

The default Commerce Control posture remains fail-closed. General external writes, signing, wallet access, and live value movement remain disabled. The only B1 capability represented here is the ability to execute **one exact prepared human-recruitment post or contact intent**.

## Why exact-intent activation

A broad `EXTERNAL_WRITES_ENABLED=true` switch would be too powerful. It could accidentally authorize unrelated publication, claim, submission, or other external-write paths.

Human recruitment therefore uses two non-secret configuration values:

- `HUMAN_RECRUITMENT_B1_ENABLED=true`
- `HUMAN_RECRUITMENT_B1_APPROVED_INTENT_ID=hintent_<32 hex>`

The approved intent id must already have been produced from a frozen worker-facing payload. The config loader rejects activation without an exact id, rejects malformed ids, and rejects a stale id when the activation flag is off.

General `EXTERNAL_WRITES_ENABLED` remains forbidden.

## Operator flow

1. Build the human-fulfillment contract.
2. Build the worker-facing recruitment payload after verifying the target/community rules.
3. Prepare the recruitment action intent under the default configuration.
4. Confirm that the intent is blocked with `A_MODE_EXTERNAL_WRITE` and inspect its exact `hintent_...` id.
5. Explicitly approve **that exact id** in the runtime environment using the two B1 recruitment variables above.
6. Recreate/re-evaluate the same intent. Its id is stable because the id is derived from the immutable action, not from the policy result.
7. The central policy engine may then return `B1_HUMAN_RECRUITMENT_EXACT_INTENT` for that exact recruitment post/contact only.
8. A provider transport may execute the prepared worker-facing content and return an external reference.
9. Record the resulting receipt in the human-fulfillment lifecycle.
10. Remove/rotate the exact-intent activation before authorizing another external action.

## Isolation guarantees

The scoped grant does not authorize:

- another recruitment payload or target;
- another recruitment intent id;
- unrelated external writes such as publishing, claiming, or submitting upstream work;
- signer/key access;
- wallet access;
- worker compensation;
- x402 payment;
- any other live value movement.

Dangerous attributes still dominate policy evaluation. If an otherwise approved recruitment request asks for a signer or moves value, it is blocked before the recruitment grant is considered.

## Recruitment executor contract

`tools/hermes-commerce-control/src/opportunities/human-recruitment-executor.ts` defines the provider-neutral execution boundary.

A real transport must:

- declare the channel it serves;
- accept the exact prepared target/title/body;
- honor the supplied `idempotencyKey` (the intent id) so a retry does not create a duplicate post/message;
- return a durable external reference when execution succeeds.

The executor re-evaluates central policy at execution time. It also requires the target/community rules verification timestamp to be no more than seven days old.

The execution receipt records `externalMutationExecuted: true`, while explicitly recording that compensation and live value movement did **not** occur.

## Current limitation

This slice implements the authorization and provider-neutral execution boundary. It does **not** ship a credential-bearing Reddit, marketplace, browser, email, or DM transport in the repository. Those transports should be added only for a concrete channel we are ready to use, and they must consume the frozen payload/intent artifacts rather than reconstructing worker terms themselves.
