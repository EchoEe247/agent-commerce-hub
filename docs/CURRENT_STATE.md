# Current State

> **Canonical operational truth:** this document and `state/CURRENT.json` are the repository-level current-state sources. Historical receipts, plans, handoffs, `*-latest` snapshots, and `Unknown/Archived/` material are evidence, not authority, unless explicitly referenced here.

Last current-state update: **2026-08-29**.

## Repository roles

- **Canonical/default repository branch:** `main`.
- **Canonical main protection:** enabled; pull requests are required with strict `workflow-policy`, `seller`, and `commerce-control` checks, admins enforced, force-push/deletion disabled.
- **Production deployment branch:** `feat/hermes-commerce-control-plane`.
- **Latest completed implementation batch:** P1 Holiday Provenance Batch 10, code validated at `63a8d78a3c0db7d6de75e3f267647015af4cccec` through PR #87.

Batch 6C aligned canonical state into `main` through PR #81. Batch 7 was then validated at `378fdcec5240076c20381b3310ad7fbdb018eae9`, merged through PR #82, and completed its GitHub administration at `main` merge commit `db344147e8ed490f486a6aa86f4b19a3e1d675bf`. Ten already-archived obsolete branch refs were removed while preservation refs were retained.

Batch 8 centralized seller pricing and merged through PR #84. Batch 9 bounded public upstream response bodies before parsing, validated at `f9d465fa0986fb6f9a902acfae2a3fb2a57a2576`, and merged through PR #86 as `dcaa00adb88e3ed62207a870be95128d500a4edb`. Batch 10 adds explicit static holiday-rule provenance and corrects Brazil Carnival national-scope classification.

The production branch remains separately protected with the same required checks and remains at `bc6b1a80aa4f71a7db68c35c07c54bbae7e69ef9`.

## Deployment boundary

Render auto-deploys from `feat/hermes-commerce-control-plane`, not from `main`. Repository hardening merged into `main` does **not** deploy production.

PR **#79** remains the production-promotion candidate. It stays OPEN/DRAFT/UNMERGED until an explicit production deployment is authorized. Merging #79 into the production branch is the deployment event.

The repository candidate `render.yaml` uses `products/published/data-quality-profiler`; that candidate root is not proof that the live Render service has moved. Validated batches through Batch 10 remain **not production-deployed**.

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

No package or lockfile upgrade was required for Batch 8.

Published repository lifecycle **does not mean deployed**. Production remains on the older protected deployment branch until #79 is deliberately merged.

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

Batch 10 makes the counterparty-availability holiday result explicitly advisory. Every response now includes `holiday_calendar` provenance identifying the deterministic repository rule set, its version and source path, evaluated year and jurisdiction scope, and `live_authoritative_lookup: false`, plus limitations covering regional and one-off calendar differences.

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

Deliberately retained older PRs:

- **#8** — deferred the402 provider adapter; do not merge stale implementation wholesale. If revived, rebase/reimplement and add replay protection.
- **#63** — useful root landing page; extract/rebase onto the canonical seller later.
- **#79** — production-promotion candidate; OPEN/DRAFT/UNMERGED.

PR **#82** is merged and closed as Batch 7. Draft PRs **#83** and **#85** were validated but closed unmerged solely because the ChatGPT GitHub connector could not clear their draft flags; their identical validated branches were merged through non-draft PRs **#84** and **#86** respectively. PR **#87** is the protected-main Batch 10 merge path. None of these hardening PRs target the Render-linked production branch.

## Archive policy

`Unknown/Archived/` is historical evidence only. No active runtime may treat it as configuration or current state. Never place raw credentials or secrets in the repository archive.

## Rules for future agents

1. Read `state/CURRENT.json` and this document before older status, handoff, plan, receipt, or research files.
2. A filename containing `latest` is not automatically current; Commerce Control may no longer generate `*-latest.json` outputs.
3. A closed validation batch or `products/published/` path is not automatically deployed.
4. Merging #79 is a production deployment event; do not use it merely for validation or repository cleanup.
5. All seller default-price changes must update the canonical `SELLER_PRICE_DEFAULTS` / `SELLER_PRICE_CATALOG` authority and pass the pricing-consistency suite.
6. Counterparty holiday output is advisory static-rule data, not a live authoritative calendar; retain provenance and limitations if the holiday implementation changes.
7. Preserve uncertain historical material before removing it.
8. Never commit secrets, private paid results, local SQLite/WAL/SHM files, or generated `node_modules`.
