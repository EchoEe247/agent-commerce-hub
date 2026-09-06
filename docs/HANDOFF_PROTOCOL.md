# Handoff Protocol

This repository is the shared coordination surface between ChatGPT and Hermes for agent-commerce work.

A handoff should move real work forward. It should not become a ritual pause between agents.

## Mission alignment

All active handoffs operate under [`REVENUE_OPERATING_PRINCIPLES.md`](REVENUE_OPERATING_PRINCIPLES.md): `agent-commerce-hub` exists to help agents make money with as little routine human babysitting as practical.

When more than one technically valid next action exists, prefer the one with the clearer effect on revenue, commercial execution, repeatability, or reduced operator intervention.

Do not create a handoff whose main result is more architecture, verification, or internal tooling unless that work removes a demonstrated blocker, protects a real revenue path, or materially reduces future agent/operator effort.

Human involvement should be called out only when it is actually required for things such as authorization, credentials, production risk, financial approval, legal/compliance judgment, or subjective quality review. Otherwise the receiving agent should continue the useful work rather than stopping by default.

## Directional handoffs

### Hermes → ChatGPT

Write completed handoff manifests under:

`handoffs/hermes-to-chatgpt/`

A handoff should reference evidence already committed elsewhere in the repository rather than copying large datasets into the manifest.

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

For active commercial work, `objective`, `summary`, or `requested_action` should make the revenue/autonomy effect visible when it is not obvious from the task itself—for example opportunity conversion, delivery readiness, payment readiness, repeatability, reduced babysitting, or protection of a demonstrated revenue path.

### ChatGPT → Hermes

Write implementation/review handoffs under:

`handoffs/chatgpt-to-hermes/`

Use the same manifest contract with `from: chatgpt` and `to: hermes`.

Hermes should be used when the next claim depends on the real local/runtime boundary: device state, authenticated tooling, credentials, package publication, production runtime, wallet/runtime checks, or other evidence that cannot be established safely from repository inspection alone.

## Evidence rules

- Raw marketplace captures belong in `research/raw/<source>/<timestamp>/` and are immutable.
- Normalized data belongs in `research/normalized/`.
- Human-readable conclusions belong in `research/reports/`.
- Opportunity proposals belong in `research/opportunities/`.
- Product work moves through `products/drafts/` → `products/ready/` → `products/published/`.
- Handoffs reference exact paths and, where useful, commit SHAs or checksums.
- Verified/observed facts stay separate from inference.
- Historical raw evidence is never silently overwritten to make later state look cleaner.

## State transitions

Recommended product states:

`idea → researched → building → review → ready → approved → published → measuring → iterate|retire`

`ready` means reviewed and technically packageable. It does **not** authorize spending, signing, funding, publication to production, or another financial/irreversible action by itself.

A technically complete state is also not automatically the highest-priority commercial state. Prefer the next transition that most directly reduces time-to-revenue or operator burden while staying inside the real authorization and safety boundaries.

## Financial boundary

A GitHub handoff may recommend a price, budget, opportunity, or next action. Repository state is coordination/evidence; it is not wallet authorization.

Do not write a handoff as though a financial transaction, wallet signature, funding action, withdrawal, payment, proof purchase, or similar value movement has been authorized unless the operator explicitly authorized that action through the appropriate runtime/process.

Revenue-first prioritization never overrides this boundary.