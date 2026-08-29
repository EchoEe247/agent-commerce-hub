# Current State

> **Canonical operational truth:** this document and `state/CURRENT.json` are the repository-level current-state sources. Historical receipts, plans, handoffs, `*-latest` snapshots, and `Unknown/Archived/` material are evidence, not authority, unless explicitly referenced here.

Last canonicalization update: **2026-08-29**.

## Repository roles

- **Canonical/default repository branch:** `main`, aligned by Batch 6C PR #81.
- **Production deployment branch:** `feat/hermes-commerce-control-plane`.
- **Validated Batch 6B baseline:** `c9512348567459be3164f2413d4e187a7bed7501`.

Before Batch 6C, `main` was stale at `fb1574abcad25f68c59d9589ae1701d43e3107cc`. That exact head is preserved by `archive/batch-6c-main-before-alignment-fb1574a`.

The first alignment PR (#80) exposed conflicts in the two legacy `main`-only signer/buyer workflow commits. Those versions were already superseded by the hardened canonical workflows. Rather than force-resetting `main`, Batch 6C kept the old `main` head as ancestry and applied the validated canonical tree as a snapshot. PR #81 is the final alignment merge.

The production branch remains separately protected with required `workflow-policy`, `seller`, and `commerce-control` checks, admins enforced, and force-push/deletion disabled.

## Deployment boundary

Render auto-deploys from `feat/hermes-commerce-control-plane`, not from `main`. Batch 6C alignment into `main` **does not deploy production**.

PR **#79** remains the production-promotion candidate. It stays OPEN/DRAFT/UNMERGED until an explicit production deployment is authorized. Merging #79 into the production branch is the deployment event.

The repository candidate `render.yaml` uses `products/published/data-quality-profiler`; that candidate root is not proof that the live Render service has moved.

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
| P1 Repository Alignment Batch 6C | CLOSED | PR #81 aligns canonical state into `main` without production deploy |

Validated properties include fail-closed production payment configuration, physically separated mainnet/testnet financial histories, local SQLite transactional authority, conservative reconciliation, private signed authorization material excluded from tracked audit exports, protected production change control, bounded free preview, explicit current-state authority, and the seller lifecycle move to the published path.

## Financial state

Tracked JSON ledgers are audit snapshots, not the transactional runtime database.

- Mainnet: `state/commerce-control/ledgers/mainnet-budget-ledger.json`, blob `9a9e87dce730cc3fddcbdcf8926b12d53c6046ab`.
- Testnet: `state/commerce-control/ledgers/testnet-budget-ledger.json`, blob `0632862d26c600634068b61669db8de11faa8dad`.
- Mainnet validated totals: initial `2380000`, spent `10000`, remaining `2370000` atomic USDC.

The authoritative mainnet SQLite database remains local/gitignored and must not be initialized, replaced, exported, or reconciled for repository cleanup.

## Seller lifecycle

Canonical seller source:

`products/published/data-quality-profiler/`

Batch 6B moved the seller tree byte-for-byte from `products/drafts/data-quality-profiler/`; active workflows, financial CI, distribution CI, Commerce Control readiness inspection, and repository Render configuration now use the published path. Historical documents may still mention the old path as point-in-time evidence.

Published repository lifecycle **does not mean deployed**. Production remains on the older protected deployment branch until #79 is deliberately merged.

## Commerce Control

`tools/hermes-commerce-control/` remains the Commerce Control package. Its seller-readiness inspector uses the canonical published seller path.

Legacy generated snapshots remain non-authoritative:

- `research/normalized/commerce-control/services-latest.json`
- `research/normalized/commerce-control/work-latest.json`
- `analytics/commerce-control/source-health-latest.json`
- `analytics/commerce-control/status-latest.json`

Inter-process JSONL locking/atomic claims, sanitizer/storage invariants, and remaining legacy-export namespace cleanup are deferred to the next Commerce Control durability work.

## PR cleanup

Batch 6C preserved terminal identities in `Unknown/Archived/branches/2026-08-29-batch-6c-pr-branch-index.md`.

Closed unmerged as temporary, historical, divergent, superseded, or conflicted:

`#1, #2, #33, #34, #35, #64, #76, #77, #78, #80`

Deliberately retained:

- **#8** — deferred the402 provider adapter; do not merge stale implementation wholesale. If revived, rebase/reimplement and add replay protection.
- **#63** — useful root landing page; extract/rebase onto canonical seller later.
- **#79** — current production-promotion candidate; OPEN/DRAFT/UNMERGED.

PR **#81** is the Batch 6C canonical `main` alignment merge. It does not target the Render-linked production branch and therefore is not a production deployment.

Obsolete branch-ref deletion is mechanical follow-up after preservation; it must never erase the archived terminal SHA record.

## Archive policy

`Unknown/Archived/` is historical evidence only. No active runtime may treat it as configuration or current state. Never place raw credentials or secrets in the repository archive.

## Current sequence

1. Batch 6A — canonical state/stale operational truth archive — CLOSED.
2. Batch 6B — seller lifecycle move/path rewiring — CLOSED.
3. Batch 6C — PR cleanup + default/canonical `main` alignment — CLOSED through PR #81; no production deployment.
4. Next coherent implementation: Commerce Control durability — JSONL multiwriter locking/atomic claims, sanitizer/storage invariant, legacy export namespace cleanup.

## Rules for future agents

1. Read `state/CURRENT.json` and this document before older status, handoff, plan, receipt, or research files.
2. A filename containing `latest` is not automatically current.
3. A closed validation batch or `products/published/` path is not automatically deployed.
4. Merging #79 is a production deployment event; do not use it merely for validation or repository cleanup.
5. Preserve uncertain historical material before removing it.
6. Never commit secrets, private paid results, local SQLite/WAL/SHM files, or generated `node_modules`.
