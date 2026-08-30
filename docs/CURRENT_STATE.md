# Current State

> **Canonical operational truth:** this document and `state/CURRENT.json` are the repository-level current-state sources. Historical receipts, plans, handoffs, `*-latest` snapshots, and `Unknown/Archived/` material are evidence, not authority, unless explicitly referenced here.

Last current-state reconciliation: **2026-08-30**.

This snapshot is intended to land with PR **#108**. Its source `main` baseline is `b10d6c1f7a4e65ec80ad8a930ca6b8ea0e821b4d`.

## Project mission

`agent-commerce-hub` is explicitly revenue-first. The standing policy is `docs/REVENUE_OPERATING_PRINCIPLES.md`.

Preferred loop:

`opportunity discovery → qualification → pricing → execution → quality gate → delivery → payment → follow-up/repeat business → revenue measurement`

Engineering should shorten that loop, prevent demonstrated revenue-threatening failures, or reduce routine operator babysitting. Generic hardening without a concrete commercial/autonomy benefit is deprioritized.

## Repository and production boundary

- Canonical/default branch: `main`.
- Production branch: `feat/hermes-commerce-control-plane`.
- Both are protected; required checks are `workflow-policy`, `seller`, and `commerce-control`.
- A merge to `main` is **not** a production deployment.
- Production changes require a fresh validated promotion plus explicit production authorization.

The latest production promotion remains PR **#95**, production commit `3c501ee37bd3472afe1736213cc493dc254911a8`. Render deployment `dep-da9fhedg1s2s73a930n0` is recorded live from that baseline, rooted at `products/published/data-quality-profiler`, with `X402_FACILITATOR_MODE=xpay`.

## Published seller and revenue observation

Canonical seller: `products/published/data-quality-profiler/`.

The seller remains production-deployed with 13 paid x402 operations, a free company-domain preview, centralized pricing authority, public/private Docker boundary coverage, bounded upstream reads, SSRF controls, and successful unpaid HTTP `402` challenges. The latest recorded Agent402 observation listed 14 tools / 13 paid tools.

Canonical post-deploy evidence still records:

`payment_succeeded_observed_since_deploy: false`

No successful paid seller transaction has therefore been established by repository evidence yet. Demand acquisition and executable opportunity conversion remain the main commercial bottleneck.

## Financial state

Tracked JSON ledgers are audit snapshots; transactional authority remains the local/gitignored SQLite database.

Mainnet audit snapshot:

- `state/commerce-control/ledgers/mainnet-budget-ledger.json`
- blob `9a9e87dce730cc3fddcbdcf8926b12d53c6046ab`
- Base mainnet `eip155:8453`, USDC
- initial `2380000`, spent `10000`, remaining `2370000` atomic units

Testnet audit snapshot:

- `state/commerce-control/ledgers/testnet-budget-ledger.json`
- blob `0632862d26c600634068b61669db8de11faa8dad`
- Base Sepolia `eip155:84532`
- successful signer writeback remains restricted to run-scoped `testnet-audit/run-<run_id>-<run_attempt>` branches

Repository work must not initialize, replace, export, or reconcile the local transactional database incidentally.

## Commerce Control opportunity pipeline

Canonical package: `tools/hermes-commerce-control/`.

Implemented stages include:

- ingestion and deduplication;
- deterministic triage;
- local model evaluation and durable evaluation claiming;
- revenue-oriented ranking;
- execution routing;
- human fulfillment planning;
- recruitment drafting;
- frozen worker contract drafting;
- worker-facing recruitment payload rendering;
- external recruitment intent preparation;
- append-only human-fulfillment lifecycle persistence;
- human attempt/QA review;
- verification planning/resolution;
- pursuit dossiers and operator packets;
- Reddit RSS opportunity ingestion.

Marketplace/service adapters still include Agent402, the402, Agent Bounties, BountyBook, CDP Bazaar, PaySH, and Piprail.

## Execution routing

Canonical implementation: `tools/hermes-commerce-control/src/opportunities/execution-routing.ts`.

Offline command:

```bash
npm run opportunities:route-execution -- --json
```

The router emits `agent_direct`, `human_fulfillment`, `hybrid`, `manual_review`, `watch`, or `reject`. Existing ranking gates remain authoritative and route/capability contradictions fail to manual review.

## Human recruitment and fulfillment core

Frozen contract core: `tools/hermes-commerce-control/src/opportunities/human-fulfillment.ts`.

Detailed contract: `docs/human-fulfillment-contract.md`.

The contract freezes worker scope, acceptance criteria, evidence requirements, worker reference, deadline, full compensation, and positive pre-agreed good-faith-attempt compensation. Unknown upstream payout or a zero/negative gross margin floor blocks worker-facing economic readiness. Suspicion alone cannot automatically deny compensation.

Reviewed outcomes remain:

- `accepted` → full compensation due;
- `good_faith_failed` → pre-agreed partial compensation due;
- `no_meaningful_effort` → zero after review;
- `established_fraud` → zero after review;
- `suspicious` → manual review with no automatic denial.

No payment execution is enabled.

## Worker-facing recruitment adapters

Canonical renderer: `tools/hermes-commerce-control/src/opportunities/human-recruitment-adapters.ts`.

Boundary/documentation: `docs/human-recruitment-adapters.md`.

Channel-aware preparation now exists for:

- Reddit-style public posts;
- generic marketplace listings;
- direct/private outreach;
- custom/other recruitment surfaces.

The rendered payload is built only from frozen worker terms. It includes scope, acceptance criteria, evidence requirements, full compensation, pre-agreed good-faith-attempt compensation, and deadline when present.

It deliberately excludes upstream buyer payout, internal margin, source listing title/body, evaluator/model reasoning, ranking/risk labels, and internal worker references. A payload cannot be produced while the contract's economic readiness gate is blocked. Direct recruitment is constrained to private-message delivery.

The target also records when the target platform/community rules were verified; the renderer does not claim those rules are known from model memory.

## Recruitment external-action boundary

Canonical intent: `tools/hermes-commerce-control/src/opportunities/human-recruitment-intent.ts`.

A prepared payload can now be converted into an immutable `post` or `contact` intent. That intent is sent through the central policy engine as `EXTERNAL_WRITE`.

Current Mode-A result remains:

- policy rule: `A_MODE_EXTERNAL_WRITE`;
- reason: `EXTERNAL_WRITE_DISABLED`;
- `operatorApprovalRequired: true`;
- `externalMutationExecuted: false`.

There is no Reddit client, marketplace client, browser poster, email sender, DM sender, or equivalent executor in this slice. The system knows the exact action it would take but stops at the existing B1 boundary rather than pretending the external action happened.

## Persistent human-fulfillment lifecycle

Canonical store: `tools/hermes-commerce-control/src/opportunities/human-fulfillment-lifecycle.ts`.

The local append-only JSONL lifecycle supports:

- `recruitment_payload_prepared`;
- `external_action_intent_prepared`;
- `candidate_recorded`;
- `contract_recorded`;
- `worker_acceptance_recorded`;
- `attempt_evidence_recorded`;
- `review_recorded`.

Events are schema-validated, deterministically identified, deduplicated by event ID, guarded by the existing file-lock primitive, filterable by opportunity, and repair a crash-truncated final record before append. Corrupt/legacy lines do not poison the full store.

These records are local evidence only. Recording a candidate, acceptance, attempt, or review does not prove that a remote platform action occurred and does not authorize money movement.

## Validation for PR #108

The exact pre-state-update implementation candidate passed:

- Hermes Commerce Control CI typecheck and full test suite;
- required `workflow-policy` gate including C-Shop invariant coverage;
- full seller gate;
- Commerce Control typecheck/tests inside Production Change Control;
- financial audit-snapshot invariants and no-tracked-local-runtime-state checks.

The current-state-only commits must pass the same required PR checks before merge.

## Private C-Shop worker

Canonical adapter: `tools/cshop-worker-adapter/`, pinned to `stubbb/c-shop@f3b2033c07df92e8e72ff83a29955a2c10494d95`.

It remains private/local, loopback by default, remote only with explicit opt-in and bearer token, uses explicit MCP session IDs, rejects arbitrary raw scripts, excludes named styles, and constrains workspace filenames. Existing real build/workspace/MCP validation and required regression coverage remain authoritative. Do not reopen this area without new failure evidence.

## Product Listing Graphic

Draft: `products/drafts/product-listing-graphic/`, version **0.2.0**.

Graphics validation remains **PASS** with receipt `receipts/visual-acceptance/product-listing-graphic/2026-08-30-split-layout-v02/acceptance.json`.

The product remains commercially unfinished: pricing unset, payment integration not configured, customer intake/output delivery not defined, first-sale distribution path not selected, no complete commercial dry run, unpublished, and undeployed.

## Open PR state

The deliberately deferred provider PR remains **#8 — `feat: add the402 provider adapter`**, pending provider credentials/secret custody and explicit production authorization if revived.

PR **#108** is the worker-facing recruitment-adapter/lifecycle change represented by this snapshot. It targets `main` only and is not a production deployment.

## Strategic frontier

The internal path now reaches:

`qualified opportunity → execution route → frozen worker contract → channel-specific worker payload → blocked external-action intent → durable local lifecycle`

The next commercial gap is no longer another planning artifact. It is a deliberately activated external-action layer and real demand conversion.

Priority after this slice:

1. **B1 recruitment activation design/implementation** — add a real operator-authorization mechanism and narrowly scoped external post/contact executor without weakening the central policy boundary;
2. **real worker/counterparty validation** — exercise the lifecycle with an actual approved opportunity/candidate once B1 is explicitly authorized;
3. **buyer demand validation** — pursue real upstream opportunities and record conversion/payment evidence;
4. **B2 worker-payment path** — only after a real transaction requires value movement and with separate explicit financial authorization;
5. **commercialize Product Listing Graphic** — close pricing/intake/delivery/first-sale path where it competes favorably with upstream demand work.

Do not create a second opportunity engine or duplicate recruitment economics/compensation rules per provider.

## Rules for future agents

1. Read `state/CURRENT.json` and this document before older state, plans, receipts, or `*-latest` files.
2. A merge to `main` is not a production deployment.
3. Preserve the separate protected production branch; production mutation requires explicit authorization.
4. Do not reopen completed reliability work without new failure evidence.
5. Prefer coherent implementation followed by the relevant full gate; fix concrete failures rather than repeatedly re-planning settled architecture.
6. Future worker-facing adapters must consume frozen contract artifacts and must not leak upstream payout/internal margin/model scoring by default.
7. External worker posting/contact remains blocked by Mode A until B1 is explicitly implemented; do not relabel it as a safe/read operation to bypass policy.
8. Worker payment/value movement remains a separate B2 concern.
9. Good-faith partial compensation must be fixed before execution, not invented retroactively.
10. Suspicion alone must not automatically become a zero-compensation/fraud outcome.
11. Seller pricing changes must use the canonical price catalog and pass consistency coverage.
12. Public seller Docker changes must preserve the private buyer/financial/operator boundary.
13. GitHub expressions must not appear directly inside workflow `run:` commands; use `env:` and quoted shell variables.
14. Testnet signer audit snapshots must write only to run-scoped audit branches and must not force-push.
15. Never commit secrets, private paid results, local SQLite/WAL/SHM files, or generated `node_modules`.
16. `Unknown/Archived/` is historical evidence only.
