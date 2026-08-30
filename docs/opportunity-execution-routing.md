# Opportunity Execution Routing

This layer turns already-ranked opportunities into an explicit execution path without performing any external action.

## Position in the revenue loop

```text
opportunity ingestion
        |
        v
triage + model evaluation
        |
        v
revenue ranking
        |
        v
execution routing
   /       |        \
  /        |         \
agent    human      hybrid
 direct  fulfillment
```

Canonical implementation:

`tools/hermes-commerce-control/src/opportunities/execution-routing.ts`

CLI:

```bash
npm run opportunities:route-execution -- --json
```

The command reads the existing local opportunity/evaluation stores and performs no Reddit request, model call, worker contact, job post, submission, acceptance, hiring action, or payment.

## Decisions

The deterministic output is one of:

- `agent_direct` — current pursue candidate can be executed by AI/automation without a human requirement;
- `human_fulfillment` — current pursue candidate requires a remote or physical human;
- `hybrid` — current pursue candidate needs both agent and human work;
- `manual_review` — current ranking gate, unknown/manual route, or capability contradiction prevents automatic routing;
- `watch` — opportunity remains outside execution;
- `reject` — opportunity is blocked from execution.

Execution routing never silently repairs a model contradiction. For example, `human_remote` with `humanRequired=false` is sent to `manual_review`.

## Human fulfillment plan

Human routes produce an **analysis-only** fulfillment plan. The first slice deliberately does not implement recruiting or payments.

The plan requires:

- a concrete task brief;
- explicit acceptance criteria;
- evidence of completion or attempted completion;
- completion review before full compensation;
- a worker quote;
- compensation authorization;
- verification of the selected platform/community rules before recruiting;
- an additional safety review for physical tasks.

The compensation outcome structure is intentionally policy-level rather than a hard-coded dollar formula:

- accepted completion → full agreed compensation after acceptance;
- documented good-faith attempt that fails acceptance → contract-defined partial compensation after review;
- no meaningful effort or established fraud → no compensation after review;
- suspicious/red-flag cases require review rather than an automatic denial based only on suspicion.

No worker compensation amount is invented. The router only carries forward the evaluator's bounded `executionCost` estimate when one exists.

## Commercial readiness

A human plan records one readiness state:

- `economic_case_present` — payout, execution-cost estimate, and positive margin are present;
- `needs_total_payout` — no established total USD payout exists;
- `needs_worker_quote` — total payout exists but worker cost is not established;
- `needs_margin_review` — payout and cost exist but a margin is not established;
- `nonpositive_margin` — the recorded minimum margin is zero or negative.

These states are evidence for later pursuit/recruiting logic. They do not authorize a post, hire, or payment.

## Current safety boundary

This implementation is Mode-A analysis only:

- no external writes;
- no worker recruitment;
- no task claim/submission;
- no wallet/signing action;
- no payment promise;
- no payment execution;
- no automatic fraud adjudication;
- no production seller or Render changes.

A later recruiter adapter should consume this plan rather than bypassing the existing opportunity/ranking/policy machinery.
