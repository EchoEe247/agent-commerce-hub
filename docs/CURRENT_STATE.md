# Current State

> **Canonical operational truth:** this document and `state/CURRENT.json` are the repository-level current-state sources. Historical receipts, plans, handoffs, `*-latest` snapshots, and `Unknown/Archived/` material are evidence, not authority, unless explicitly referenced here.

Last current-state reconciliation: **2026-08-30**.

This snapshot is intended to land with PR **#107**. Its source `main` baseline is `c8a5eb5b6401640fdcd1f5c7f59d451b2df541b0`.

## Project mission

`agent-commerce-hub` is explicitly revenue-first. The standing policy is `docs/REVENUE_OPERATING_PRINCIPLES.md`.

The preferred commercial loop is:

`opportunity discovery → qualification → pricing → execution → quality gate → delivery → payment → follow-up/repeat business → revenue measurement`

Engineering should normally shorten that loop, prevent demonstrated revenue-threatening failures, or reduce routine operator babysitting. Generic hardening without a concrete commercial or autonomy benefit is deprioritized.

## Repository and production boundary

- Canonical/default branch: `main`.
- Production branch: `feat/hermes-commerce-control-plane`.
- Both remain protected.
- Required protected checks: `workflow-policy`, `seller`, and `commerce-control`.
- A merge to `main` is **not** a production deployment.
- Production changes require a fresh validated promotion path plus explicit production authorization.

The latest completed production promotion remains PR **#95**, merged as `3c501ee37bd3472afe1736213cc493dc254911a8`. Render deployment `dep-da9fhedg1s2s73a930n0` is recorded live from that production baseline, rooted at `products/published/data-quality-profiler`, with `X402_FACILITATOR_MODE=xpay`.

## Published seller and revenue observation

Canonical seller: `products/published/data-quality-profiler/`.

Current seller state includes 13 paid x402 operations, the free company-domain preview, read-only root discovery, centralized pricing authority, public/private Docker boundary coverage, bounded upstream response handling, SSRF protections, and successful external unpaid `402` challenges. The latest recorded Agent402 observation listed 14 tools / 13 paid tools.

The canonical post-deploy observation still records:

`payment_succeeded_observed_since_deploy: false`

No successful paid seller transaction has therefore been established by repository evidence yet. Demand acquisition and executable opportunity conversion remain higher-value work than another generic seller-hardening cycle unless a concrete defect appears.

## Financial state

Tracked JSON ledgers remain audit snapshots, not the transactional runtime database.

Mainnet audit snapshot:

- `state/commerce-control/ledgers/mainnet-budget-ledger.json`
- blob `9a9e87dce730cc3fddcbdcf8926b12d53c6046ab`
- Base mainnet `eip155:8453`
- USDC
- initial `2380000`, spent `10000`, remaining `2370000` atomic units

Testnet audit snapshot:

- `state/commerce-control/ledgers/testnet-budget-ledger.json`
- blob `0632862d26c600634068b61669db8de11faa8dad`
- Base Sepolia `eip155:84532`
- successful signer writeback remains restricted to run-scoped `testnet-audit/run-<run_id>-<run_attempt>` branches

The authoritative transactional SQLite database remains local/gitignored. Repository work must not initialize, replace, export, or reconcile it incidentally.

## Commerce Control opportunity pipeline

Canonical package: `tools/hermes-commerce-control/`.

Implemented opportunity stages now include:

- ingestion and deduplication;
- deterministic triage;
- local model evaluation;
- durable evaluation queue/claiming;
- revenue-oriented ranking;
- execution routing;
- human fulfillment planning;
- human recruitment drafting;
- human fulfillment contract drafting;
- human attempt/QA review;
- verification planning/resolution;
- pursuit dossiers;
- operator packets;
- review/runtime-health/state support;
- Reddit RSS opportunity ingestion.

Marketplace/service adapters include Agent402, the402, Agent Bounties, BountyBook, CDP Bazaar, PaySH, and Piprail.

## Execution routing

Canonical implementation: `tools/hermes-commerce-control/src/opportunities/execution-routing.ts`.

Offline command:

```bash
npm run opportunities:route-execution -- --json
```

The router deterministically emits `agent_direct`, `human_fulfillment`, `hybrid`, `manual_review`, `watch`, or `reject`. Existing ranking gates remain authoritative. Route/capability contradictions are sent to manual review instead of being silently repaired.

Human routes produce analysis-only plans requiring a task brief, acceptance criteria, evidence, review before full compensation, worker quote, compensation authorization, platform/community rule verification, and extra safety review for physical work.

## Human recruitment and fulfillment contract core

Canonical implementation: `tools/hermes-commerce-control/src/opportunities/human-fulfillment.ts`.

Detailed contract: `docs/human-fulfillment-contract.md`.

This slice converts an already-routed human/hybrid opportunity into three controlled artifacts:

1. **Recruitment draft** — identifies candidate-discovery channels and required worker-facing inputs without posting or contacting anyone.
2. **Fulfillment contract draft** — freezes exact scope, acceptance criteria, evidence requirements, worker reference, deadline, full compensation, and pre-agreed good-faith-attempt compensation.
3. **Review record** — records the evidence-backed QA outcome and the compensation the frozen contract says is due, without executing payment.

### Recruitment privacy boundary

Default represented channels are Reddit and marketplaces, with `direct` and `other` also available. These are planning labels only; no channel is invoked.

Worker-facing outline material deliberately excludes upstream buyer payout, source title, raw listing body, internal margin, model score/risk labels, and evaluator reasoning. Exact scope, compensation, acceptance, evidence, timeline, worker identity, and target-platform rules must be established before any later post/contact can be enabled. Physical tasks also require location/logistics/safety review.

### Frozen compensation terms

The worker contract requires a positive full compensation amount and a smaller **positive** good-faith-attempt amount. The partial amount is fixed before execution so a failed-attempt review cannot invent or renegotiate it after the worker has already performed work.

When upstream total USD payout is known, the contract computes:

`upstream payout floor - full worker compensation`

A zero/negative result blocks payment-authorization readiness. Unknown upstream total payout also blocks it. This is a gross worker-compensation margin gate, not a claim that every possible business cost has been modeled.

### QA outcomes

Explicit reviewed outcomes are:

- `accepted` → full agreed compensation due;
- `good_faith_failed` → pre-agreed partial compensation due;
- `no_meaningful_effort` → zero after explicit review;
- `established_fraud` → zero after explicit review;
- `suspicious` → manual review, no automatic denial and no amount decided yet.

Suspicion alone is intentionally insufficient to deny compensation automatically.

Every artifact remains pre-live: no Reddit/marketplace post, DM/email/contact, worker onboarding/acceptance mutation, compensation promise from the runtime, wallet/signing action, payment execution, Render change, or production mutation.

## Private C-Shop worker

Canonical adapter: `tools/cshop-worker-adapter/`.

Pinned renderer: `stubbb/c-shop@f3b2033c07df92e8e72ff83a29955a2c10494d95`.

It remains private/local, loopback by default, remote only with explicit opt-in and bearer token, uses explicit MCP session IDs, rejects arbitrary raw scripts, excludes named styles, and constrains workspace filenames. Real build/workspace tests and MCP smoke passed; known graphics failures are now permanent regression coverage in required CI. Do not reopen this area without new failure evidence.

## Product Listing Graphic

Draft: `products/drafts/product-listing-graphic/`, version **0.2.0**.

Graphics validation is **PASS**. The exact real-photo receipt is `receipts/visual-acceptance/product-listing-graphic/2026-08-30-split-layout-v02/acceptance.json`.

The product remains commercially unfinished: pricing unset, payment integration not configured, customer intake/output delivery not defined, first-sale distribution path not selected, no complete commercial dry run, unpublished, and undeployed.

## Open PR state

The deliberately deferred provider PR remains **#8 — `feat: add the402 provider adapter`**, pending provider credentials/secret custody and explicit production authorization if revived.

PR **#107** is the human recruitment/contract core represented by this snapshot. It targets `main` only and is not a production deployment.

## Strategic frontier

The project can now discover/rank opportunities, route execution, prepare a human recruitment draft, freeze worker terms, and deterministically review compensation outcomes. The remaining gap is the controlled external-action layer.

Priority order after this slice:

1. **worker-facing recruitment adapter** — transform an approved frozen recruitment/contract artifact into a provider-specific draft without duplicating business rules;
2. **approved contact/post boundary** — explicit policy/authorization gate for when a worker listing or message may actually be sent;
3. **persistent human-fulfillment lifecycle** — durable candidate/contract/execution/review/payment-intent state once real worker transactions begin;
4. **buyer demand validation** — pursue real upstream opportunities and record conversion/payment evidence;
5. **commercialize Product Listing Graphic** — close its remaining pricing/intake/delivery/first-sale path.

Do not create a new repository or second opportunity engine for these layers. Future worker-facing adapters must consume the frozen recruitment/contract artifacts rather than rebuild scope, economics, or compensation policy per platform.

## Rules for future agents

1. Read `state/CURRENT.json` and this document before older status, handoff, plan, receipt, or research files.
2. A filename containing `latest` is not automatically current.
3. A merged `main` PR or `products/published/` path is not automatically production-deployed.
4. Preserve the separate protected production branch; production mutation requires explicit authorization.
5. Do not reopen completed reliability work without new evidence of a real failure.
6. Prefer coherent implementation followed by the relevant full gate; fix concrete failures rather than repeatedly re-planning settled architecture.
7. Extend existing Commerce Control opportunity/policy machinery rather than creating duplicate recruitment/fulfillment infrastructure.
8. Human worker posting/contact/payment remains disabled until a later explicitly bounded implementation enables it.
9. A future worker adapter must not leak upstream payout/internal margin/model scoring by default.
10. Good-faith partial compensation must be fixed before worker execution, not decided retroactively.
11. Suspicion alone must not automatically become a zero-compensation/fraud outcome.
12. Seller pricing changes must use the canonical price catalog and pass consistency coverage.
13. Public seller Docker changes must preserve the private buyer/financial/operator boundary.
14. GitHub expressions must not appear directly inside workflow `run:` commands; use `env:` and quoted shell variables.
15. Testnet signer audit snapshots must write only to run-scoped audit branches and must not force-push.
16. Never commit secrets, private paid results, local SQLite/WAL/SHM files, or generated `node_modules`.
17. `Unknown/Archived/` is historical evidence only and must not be treated as active configuration.
