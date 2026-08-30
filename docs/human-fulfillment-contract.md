# Human Recruitment and Fulfillment Contract Core

This layer turns a routed human/hybrid opportunity into a controlled recruitment draft, freezes worker-facing terms into a deterministic contract draft, and records the QA outcome that determines what compensation the contract says is due.

It does **not** publish a worker listing, contact a worker, accept a worker, authorize payment, or execute payment.

Canonical implementation:

`tools/hermes-commerce-control/src/opportunities/human-fulfillment.ts`

## Flow

```text
ranked opportunity
       |
       v
execution routing
       |
       +---- agent_direct ------> agent execution path
       |
       +---- human/hybrid
                 |
                 v
        recruitment draft
                 |
        worker quote/candidate
                 |
                 v
       frozen contract draft
                 |
             execution
                 |
                 v
        evidence + QA review
                 |
       +---------+----------+----------------+----------------+
       |                    |                |                |
    accepted          good-faith failed   no effort     suspicious/fraud
       |                    |                |                |
   full due            partial due          0        review / 0 if established
```

## Recruitment draft

`buildHumanRecruitmentDraft(...)` accepts an already-ranked opportunity and its `OpportunityExecutionPlan`.

Requirements:

- execution decision must be `human_fulfillment` or `hybrid`;
- evaluation must still be current;
- route/capability contradictions have already been prevented by execution routing.

Default candidate-discovery channels are `reddit` and `marketplace`; `direct` and `other` are also representable. These are planning labels only. No channel adapter is invoked.

The draft separates internal economics from worker-facing material. The worker-facing outline deliberately excludes upstream buyer payout, source title, internal margin, model score/risk labels, evaluator reasoning, and raw opportunity body.

Before any later post/contact can be enabled, the workflow must establish exact task scope, acceptance criteria, timeline, worker identity, agreed compensation, and target-platform rules. Physical work also requires location/logistics/safety review.

## Fulfillment contract draft

`buildHumanFulfillmentContractDraft(...)` freezes worker reference, exact task brief, acceptance criteria, evidence requirements, full compensation, a smaller positive good-faith-attempt compensation amount, and an optional due timestamp.

The good-faith amount must be greater than zero and lower than full compensation. This prevents a later failed-attempt review from inventing or renegotiating the partial payment after the worker has already done the work.

### Margin gate

When an upstream total USD payout is known, the contract computes the gross margin floor:

`upstream payout floor - full worker compensation`

If that value is zero or negative, `paymentAuthorizationReady` is false. If upstream total payout is unknown, payment authorization is also blocked.

This is only a worker-compensation gross-margin check; it does not claim to include every possible business cost.

## QA and compensation review

`reviewHumanFulfillmentAttempt(...)` requires an explicit reviewed outcome plus evidence summary. It does not infer fraud or poor effort automatically.

Supported outcomes:

- `accepted` → full agreed compensation is due;
- `good_faith_failed` → the pre-agreed partial compensation is due;
- `no_meaningful_effort` → zero compensation after explicit review;
- `established_fraud` → zero compensation after explicit review; mere suspicion is insufficient;
- `suspicious` → manual review, with no automatic denial and no amount decided yet.

Every review record keeps `paymentExecutionAllowed: false`. A later financial action still requires explicit authorization and a separate payment implementation.

## Current boundary

This slice is intentionally pre-live: no Reddit/marketplace post, DM/email/contact, worker onboarding, worker acceptance mutation, wallet/signing, payment promise from the runtime, payment execution, Render change, or production seller change.

The next external-action layer should consume these frozen artifacts rather than rebuilding scope, economics, or compensation rules inside each platform adapter.
