# Opportunity pursuit dossiers

The pursuit-dossier layer turns already-ranked, already-evaluated operator packets into a compact internal dossier for deciding what to do next. It remains **offline and preparation-only**.

From `tools/hermes-commerce-control`:

```bash
npm run opportunities:prepare-pursuit -- --json
```

A model-pinned automation-focused run:

```bash
npm run opportunities:prepare-pursuit -- \
  --profile automation-remote \
  --evaluator local-openai:hy3-free \
  --action review_for_pursuit \
  --action manual_review \
  --limit 25 \
  --json
```

The command reads persisted opportunity and evaluation state, reuses the existing ranking and operator-preparation gates, and emits dossiers only for rows already eligible for operator preparation.

It does **not** fetch Reddit, invoke a model, consume provider quota, contact a poster, claim/accept work, submit work, hire a worker, or move money.

## Dossier contents

Each dossier contains:

- a stable `opdos_*` ID derived from the complete compact operator packet plus the dossier policy version, so any material packet/evaluation/provenance change produces a new dossier identity;
- compact source identity/title/community/URL facts, without the raw listing body;
- current rank score, priority band, operator action, execution route, request/evaluator provenance, and routing reasons;
- payout, execution-cost, and margin state with explicit known/unknown flags;
- an execution-preparation plan appropriate to AI, remote-human, physical-human, hybrid, manual, or unknown routes;
- controlled deterministic verification checks and a count of upstream operator-packet checks that still require review;
- a contact **brief** for later operator drafting, not a sent message;
- the inherited external-action approval boundary.

Evaluator `reasons`, `blockers`, and `nextChecks` are not copied into the dossier or contact brief. If upstream model-assisted checks exist, the dossier records only their count and points the operator back to the source operator packet. This prevents model-echoed listing text or prompt-injection content from flowing into a future drafting stage.

## Dossier status

- `blocked_on_checks` — unresolved checks remain. Safe next step: `resolve_checks`.
- `operator_review_required` — no concrete deterministic check remains, but routing/model state still requires manual review. Safe next step: `review_dossier`.
- `ready_for_pursuit_decision` — current state is internally ready for an operator to decide whether a contact draft should be prepared. Safe next step: `decide_whether_to_prepare_contact`.

Route/capability contradictions are converted into blocking deterministic checks. For example, `ai_direct` cannot be treated as decision-ready when the evaluation simultaneously says a human is required or AI cannot complete the work.

None of these states authorizes external activity.

## Contact brief

A dossier includes a bounded contact brief with one of three states:

- `operator_review_blocked` — manual review or a route/capability inconsistency must be resolved before a draft-ready state;
- `clarification_draft_ready` — unresolved facts should be clarified before commitment;
- `operator_draft_ready` — the internal state is ready for an operator-reviewed draft.

The brief contains only controlled drafting facts/questions derived from structured state. It does not copy evaluator free text. It deliberately does not carry the raw Reddit body and always sets:

```json
{
  "requiresOperatorReview": true,
  "sendAllowed": false
}
```

Any future actual message must remain behind a separate explicit approval/policy boundary.

## External-action boundary

The upstream operator packet remains authoritative:

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

The dossier layer cannot weaken this boundary.

## Why this layer exists

Ranking answers **which opportunities deserve attention**. Operator packets answer **what must be checked before a decision**. Pursuit dossiers answer **how to prepare for that decision**: economics, execution path, verification work, and a safe contact brief in one deterministic artifact.

A later layer may resolve checks or create an operator-reviewed contact draft, but it must not silently convert internal readiness into external authorization.
