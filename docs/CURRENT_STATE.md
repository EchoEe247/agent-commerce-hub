# Current State

> **Canonical operational truth:** this document and `state/CURRENT.json` are the repository-level current-state sources. Historical receipts, plans, handoffs, `*-latest` snapshots, and `Unknown/Archived/` material are evidence, not authority, unless explicitly referenced here.

Last current-state reconciliation: **2026-08-30**.

This snapshot is intended to land with PR **#106**. Its source `main` baseline is `4d2f9869eaa681954a69b08e17502355ee0b9349`.

## Project mission

`agent-commerce-hub` is explicitly revenue-first. The standing policy is `docs/REVENUE_OPERATING_PRINCIPLES.md`.

The preferred commercial loop is:

`opportunity discovery → qualification → pricing → execution → quality gate → delivery → payment → follow-up/repeat business → revenue measurement`

Engineering work should normally shorten that loop, improve reliability where a demonstrated commercial failure requires it, or reduce routine operator babysitting. Generic infrastructure/hardening without a credible revenue or autonomy benefit is deprioritized.

## Repository and production boundary

- Canonical/default branch: `main`.
- Production branch: `feat/hermes-commerce-control-plane`.
- Both remain protected.
- Required protected checks: `workflow-policy`, `seller`, and `commerce-control`.
- `main` and production are intentionally separate change-control boundaries.
- A merge to `main` is **not** a production deployment.
- Future production changes require a fresh validated promotion path plus explicit production authorization.

The latest completed production promotion is PR **#95**, merged to the production branch as:

`3c501ee37bd3472afe1736213cc493dc254911a8`

Render deployment `dep-da9fhedg1s2s73a930n0` is recorded live from that production baseline. The live root is:

`products/published/data-quality-profiler`

The production Blueprint uses `X402_FACILITATOR_MODE=xpay`.

## Published seller

Canonical seller:

`products/published/data-quality-profiler/`

Current seller state:

- published and production-deployed;
- 13 paid x402 operations;
- free `/v1/company-domain-intelligence/preview`;
- static read-only root discovery page at `/`;
- canonical pricing authority in `src/config.mjs` via `SELLER_PRICE_DEFAULTS` / `SELLER_PRICE_CATALOG`;
- Agent402 and OpenAPI pricing derive from that authority;
- public/private Docker boundary is regression-tested;
- buyer/discovery/private financial/operator modules remain outside the public server import graph and Docker artifact;
- bounded upstream response reads and SSRF protections remain enforced;
- production unpaid probes have received expected HTTP `402` payment challenges.

Latest recorded marketplace observation listed the seller healthy with 14 tools / 13 paid tools. Its displayed chain label was unresolved in that transient marketplace snapshot and is not treated as authoritative production configuration.

### Revenue observation

The canonical post-deploy observation still records:

`payment_succeeded_observed_since_deploy: false`

No successful paid seller transaction has therefore been established by repository evidence yet. This makes demand acquisition and executable opportunity conversion a higher priority than another generic seller-hardening cycle unless a concrete production defect appears.

## Financial state

Tracked JSON ledgers are audit snapshots, not the transactional runtime database.

Mainnet audit snapshot:

- path: `state/commerce-control/ledgers/mainnet-budget-ledger.json`
- blob: `9a9e87dce730cc3fddcbdcf8926b12d53c6046ab`
- network: `eip155:8453`
- asset: USDC
- initial: `2380000`
- spent: `10000`
- remaining: `2370000` atomic units

Testnet audit snapshot:

- path: `state/commerce-control/ledgers/testnet-budget-ledger.json`
- blob: `0632862d26c600634068b61669db8de11faa8dad`
- network: `eip155:84532`
- successful signer writeback remains restricted to run-scoped `testnet-audit/run-<run_id>-<run_attempt>` branches.

The authoritative transactional SQLite database remains local/gitignored. Repository cleanup or documentation work must not initialize, replace, export, or reconcile it.

## Commerce Control

Canonical package:

`tools/hermes-commerce-control/`

The current opportunity pipeline includes:

- ingestion;
- deduplication;
- triage;
- local model evaluation;
- durable evaluation queue/claiming;
- revenue-oriented ranking;
- **execution routing**;
- **analysis-only human fulfillment planning**;
- verification planning;
- verification resolutions;
- pursuit dossiers;
- operator packets;
- review/runtime-health/state support;
- Reddit RSS opportunity ingestion.

Marketplace/service adapters currently include Agent402, the402, Agent Bounties, BountyBook, CDP Bazaar, PaySH, and Piprail.

Durability/security work already present includes multiwriter JSONL locking, evaluation claims before model calls, verification-resolution locking, sanitization before SQLite persistence, safe-fetch/SSRF controls, evidence/provenance support, and non-authoritative legacy-export handling.

## Execution routing

Canonical implementation:

`tools/hermes-commerce-control/src/opportunities/execution-routing.ts`

Offline command:

```bash
npm run opportunities:route-execution -- --json
```

The router consumes the existing ranked opportunity/evaluation state and deterministically emits one of:

- `agent_direct`;
- `human_fulfillment`;
- `hybrid`;
- `manual_review`;
- `watch`;
- `reject`.

Current ranking gates remain authoritative before execution. Reject/watch/manual-review rows do not silently become executable, and route/capability contradictions are sent to manual review instead of being auto-repaired.

### Human fulfillment boundary

Human routes now produce a concrete **analysis-only** fulfillment plan. This is the first implemented human-fulfillment slice, but it does **not** recruit or pay anyone yet.

The plan requires:

- task brief;
- acceptance criteria;
- completion/attempt evidence;
- completion review before full compensation;
- worker quote;
- compensation authorization;
- platform/community rule verification before recruiting;
- extra safety review for physical tasks.

Compensation policy represented by the plan:

- accepted completion → full agreed compensation after acceptance;
- documented good-faith failed attempt → contract-defined partial compensation after review;
- no meaningful effort or established fraud → no compensation after review;
- suspicion/red flags alone → review required rather than automatic denial.

The router never invents a worker payment. It only carries forward the evaluator's bounded execution-cost estimate when one exists.

Human commercial readiness is explicitly classified as one of:

- `economic_case_present`;
- `needs_total_payout`;
- `needs_worker_quote`;
- `needs_margin_review`;
- `nonpositive_margin`.

Current safety mode remains analysis-only: no job posting, worker contact, task claim/submission, payment promise, wallet/signing action, payment execution, or production mutation.

Detailed contract: `docs/opportunity-execution-routing.md`.

## Private C-Shop worker

Canonical adapter:

`tools/cshop-worker-adapter/`

Pinned renderer:

`stubbb/c-shop@f3b2033c07df92e8e72ff83a29955a2c10494d95`

Current boundary:

- private/local worker;
- no public C-Shop endpoint;
- loopback renderer by default;
- remote renderer requires explicit opt-in and bearer token;
- explicit MCP session IDs;
- raw arbitrary `script` input rejected;
- named `style` commands excluded;
- workspace asset/output names constrained.

Real C-Shop build/workspace tests and MCP smoke have passed. Known graphics failure classes discovered during real testing are represented in reusable adapter/invariant coverage, and required `workflow-policy` CI includes the C-Shop regression gate.

Unless commercialization reveals a new concrete failure, the C-Shop integration should not be reopened for another generic validation cycle.

## Product Listing Graphic

Draft product:

`products/drafts/product-listing-graphic/`

Version: **0.2.0**.

Graphics validation is **PASS** at the current scope. The exact coffee-photo acceptance receipt records both mechanical and human visual PASS:

`receipts/visual-acceptance/product-listing-graphic/2026-08-30-split-layout-v02/acceptance.json`

The product remains commercially unfinished:

- pricing unset;
- payment integration not configured;
- customer asset intake not defined;
- finished-output delivery not defined;
- first-sale distribution/payment route not selected;
- no complete non-live commercial dry run yet;
- unpublished;
- undeployed.

Graphics acceptance is no longer one of its blockers.

## Current open PR state

The deliberately retained deferred provider PR remains:

- **#8 — `feat: add the402 provider adapter`**. It remains deferred pending provider credentials/secret custody and explicit production authorization if revived. Do not merge its stale implementation wholesale without revalidation.

PR **#106** is the execution-routing/human-fulfillment planning change represented by this snapshot. It is a `main`-only Mode-A change and is not a production deployment.

## Strategic frontier

The system can now decide whether a qualified opportunity belongs on an agent, human, hybrid, or manual path. The next gap is converting an approved human plan into a controlled worker-facing transaction without duplicating the opportunity stack.

Priority order after this slice:

1. **human recruitment adapter** — turn an approved human plan into a bounded worker listing/contact workflow while retaining platform/community rules and explicit financial authorization;
2. **fulfillment task contract + acceptance record** — freeze task scope, acceptance criteria, agreed compensation, good-faith-attempt terms, evidence, and final review outcome;
3. **buyer demand validation** — pursue real upstream opportunities and record conversion/payment evidence;
4. **commercialize Product Listing Graphic** — close pricing, intake, delivery, and first-sale path using the same execution/fulfillment principles where useful.

Do not create a new repository or a second opportunity engine for the recruitment layer. Extend the existing Commerce Control opportunity/policy machinery.

## Rules for future agents

1. Read `state/CURRENT.json` and this document before older status, handoff, plan, receipt, or research files.
2. A filename containing `latest` is not automatically current.
3. A `products/published/` path or merged `main` PR is not automatically production-deployed.
4. Preserve the separation between `main` and the Render-linked production branch; production mutation requires explicit authorization.
5. Do not reopen completed reliability work without new evidence of a real failure.
6. Prefer whole coherent implementation followed by the relevant full gate; fix concrete failures rather than repeatedly re-planning settled architecture.
7. Extend the existing Commerce Control opportunity/policy machinery for recruitment and fulfillment rather than creating duplicate infrastructure.
8. Human worker posting/contact/payment remains disabled until a later explicitly bounded implementation adds those capabilities.
9. Seller default-price changes must use the canonical price catalog and pass consistency coverage.
10. Public seller Docker changes must preserve the private buyer/financial/operator boundary.
11. GitHub expressions must not appear directly inside workflow `run:` commands; pass values through `env:` and quote shell variables.
12. Testnet signer audit snapshots must write only to run-scoped audit branches and must not force-push.
13. Never commit secrets, private paid results, local SQLite/WAL/SHM files, or generated `node_modules`.
14. `Unknown/Archived/` is historical evidence only and must not be treated as active configuration.
