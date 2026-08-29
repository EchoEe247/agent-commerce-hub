# Current State

> **Canonical operational truth:** this document and `state/CURRENT.json` are the repository-level current-state sources. Historical receipts, plans, handoffs, `*-latest` snapshots, and `Unknown/Archived/` material are evidence, not authority, unless explicitly referenced here.

Last current-state update: **2026-08-29**.

## Repository roles

- **Canonical/default repository branch:** `main`.
- **Canonical main protection:** enabled; pull requests are required with strict `workflow-policy`, `seller`, and `commerce-control` checks, admins enforced, force-push/deletion disabled.
- **Production deployment branch:** `feat/hermes-commerce-control-plane`.
- **Latest completed implementation batch:** P1 Root Landing Extraction Batch 15, code validated at `797ea54dcf888036dea50ebc7a16a0f78a99fe78` through PR #94.
- **Latest production-staging alignment:** draft PR #89 is the sole current production candidate and is refreshed whenever canonical `main` advances.

Batch 6C aligned canonical state into `main` through PR #81. Batch 7 was then validated at `378fdcec5240076c20381b3310ad7fbdb018eae9`, merged through PR #82, and completed its GitHub administration at `main` merge commit `db344147e8ed490f486a6aa86f4b19a3e1d675bf`. Ten already-archived obsolete branch refs were removed while preservation refs were retained.

Batch 8 centralized seller pricing and merged through PR #84. Batch 9 bounded public upstream response bodies before parsing, validated at `f9d465fa0986fb6f9a902acfae2a3fb2a57a2576`, and merged through PR #86 as `dcaa00adb88e3ed62207a870be95128d500a4edb`. Batch 10 adds explicit static holiday-rule provenance and corrects Brazil Carnival national-scope classification. Batch 11 replaced stale/conflicted production staging with a dedicated reconciliation branch whose candidate tree is canonical `main` while the unchanged production head remains in its ancestry. Batch 12 minimizes the public seller Docker artifact so repository-only buyer, reconciliation, financial-store, discovery, admin, test, and documentation material is not shipped with the seller process. Batch 13 removes direct GitHub-expression interpolation from shell commands and makes that a repository-enforced workflow policy. Batch 14 removes the testnet signer's dependency on direct writeback to whichever protected/default branch launched the workflow. Batch 15 reimplements the useful human-readable root landing from stale PR #63 on the canonical published seller without merging obsolete draft-path history.

The production branch remains separately protected with the same required checks and remains at `bc6b1a80aa4f71a7db68c35c07c54bbae7e69ef9`.

## Deployment boundary

Render auto-deploys from `feat/hermes-commerce-control-plane`, not from `main`. Repository hardening merged into `main` does **not** deploy production.

PR **#89** is the sole current production-promotion candidate. It is OPEN/DRAFT/UNMERGED on `promote/main-through-batch-10` and targets the protected Render-linked production branch. Merging #89 is a live production deployment event and requires explicit production authorization.

The direct `main` → production attempt in PR #88 was closed unmerged after GitHub confirmed a real dirty history conflict. The older Batch-6B-only PR #79 was also closed unmerged as stale. Neither changed production.

The promotion branch uses explicit reconciliation commits: production remains an ancestor while the candidate file tree is taken from validated canonical `main`. If `main` advances before deployment, refresh and revalidate the promotion branch before any merge rather than treating an older green check as current.

The repository candidate `render.yaml` uses `products/published/data-quality-profiler`; that candidate root is not proof that the live Render service has moved. Validated implementation through Batch 15 remains **not production-deployed**.

## Closed validation batches

| Batch | State | Validated head / action |
|---|---|---|
| P0 Security Batch 1 | CLOSED | `fd61b87914a33ba37daf745724a812abe02d9d2c` |
| P1 Financial Safety Batch 2 | CLOSED | `0aa39b5da62221b0a22a6a280ac177da1a0ba2da` |
| P1 Financial Durability Batch 3 | CLOSED | `e4ccc000f4ff09fb1e89f04655467ee8c9c9bba9` |
| P1 Production Change-Control Batch 4 | CLOSED | `f0f9503a4b01cff98003de9b06f4f77db2ce2fdb` |
| P1 Preview Resource-Abuse Batch 5 | CLOSED | `ab06f198904ff67e3d4b518d8c177af460a2c8ca` |
| P1 Canonical-State Batch 6A | CLOSED | `54674d29ffb6fed9614ea6ef56b1520d16a8ec47` |
| P1 Seller Lifecycle Batch 6B | CLOSED | `c9512348567459be3164f2413d4e187a7bed7501` |
| P1 Repository Alignment Batch 6C | CLOSED | PR #81 aligned canonical state into `main` without production deploy |
| P1 Commerce Control Durability Batch 7 | CLOSED | `378fdcec5240076c20381b3310ad7fbdb018eae9`, PR #82, merged to `main` as `db344147e8ed490f486a6aa86f4b19a3e1d675bf` |
| P1 Seller Pricing Source Batch 8 | CLOSED | code validated at `85918d271c107881d8cd9a7781370f4e1742a42e`, merge PR #84 |
| P1 Upstream Response Bounds Batch 9 | CLOSED | `f9d465fa0986fb6f9a902acfae2a3fb2a57a2576`, PR #86, merged to `main` as `dcaa00adb88e3ed62207a870be95128d500a4edb` |
| P1 Holiday Provenance Batch 10 | CLOSED | code validated at `63a8d78a3c0db7d6de75e3f267647015af4cccec`, merge PR #87 |
| P1 Production Candidate Alignment Batch 11 | CLOSED | draft PR #89; reconciliation candidate refreshed and validated as `main` advanced; production unchanged |
| P1 Public/Private Runtime Boundary Batch 12 | CLOSED | code validated at `53b1c500af48257cd524f674367041640ec0850a`, PR #91 |
| P1 Workflow Shell Interpolation Batch 13 | CLOSED | code validated at `5e1d0ce3e7d6a790acfaf3409ca67c82185a4ce0`, PR #92 |
| P1 Testnet Signer Writeback Batch 14 | CLOSED | code validated at `c1c4778cd04a6dd77f35f1cd8fd3cf7a7a9d0378`, PR #93 |
| P1 Root Landing Extraction Batch 15 | CLOSED | code validated at `797ea54dcf888036dea50ebc7a16a0f78a99fe78`, PR #94; replaces stale PR #63 semantics on canonical seller |

## Financial state

Tracked JSON ledgers are audit snapshots, not the transactional runtime database.

- Mainnet: `state/commerce-control/ledgers/mainnet-budget-ledger.json`, blob `9a9e87dce730cc3fddcbdcf8926b12d53c6046ab`.
- Testnet: `state/commerce-control/ledgers/testnet-budget-ledger.json`, blob `0632862d26c600634068b61669db8de11faa8dad`.
- Mainnet validated totals: initial `2380000`, spent `10000`, remaining `2370000` atomic USDC.

The authoritative mainnet SQLite database remains local/gitignored and must not be initialized, replaced, exported, or reconciled for repository cleanup.

## Seller lifecycle and pricing

Canonical seller source:

`products/published/data-quality-profiler/`

Batch 6B moved the seller tree byte-for-byte from `products/drafts/data-quality-profiler/`; active workflows, financial CI, distribution CI, Commerce Control readiness inspection, and repository Render configuration use the published path.

Batch 8 makes `products/published/data-quality-profiler/src/config.mjs` the canonical seller price source. `SELLER_PRICE_DEFAULTS` contains the thirteen default prices and `SELLER_PRICE_CATALOG` binds each paid route to its config key, environment variable, and default. Config resolution, the Agent402 manifest, and public OpenAPI now normalize from this authority rather than carrying independent runtime fallbacks.

The previously drifting defaults are now explicitly aligned:

- `/v1/dependency-vulnerability-check` — `$0.005`
- `/v1/package-maintenance-snapshot` — `$0.005`

The Batch 8 pricing-consistency suite proves all thirteen defaults and route-specific environment overrides match between resolved config, `/.well-known/x402`, and OpenAPI; it also verifies the payment plugin consumes every canonical price config key. The existing Distribution Readiness CI path filter already covers the entire published seller tree, so changes to the canonical price source automatically run distribution contracts and the full seller suite.

Published repository lifecycle **does not mean deployed**. Production remains on the older protected deployment branch until #89 is deliberately authorized and merged.

## Public root landing

Batch 15 replaces the useful intent of stale PR #63 on the current seller architecture. `src/root-landing.mjs` provides a static, read-only `GET /` API-discovery page and `src/server.mjs` registers it before listening. The canonical `app.mjs` and payment implementation remain unchanged.

The landing page links to `/openapi.json`, `/llms.txt`, `/.well-known/x402`, and `/health`, includes no request-derived content, is bounded below 16 KiB by regression, and sends a restrictive content-security policy plus `X-Content-Type-Options: nosniff`. It is public discovery only and does not alter paid-route protection or pricing.

## Public/private seller deployment boundary

Batch 12 makes the repository package and the public Docker artifact intentionally different scopes without moving or deleting financial/operator source needed by CI and controlled operations.

The Render candidate uses the seller Dockerfile, which installs production dependencies and copies only `src/` into the image. `.dockerignore` excludes repository-only `scripts/`, `test/`, and `docs/`, buyer discovery under `src/discovery/`, and the private buyer-policy, financial-store, ledger, and reconciliation modules under `src/payments/`.

The public server import-graph regression starts at `src/server.mjs`, recursively follows local static and dynamic imports, requires `src/payments/x402-plugin.mjs` to remain reachable for seller payment enforcement, and rejects any reachability into the excluded buyer/discovery/private-financial modules. The Docker-boundary regression also rejects whole-context, scripts, or test copies. Private tooling remains in Git for CI/admin use but is outside the public seller build context and image.

## GitHub Actions shell safety

Batch 13 closes direct expression interpolation in workflow shell commands. The testnet signer passes workflow-dispatch input, repository/ref values, and runner-temporary paths through step `env:` before shell use; the arbitrary `purchaseId` is quoted as a shell variable rather than inserted into the command text before execution.

`.github/scripts/workflow-policy-check.mjs` scans every workflow `run:` line and multiline `run:` block and fails if it contains a direct `${{ ... }}` GitHub expression. Expressions remain valid in non-shell YAML contexts such as `env:`, `with:`, and concurrency definitions. This makes environment mediation a structural invariant instead of a one-off signer fix.

## Testnet signer audit writeback

Batch 14 keeps the manual external signer testnet-only while making its successful writeback compatible with protected canonical branches. After signing/reconciliation and export, a changed testnet audit snapshot is committed to a unique branch named `testnet-audit/run-<run_id>-<run_attempt>`.

The signer does **not** push the result back to `github.ref_name`, does not force-push, and does not auto-merge the audit branch. The branch name is written into the workflow summary for operator inspection. This means a successful testnet financial operation no longer depends on bypassing `main` or production branch protection after value movement has already occurred.

Workflow policy enforces the run-scoped audit branch pattern, forbids `github.ref_name` in the signer workflow, requires the explicit `AUDIT_BRANCH` push target, and rejects signer force pushes. This does not solve crash recovery before the export/writeback step; temporary Actions SQLite crash durability remains separate testnet-only debt.

## Seller upstream resource bounds

Batch 9 replaced post-buffer size checks and unbounded JSON reads on public upstream integrations with bounded pre-parse reads:

- OSV — 2 MiB;
- npm/PyPI registry responses — 8 MiB;
- RDAP — 2 MiB, preserving degrade-to-unavailable behavior;
- SEC ticker map and submissions — 8 MiB each;
- SEC company facts — 32 MiB, preserving optional/degraded behavior;
- OFAC SDN/ALT/ADD CSVs — 32 MiB each.

`src/bounded-response.mjs` rejects oversized declared `Content-Length` before consumption, cancels the body, and byte-counts native streaming bodies so a missing or false length cannot force an unbounded application buffer. The existing hardened company-domain website transport remains separate because it already had streaming byte limits.

## Counterparty holiday provenance

Batch 10 makes the counterparty-availability holiday result explicitly advisory. Every response includes `holiday_calendar` provenance identifying the deterministic repository rule set, its version and source path, evaluated year and jurisdiction scope, and `live_authoritative_lookup: false`, plus limitations covering regional and one-off calendar differences.

The API retains its existing business-day fields for compatibility, but consumers are explicitly told to confirm an official calendar for legal, payroll, contractual, or time-critical decisions.

Brazil's national-scope rule set no longer marks Carnival Monday or Tuesday as public holidays. Brazil's official 2026 federal calendar classifies those days as `ponto facultativo`, while actual national holidays such as Tiradentes remain holidays in the seller rule set.

## Commerce Control durability

`tools/hermes-commerce-control/` remains the Commerce Control package. Batch 7 closed the known durability gaps without enabling external writes or value movement.

Durability guarantees include:

- opportunity JSONL tail repair, dedupe, and append are serialized across independent processes with bounded stale-lock recovery;
- evaluator workers acquire a durable per-request/evaluator lease **before** calling the model, preventing duplicate concurrent evaluations;
- verification-resolution JSONL writes are serialized and duplicate resolution IDs are suppressed;
- untrusted service/work/probe/evidence/policy/intent/operation text is sanitized **before SQLite persistence**, not merely when exported;
- future legacy analytics exports live only under `analytics/commerce-control/legacy/` using `*-snapshot.json` filenames and explicitly declare `authority: false`;
- the exporter structurally refuses `state/` destinations and `*-latest.json` filenames.

Current legacy export paths are:

- `analytics/commerce-control/legacy/services-snapshot.json`
- `analytics/commerce-control/legacy/work-snapshot.json`
- `analytics/commerce-control/legacy/source-health-snapshot.json`
- `analytics/commerce-control/legacy/status-snapshot.json`

The former active-looking tracked snapshots remain preserved by exact Git blob identity under `Unknown/Archived/legacy-commerce-exports/2026-08-29/`.

## PR state

Deliberately retained open PRs:

- **#8** — deferred the402 provider adapter; do not merge stale implementation wholesale. If revived, rebase/reimplement and add replay protection.
- **#89** — current production-promotion candidate; OPEN/DRAFT/UNMERGED. Do not merge without explicit production authorization and current Render inspection.

Superseded or replaced PRs:

- **#63** — stale draft-path root landing; useful semantics reimplemented on canonical seller by Batch 15 / PR #94; close unmerged.
- **#79** — CLOSED/UNMERGED; stale Batch-6B-only production candidate.
- **#88** — CLOSED/UNMERGED; direct-main candidate with confirmed dirty history conflict.

PR **#82** is merged and closed as Batch 7. Draft PRs **#83** and **#85** were validated but closed unmerged solely because the ChatGPT GitHub connector could not clear their draft flags; their identical validated branches were merged through non-draft PRs **#84** and **#86** respectively. PR **#87** merged Batch 10 into protected `main`. PR **#91** merged Batch 12. PR **#92** merged Batch 13. PR **#93** merged Batch 14. PR **#94** is the Batch 15 protected-main merge path.

## Archive policy

`Unknown/Archived/` is historical evidence only. No active runtime may treat it as configuration or current state. Never place raw credentials or secrets in the repository archive.

## Rules for future agents

1. Read `state/CURRENT.json` and this document before older status, handoff, plan, receipt, or research files.
2. A filename containing `latest` is not automatically current; Commerce Control may no longer generate `*-latest.json` outputs.
3. A closed validation batch or `products/published/` path is not automatically deployed.
4. Merging #89 is a production deployment event; do not use it merely for validation or repository cleanup. Refresh/revalidate its promotion branch if `main` has advanced.
5. All seller default-price changes must update the canonical `SELLER_PRICE_DEFAULTS` / `SELLER_PRICE_CATALOG` authority and pass the pricing-consistency suite.
6. Counterparty holiday output is advisory static-rule data, not a live authoritative calendar; retain provenance and limitations if the holiday implementation changes.
7. Public seller Docker changes must preserve the Batch 12 boundary: seller payment enforcement may ship, but buyer/discovery/private financial/operator modules must remain outside the public server import graph and Docker artifact.
8. GitHub expressions must not appear directly inside workflow `run:` commands or blocks; pass values through `env:` and quote shell variables.
9. Testnet signer audit snapshots must write only to run-scoped `testnet-audit/` branches; do not write directly to the selected/default/protected branch or force-push audit refs.
10. Preserve the public root landing as a static read-only discovery surface; do not add request-derived HTML or couple it to payment execution.
11. Preserve uncertain historical material before removing it.
12. Never commit secrets, private paid results, local SQLite/WAL/SHM files, or generated `node_modules`.
