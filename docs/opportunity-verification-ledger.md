# Opportunity verification ledger

The verification layer sits after current evaluation, ranking, operator preparation, and pursuit-dossier generation. It turns each controlled dossier check into a stable `opcheck_*` item with an explicit resolution mode and effective state.

It remains local and preparation-only. Nothing in this layer contacts a poster, fetches a listing, calls a model, claims work, submits work, hires an executor, sends/receives payment, or authorizes an external action.

## Build verification plans

From `tools/hermes-commerce-control`:

```bash
npm run opportunities:verification-plan -- \
  --profile demand \
  --evaluator local-openai:hy3-free \
  --json
```

The default resolution ledger is:

```text
~/.hermes/commerce-control/opportunity-verifications.jsonl
```

The command reads that ledger if it exists but does not write it.

## Check states

Each controlled check is classified into a bounded kind and resolution mode. Effective states are:

- `resolved` — compatible evidence with outcome `satisfied` exists for the current dossier/check identity;
- `failed` — compatible evidence explicitly failed the check;
- `requires_external_verification` — source/counterparty evidence is still required;
- `unresolved` — operator review or a local calculation/estimate is still required;
- `blocked_by_dependencies` — a derived check such as margin is waiting on prerequisite checks.

Current check kinds include upstream operator review, compensation terms, execution cost, margin, execution route, source listing, and route/capability consistency.

Verification policy version 2 rotates `opcheck_*` identities from the initial ledger policy and hardens derived-check semantics.

## Evidence compatibility

Evidence is intentionally check-specific:

- upstream/operator/route checks accept `operator_attestation`;
- compensation terms accept `source_reference` or `counterparty_confirmation`;
- execution cost accepts `calculation` or `executor_quote`;
- margin accepts `calculation`;
- source-listing verification accepts `source_reference`.

An executor quote therefore cannot satisfy buyer compensation terms, and an operator attestation cannot masquerade as source verification.

External evidence kinds (`source_reference`, `executor_quote`, `counterparty_confirmation`) require a non-empty reference. A `source_reference` must specifically be a credential-free HTTP(S) URL; quote and counterparty-confirmation references may be opaque local receipt/reference IDs.

## Derived calculations

A derived check is not allowed to become resolved merely because a calculation record exists. The plan resolves prerequisite checks first.

When all prerequisites are resolved, the derived check exposes `currentDependencyResolutionIds`. A calculation must be recorded **after** those prerequisite records and bind to that exact set of resolution IDs:

```bash
npm run opportunities:record-verification -- \
  --dossier-id opdos_... \
  --check-id opcheck_margin_... \
  --outcome satisfied \
  --evidence-kind calculation \
  --depends-on-resolution-id opver_compensation_... \
  --depends-on-resolution-id opver_execution_cost_... \
  --note 'Margin recalculated from the currently verified compensation and execution cost.' \
  --json
```

Dependency ID order does not matter; the recorder canonicalizes it. A calculation recorded before its prerequisites, missing their IDs, or tied to stale prerequisite resolution IDs is not accepted. If a prerequisite later changes to a newer resolution record, the old derived calculation becomes unresolved automatically and must be recalculated against the new dependency IDs.

Verification-record timestamps are deliberately constrained to canonical UTC millisecond form, `YYYY-MM-DDTHH:mm:ss.sssZ`, which is the format produced by `Date.toISOString()`. Higher-precision fractional seconds and timezone-offset forms are rejected so JavaScript millisecond timestamp comparisons cannot silently collapse distinct evidence ordering.

## Record local evidence

A verified fact can be appended to the local ledger with:

```bash
npm run opportunities:record-verification -- \
  --dossier-id opdos_... \
  --check-id opcheck_... \
  --outcome satisfied \
  --evidence-kind source_reference \
  --reference 'https://example.invalid/source' \
  --note 'Verified fact and why it satisfies this check.' \
  --json
```

Recording is append-only. The latest applicable record for a current dossier/check pair is used. Evidence is scoped to the `dossierId` and `checkId`; when upstream evaluation or dossier state changes, identities rotate and old evidence no longer applies automatically. A later incompatible evidence record is ignored rather than erasing an earlier compatible resolution.

A `failed` outcome does not silently reject or contact anything. It moves the verification plan to `failed_check` for operator review.

## Readiness boundary

Even when every check is resolved, this layer does **not** authorize pursuit.

- a `manual_review` opportunity ends at `operator_review_required`;
- a `review_for_pursuit` opportunity can reach `ready_for_operator_decision`;
- `externalActionsAllowed` remains `false` in all cases.

Contact, claim/accept, submission, hiring, and payment remain behind the existing explicit approval boundary.
