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

## Evidence compatibility

Evidence is intentionally check-specific:

- upstream/operator/route checks accept `operator_attestation`;
- compensation terms accept `source_reference` or `counterparty_confirmation`;
- execution cost accepts `calculation` or `executor_quote`;
- margin accepts `calculation`;
- source-listing verification accepts `source_reference`.

An executor quote therefore cannot satisfy buyer compensation terms, and an operator attestation cannot masquerade as source verification.

External evidence kinds (`source_reference`, `executor_quote`, `counterparty_confirmation`) require a non-empty reference.

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

Recording is append-only. The latest applicable record for a current dossier/check pair is used. Evidence is scoped to the `dossierId` and `checkId`; when upstream evaluation or dossier state changes, identities rotate and old evidence no longer applies automatically.

A `failed` outcome does not silently reject or contact anything. It moves the verification plan to `failed_check` for operator review.

## Readiness boundary

Even when every check is resolved, this layer does **not** authorize pursuit.

- a `manual_review` opportunity ends at `operator_review_required`;
- a `review_for_pursuit` opportunity can reach `ready_for_operator_decision`;
- `externalActionsAllowed` remains `false` in all cases.

Contact, claim/accept, submission, hiring, and payment remain behind the existing explicit approval boundary.
