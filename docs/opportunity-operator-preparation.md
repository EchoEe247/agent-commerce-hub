# Opportunity operator preparation

This layer turns already-ranked opportunities into compact, offline preparation packets for an operator. It is intentionally **not** an execution or outreach layer.

From `tools/hermes-commerce-control`:

```bash
npm run opportunities:prepare-operator -- --json
```

A typical model-pinned run:

```bash
npm run opportunities:prepare-operator -- \
  --profile demand \
  --evaluator local-openai:hy3-free \
  --action review_for_pursuit \
  --action manual_review \
  --limit 25 \
  --json
```

The command reads the same persisted opportunity/evaluation state as the ranking layer. It does not fetch Reddit, invoke a model, consume provider quota, contact a poster, claim/accept work, submit work, hire a worker, or move money.

## What a packet contains

Each preparation packet includes:

- a stable `opprep_*` packet ID;
- compact opportunity identity/title/source URL facts;
- current rank score, priority band, current request ID, evaluator provenance, and execution route;
- recommendation, risk, confidence, effort estimate, economics, capabilities, and model reasons;
- deterministic required checks assembled from blockers, evaluator `nextChecks`, triage caution signals, and missing compensation/source facts;
- route-specific delivery considerations;
- a readiness state and next **safe** operator step;
- an explicit boundary showing that external actions are not authorized.

## Readiness states

- `needs_checks` — unresolved checks must be completed before an operator decision.
- `needs_operator_review` — the model/routing layer requested manual review even though no concrete check remains in the packet.
- `ready_for_operator_decision` — the current ranked state has no unresolved checks; this means only that an operator may decide whether to proceed to a later approval stage.

`ready_for_operator_decision` never means “contact automatically” or “accept automatically.”

## Next safe steps

The packet emits one of:

- `resolve_checks`
- `operator_review`
- `operator_decision`

These are internal preparation states. They do not perform external mutations.

## Approval boundary

Every packet has:

```json
{
  "externalActionsAllowed": false,
  "requiresExplicitApprovalBefore": [
    "contact_counterparty",
    "claim_or_accept_work",
    "submit_work",
    "hire_worker",
    "send_or_receive_payment"
  ]
}
```

A later implementation may prepare drafts or execution plans, but crossing any of those boundaries must remain a separate explicit approval/policy action.

## Selection semantics

Only ranked rows with operator action `review_for_pursuit` or `manual_review` are eligible for preparation packets. `watch` and `reject` rows are intentionally excluded.

The ranking layer still owns freshness, current-request matching, semantic evaluation replay validation, evaluator filtering, and age gating. Operator preparation consumes those validated ranked rows rather than creating a second source of truth.
