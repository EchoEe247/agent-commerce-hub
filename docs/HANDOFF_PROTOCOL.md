# Handoff Protocol

This repository is the shared coordination surface between Hermes and ChatGPT.

## Mission alignment

All active handoffs should be interpreted under [`REVENUE_OPERATING_PRINCIPLES.md`](REVENUE_OPERATING_PRINCIPLES.md): `agent-commerce-hub` exists to help agents make money with as little human babysitting as practical.

When more than one technically-valid next action is available, prefer the action with the clearer effect on revenue, commercial execution, repeatability, or reduced operator intervention. Do not create handoffs whose main effect is additional architecture, verification, or internal tooling unless that work removes a demonstrated blocker, protects a real revenue path, or materially reduces future agent/operator work.

A handoff should make clear when human involvement is genuinely required for authorization, credentials, production risk, financial approval, legal/compliance judgment, or subjective quality review. Otherwise agents should continue useful commercial work rather than pausing by default.

## Directional handoffs

### Hermes → ChatGPT
Write completed handoff manifests under:

`handoffs/hermes-to-chatgpt/`

A handoff should point to evidence already committed elsewhere in the repo rather than duplicating large datasets.

Required fields:

- `handoff_id`
- `from`: `hermes`
- `to`: `chatgpt`
- `created_at` (UTC ISO-8601)
- `status`
- `objective`
- `summary`
- `evidence_paths`
- `requested_action`
- `limitations`

For active commercial work, `objective`, `summary`, or `requested_action` should identify the relevant revenue/autonomy effect when it is not obvious from the task itself: e.g. opportunity conversion, delivery readiness, payment readiness, reduced babysitting, repeatability, or protection of a demonstrated revenue path.

### ChatGPT → Hermes
Write implementation/review handoffs under:

`handoffs/chatgpt-to-hermes/`

Use the same manifest contract, with `from: chatgpt` and `to: hermes`.

## Evidence rules

- Raw marketplace captures belong in `research/raw/<source>/<timestamp>/` and are immutable.
- Normalized data belongs in `research/normalized/`.
- Human-readable conclusions belong in `research/reports/`.
- Opportunity proposals belong in `research/opportunities/`.
- Product work moves through `products/drafts/` → `products/ready/` → `products/published/`.
- Handoffs should reference exact paths and, where useful, commit SHAs or checksums.
- Clearly separate verified/observed facts from inference.
- Never silently overwrite historical raw evidence.

## State transitions

Recommended product states:

`idea → researched → building → review → ready → approved → published → measuring → iterate|retire`

`ready` means reviewed and technically packageable; it does not itself authorize financial actions.

A technically complete state is not automatically the highest-priority next state. For active commercial work, prefer the next transition that most directly reduces time-to-revenue or operator burden while respecting required safety and authorization gates.

## Financial boundary

A GitHub handoff may recommend a price, budget, or next action. It must not contain wallet credentials or imply that a financial transaction has been authorized unless the user explicitly approved it through the appropriate runtime.

Revenue-first prioritization never overrides this financial boundary, production controls, or other explicit security constraints.
