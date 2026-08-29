# Production change control

This repository treats the seller/payment runtime as production-sensitive code.

## Required merge gate

For the canonical production branch, require the `Production Change Control` checks:

- `workflow-policy`
- `seller`
- `commerce-control`

The gate has no pull-request path filter, so workflow, Render configuration, seller/payment, Commerce Control, and repository-level changes cannot bypass review by falling outside a path allowlist.

Direct pushes must be blocked by GitHub branch protection or a repository ruleset. This administrative setting is not encoded by Git itself.

Recommended branch rule:

- require a pull request before merging
- require the three checks above
- require branches to be up to date before merging
- block force pushes
- block branch deletion
- include administrators
- do not allow ordinary push bypasses

## Workflow policy

`.github/scripts/workflow-policy-check.mjs` enforces repository-side invariants:

- external Actions are pinned to full commit SHAs
- checkout credentials are not persisted
- `npm ci || npm install` fallback is forbidden
- only the explicit testnet signer workflow may request `contents: write`
- the public Agent402 buyer cannot expose private paid results
- the live seller smoke is manual and read-only

## Live seller smoke

`Hermes Seller Live Read-Only Smoke` is manual only. It validates health, discovery, and an unpaid 402 quote. It does not register with an external marketplace and does not commit `latest.json` evidence back into Git.

## Render

Render auto-deploy is not a substitute for GitHub change control. Production should deploy only from the protected canonical production branch. During migration, do not advance an older Render-linked feature branch until the protected canonical branch is ready.
