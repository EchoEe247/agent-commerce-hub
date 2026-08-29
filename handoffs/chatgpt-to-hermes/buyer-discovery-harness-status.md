# Buyer Discovery Harness Integration Status

> Historical integration record. Repository-wide current operational state is authoritative in `docs/CURRENT_STATE.md` and `state/CURRENT.json`.

- Feature branch: `feat/buyer-discovery-harness`
- Buyer-discovery PR: **#40** — merged
- Stack base PR: **#38** — merged before #40 integration
- Design: `docs/superpowers/specs/2026-08-24-buyer-discovery-harness-design.md`
- Plan: `docs/superpowers/plans/2026-08-24-buyer-discovery-harness.md`
- TDD receipt: `receipts/buyer-discovery-harness-red-intent.md`
- Final integration state: implementation verified and integrated; there is no remaining stack/rebase/merge action for PR #38 or #40.

## Implemented

- Immutable five-intent buyer corpus for company research/enrichment/lead qualification.
- Pure deterministic evaluator with versioned JSON report and independent failure classifications.
- In-process acquisition runner using the real Fastify app and x402 middleware with a local fake facilitator.
- Optional `TARGET_URL` remote observation mode that makes only unauthenticated/free requests plus one unpaid paid-route probe and stops at HTTP 402.
- JSON CLI: `npm run check:buyer-discovery`.
- Permanent seller-CI coverage for syntax, focused harness tests, CLI execution, the full profiler suite, and existing live source smokes.
- Temporary TDD workflow removed after the permanent gate was proven.

## Verified boundary

The deterministic funnel is:

`buyer intent -> OpenAPI + /llms.txt -> free preview -> unpaid paid route -> HTTP 402 -> valid x402/Bazaar challenge`

The harness does not settle, sign, send a payment header, read wallet credentials, or perform a financial action.

## Original verification receipts

- Task 1 GREEN: Buyer Discovery TDD run `32737934822`.
- Task 2 GREEN: Buyer Discovery TDD run `32738300848`.
- Task 3 GREEN: Buyer Discovery TDD run `32738555397`.
- Permanent seller gate: `32738746820` success.
- Post-temporary-workflow cleanup seller gate: `32738872857` success, including focused tests, buyer-discovery CLI check, full profiler suite, and live OFAC/SEC/OSV/npm/PyPI source smokes.

## Integration closeout

PR #38 (`Add machine-friendly agent discovery surfaces`) merged as `d5198921a963da3b6f091f341af82ad4f67259bd`. PR #40 (`Add deterministic buyer discovery verification harness`) subsequently merged as `e059e2ced6d9a5b3552ebe7bb1dc5dcea5b4ddb8`.

The old instruction to leave PR #40 draft/stacked or wait for PR #38 is obsolete. Future changes to this harness should start from canonical `main`, follow current branch protection/CI, and treat this file as historical integration evidence rather than an active handoff.
