# Handoff Protocol

This repository is the shared coordination surface between Hermes and ChatGPT.

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

## Financial boundary

A GitHub handoff may recommend a price, budget, or next action. It must not contain wallet credentials or imply that a financial transaction has been authorized unless the user explicitly approved it through the appropriate runtime.
