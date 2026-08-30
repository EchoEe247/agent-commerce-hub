# Current State

> **Canonical operational truth:** this document and `state/CURRENT.json` are the repository-level current-state sources. Historical receipts, plans, handoffs, `*-latest` snapshots, and `Unknown/Archived/` material are evidence, not authority, unless explicitly referenced here.

Last current-state reconciliation: **2026-08-30**.

This snapshot reconciles canonical `main` through PR **#104**. The source `main` head at reconciliation start was `241a446952775baeacf9fc68d69901cd650b2e1f`.

## Project mission

`agent-commerce-hub` is now explicitly revenue-first. The standing policy is `docs/REVENUE_OPERATING_PRINCIPLES.md`.

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

The repository already contains a substantial opportunity pipeline. Current implemented pieces include:

- ingestion;
- deduplication;
- triage;
- local model evaluation;
- durable evaluation queue/claiming;
- revenue-oriented ranking;
- verification planning;
- verification resolutions;
- pursuit dossiers;
- operator packets;
- review/runtime-health/state support;
- Reddit RSS opportunity ingestion.

Marketplace/service adapters currently include:

- Agent402;
- the402;
- Agent Bounties;
- BountyBook;
- CDP Bazaar;
- PaySH;
- Piprail.

Durability/security work already present includes multiwriter JSONL locking, evaluation claims before model calls, verification-resolution locking, sanitization before SQLite persistence, safe-fetch/SSRF controls, evidence/provenance support, and non-authoritative legacy-export handling.

This existing opportunity/policy machinery is the correct place to extend execution routing. Do not create a duplicate opportunity engine merely to support human fulfillment.

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

Real C-Shop build/workspace tests and MCP smoke have passed. Known graphics failure classes discovered during real testing are now represented in reusable adapter/invariant coverage, and the required `workflow-policy` CI includes the C-Shop regression gate.

Unless commercialization reveals a new concrete failure, the C-Shop integration should not be reopened for another generic validation cycle.

## Product Listing Graphic

Draft product:

`products/drafts/product-listing-graphic/`

Version: **0.2.0**.

Graphics validation is now **PASS** at the current scope.

The previous full-bleed supplied-photo layout is intentionally retained as a historical human visual failure. It was replaced with the v0.2 split layout:

- supplied image proportionally contained in upper 64%;
- separate lower 36% title/price panel;
- source aspect ratio preserved;
- complete source visible by default;
- no gradient over supplied photographs.

The exact coffee-photo acceptance receipt records both mechanical and human visual **PASS**:

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

The only deliberately retained deferred PR is:

- **#8 — `feat: add the402 provider adapter`**. It remains deferred pending provider credentials/secret custody and explicit production authorization if revived. Do not merge its stale implementation wholesale without revalidation.

Recent merged `main` work through PR #104 includes the private C-Shop adapter, the Product Listing Graphic draft, real graphics failure fixes, permanent graphics regression gates, and the revenue-first operating mission.

## Strategic frontier

The immediate commercial frontier is no longer “build more generic infrastructure.” It is converting opportunities into paid, fulfillable work.

Priority order:

1. **execution routing** — determine whether a qualified opportunity should be handled by existing automation/AI or requires a human executor;
2. **human fulfillment** — add a controlled path for tasks that agents cannot complete alone, using the existing opportunity and policy systems rather than a new repository;
3. **buyer demand validation** — pursue real transactions and record actual conversion/payment evidence;
4. **commercialize Product Listing Graphic** — close pricing, intake, delivery, and first-sale path after the execution-routing work establishes the broader fulfillment model.

Human fulfillment is **not implemented yet**. There are no canonical `human_fulfillment` or subcontract modules in the repository as of this reconciliation.

The recommended integration point is under:

`tools/hermes-commerce-control/src/opportunities/`

The intended high-level decision is:

```text
qualified paid opportunity
        |
        v
execution feasibility
   /             \
  /               \
agent/AI        human-only
execution       capability
                    |
                    v
             human fulfillment
```

## Rules for future agents

1. Read `state/CURRENT.json` and this document before older status, handoff, plan, receipt, or research files.
2. A filename containing `latest` is not automatically current.
3. A `products/published/` path or merged `main` PR is not automatically production-deployed.
4. Preserve the separation between `main` and the Render-linked production branch; production mutation requires explicit authorization.
5. Do not reopen completed reliability work without new evidence of a real failure.
6. Prefer whole coherent implementation followed by the relevant full gate; fix concrete failures rather than repeatedly re-planning settled architecture.
7. Extend the existing Commerce Control opportunity/policy machinery for execution routing and human fulfillment rather than creating duplicate infrastructure.
8. Seller default-price changes must use the canonical price catalog and pass consistency coverage.
9. Public seller Docker changes must preserve the private buyer/financial/operator boundary.
10. GitHub expressions must not appear directly inside workflow `run:` commands; pass values through `env:` and quote shell variables.
11. Testnet signer audit snapshots must write only to run-scoped audit branches and must not force-push.
12. Never commit secrets, private paid results, local SQLite/WAL/SHM files, or generated `node_modules`.
13. `Unknown/Archived/` is historical evidence only and must not be treated as active configuration.
