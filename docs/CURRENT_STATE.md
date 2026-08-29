# Current State

> **Canonical operational truth:** this document and `state/CURRENT.json` are the only repository-level current-state sources. Historical receipts, `*-latest` research snapshots, plans, handoffs, and anything under `Unknown/Archived/` are evidence, not authority, unless this document explicitly points to them.

Last canonicalization update: **2026-08-29**.

## Repository roles

- **GitHub** is the shared source/evidence and change-control surface. It is not a secret store or wallet.
- **Production branch:** `feat/hermes-commerce-control-plane`.
- **GitHub default branch:** `main` (alignment is intentionally deferred to Batch 6C).
- **Latest independently validated baseline:** `chore/p1-canonical-state-batch-6a` at `54674d29ffb6fed9614ea6ef56b1520d16a8ec47`.
- **Current canonicalization branch:** `chore/p1-seller-lifecycle-batch-6b`.

The production branch is protected and requires a pull request with strict passing `workflow-policy`, `seller`, and `commerce-control` checks. Admins are included; force-push and branch deletion are disabled.

## Deployment boundary

Render is configured to auto-deploy from `feat/hermes-commerce-control-plane`. Therefore **merging a promotion PR into that branch is a production deployment event**.

The P0/P1 hardening through Batch 5 and Canonical-State Batch 6A are staged and validated but have **not** been merged into the production branch. Do not interpret a closed validation batch, a `products/published/` path, or a draft promotion PR as proof that its code is already live.

Batch 6B changes the repository-declared Render `rootDir` to the canonical published seller path so the future production promotion can move source and deployment configuration atomically. No live Render setting is changed during Batch 6B validation.

## Closed hardening baseline

| Batch | State | Authoritative validated head |
|---|---|---|
| P0 Security Batch 1 | CLOSED | `fd61b87914a33ba37daf745724a812abe02d9d2c` |
| P1 Financial Safety Batch 2 | CLOSED | `0aa39b5da62221b0a22a6a280ac177da1a0ba2da` |
| P1 Financial Durability Batch 3 | CLOSED | `e4ccc000f4ff09fb1e89f04655467ee8c9c9bba9` |
| P1 Production Change-Control Batch 4 | CLOSED | `f0f9503a4b01cff98003de9b06f4f77db2ce2fdb` |
| P1 Preview Resource-Abuse Batch 5 | CLOSED | `ab06f198904ff67e3d4b518d8c177af460a2c8ca` |
| P1 Canonical-State Batch 6A | CLOSED | `54674d29ffb6fed9614ea6ef56b1520d16a8ec47` |

Key properties of that validated baseline include:

- public Actions buyer cannot execute production purchases;
- paid-result material is not published as a public Actions artifact;
- company-domain network traversal has SSRF/rebinding protections;
- production payment configuration fails closed;
- mainnet/testnet financial histories are physically separated;
- authoritative runtime financial state uses local SQLite with reservation/CAS and conservative reconciliation;
- signed authorization material is excluded from tracked audit exports;
- production branch change control is protected by required CI checks;
- the free company-domain preview is DNS-only, bounded, cached, de-duplicated, and rate-limited;
- repository current-state authority is `docs/CURRENT_STATE.md` plus `state/CURRENT.json`, with stale operational status moved to the archive.

## Financial state

Tracked JSON ledgers are **audit snapshots**, not the transactional runtime database.

Canonical tracked ledger paths:

- mainnet: `state/commerce-control/ledgers/mainnet-budget-ledger.json`
- testnet: `state/commerce-control/ledgers/testnet-budget-ledger.json`

Validated blob identities:

- mainnet: `9a9e87dce730cc3fddcbdcf8926b12d53c6046ab`
- testnet: `0632862d26c600634068b61669db8de11faa8dad`

Mainnet validated audit totals:

- initial budget: `2380000` atomic USDC
- spent: `10000`
- remaining: `2370000`

The authoritative mainnet SQLite runtime database is local/gitignored and must never be committed. Do not initialize, replace, export, or reconcile it merely to update repository documentation.

## Seller lifecycle

The canonical seller path in the Batch 6B repository candidate is:

`products/published/data-quality-profiler/`

Batch 6B moves the seller tree from the historical `products/drafts/data-quality-profiler/` path **without changing seller file contents as part of the tree move**. Active GitHub workflows, the Commerce Control readiness inspector, tests, and `render.yaml` are updated coherently to the published path.

The old `products/drafts/data-quality-profiler/` path is retired for active source. Historical receipts/plans may still mention it as point-in-time evidence.

This lifecycle move is **staged, not deployed** until an authorized promotion is merged into the protected production branch. The seller exposes thirteen paid x402 POST operations plus one free bounded company-domain preview.

## Commerce Control

`tools/hermes-commerce-control/` remains the Commerce Control package. Its product-readiness inspector follows the canonical published seller path in Batch 6B.

Legacy generated files remain **non-authoritative snapshots**:

- `research/normalized/commerce-control/services-latest.json`
- `research/normalized/commerce-control/work-latest.json`
- `analytics/commerce-control/source-health-latest.json`
- `analytics/commerce-control/status-latest.json`

Batch 6A moved the legacy status exporter out of the retired authoritative-looking path `state/commerce-control/STATUS.json`; the exporter can no longer recreate that retired state path. The remaining `*-latest` namespace cleanup is deferred to the later Commerce Control durability batch.

## Staged pull requests

- **PR #76** — Batch 4 promotion subset; OPEN/DRAFT/UNMERGED. Do not merge. Superseded by later staged candidates; disposition deferred to Batch 6C.
- **PR #77** — Batch 5 promotion subset; OPEN/DRAFT/UNMERGED. Do not merge. Superseded by later staged candidates; disposition deferred to Batch 6C.
- **PR #78** — Batch 6A promotion subset; OPEN/DRAFT/UNMERGED. Do not merge. Superseded by PR #79; disposition deferred to Batch 6C.
- **PR #79** — Batch 6B seller-lifecycle candidate; OPEN/DRAFT/UNMERGED. This is the newest complete staged candidate. Do not merge while Batch 6 canonicalization continues.

Production-target validation PRs remain draft/unmerged until the canonicalization sequence is complete and a deliberate production deployment is authorized.

## Archive policy

`Unknown/Archived/` is historical evidence only. No active runtime may treat it as configuration or current state.

During Batch 6A, stale operational status and retired seller-live `latest` material were preserved there by exact Git blob identity before being removed from active current-state paths.

Never place raw credentials or secrets in the repository archive.

## Current cleanup sequence

1. **Batch 6A — canonical state + stale operational truth archive** — CLOSED at `54674d29ffb6fed9614ea6ef56b1520d16a8ec47`
2. **Batch 6B — seller lifecycle move out of `drafts` + coherent path updates** — CURRENT / PR #79
3. **Batch 6C — branch/PR cleanup + default/canonical branch alignment**
4. **Later Commerce Control durability** — JSONL inter-process locking/claim safety, sanitizer/storage invariant, and remaining legacy export namespace cleanup

## Rules for future agents

1. Read `state/CURRENT.json` and this document before using older status, receipt, handoff, plan, or research material.
2. A file named `latest` is not automatically current.
3. A closed batch or a path under `products/published/` is not automatically deployed.
4. Do not merge a production-target PR merely to validate it; production PRs trigger Render deployment when merged.
5. Preserve uncertain historical material before moving/removing it.
6. Never commit secrets, private paid results, local SQLite/WAL/SHM files, or generated `node_modules`.
