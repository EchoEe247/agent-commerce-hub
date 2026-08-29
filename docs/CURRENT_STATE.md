# Current State

> **Canonical operational truth:** this document and `state/CURRENT.json` are the only repository-level current-state sources. Historical receipts, `*-latest` research snapshots, plans, handoffs, and anything under `Unknown/Archived/` are evidence, not authority, unless this document explicitly points to them.

Last canonicalization update: **2026-08-29**.

## Repository roles

- **GitHub** is the shared source/evidence and change-control surface. It is not a secret store or wallet.
- **Production branch:** `feat/hermes-commerce-control-plane`.
- **GitHub default branch:** `main` (alignment is intentionally deferred to Batch 6C).
- **Validated candidate baseline:** `fix/p1-preview-abuse-batch-5` at `ab06f198904ff67e3d4b518d8c177af460a2c8ca`.
- **Canonicalization branch:** `chore/p1-canonical-state-batch-6a`.

The production branch is protected and requires a pull request with strict passing `workflow-policy`, `seller`, and `commerce-control` checks. Admins are included; force-push and branch deletion are disabled.

## Deployment boundary

Render is configured to auto-deploy from `feat/hermes-commerce-control-plane`. Therefore **merging a promotion PR into that branch is a production deployment event**.

The P0/P1 hardening through Batch 5 is staged and validated but has **not** been merged into the production branch. Do not interpret a closed validation batch as proof that its code is already live.

## Closed hardening baseline

| Batch | State | Authoritative validated head |
|---|---|---|
| P0 Security Batch 1 | CLOSED | `fd61b87914a33ba37daf745724a812abe02d9d2c` |
| P1 Financial Safety Batch 2 | CLOSED | `0aa39b5da62221b0a22a6a280ac177da1a0ba2da` |
| P1 Financial Durability Batch 3 | CLOSED | `e4ccc000f4ff09fb1e89f04655467ee8c9c9bba9` |
| P1 Production Change-Control Batch 4 | CLOSED | `f0f9503a4b01cff98003de9b06f4f77db2ce2fdb` |
| P1 Preview Resource-Abuse Batch 5 | CLOSED | `ab06f198904ff67e3d4b518d8c177af460a2c8ca` |

Key properties of that validated baseline include:

- public Actions buyer cannot execute production purchases;
- paid-result material is not published as a public Actions artifact;
- company-domain network traversal has SSRF/rebinding protections;
- production payment configuration fails closed;
- mainnet/testnet financial histories are physically separated;
- authoritative runtime financial state uses local SQLite with reservation/CAS and conservative reconciliation;
- signed authorization material is excluded from tracked audit exports;
- production branch change control is protected by required CI checks;
- the free company-domain preview is DNS-only, bounded, cached, de-duplicated, and rate-limited.

## Financial state

Tracked JSON ledgers are **audit snapshots**, not the transactional runtime database.

Canonical tracked ledger paths:

- mainnet: `state/commerce-control/ledgers/mainnet-budget-ledger.json`
- testnet: `state/commerce-control/ledgers/testnet-budget-ledger.json`

Validated blob identities at the Batch 5 baseline:

- mainnet: `9a9e87dce730cc3fddcbdcf8926b12d53c6046ab`
- testnet: `0632862d26c600634068b61669db8de11faa8dad`

Mainnet validated audit totals:

- initial budget: `2380000` atomic USDC
- spent: `10000`
- remaining: `2370000`

The authoritative mainnet SQLite runtime database is local/gitignored and must never be committed. Do not initialize, replace, export, or reconcile it merely to update repository documentation.

## Seller lifecycle

The production-capable seller currently remains at:

`products/drafts/data-quality-profiler/`

That path name is historical and misleading. Moving it to a canonical production lifecycle location is deferred to **Batch 6B** so path changes, workflows, Render root configuration, tests, and documentation can move coherently in one batch.

The seller exposes thirteen paid x402 POST operations plus one free bounded company-domain preview.

## Commerce Control

`tools/hermes-commerce-control/` remains the Commerce Control package. Its legacy Mode-A snapshot files from August 19 are historical and must not be used as present operational state.

Legacy generated research files such as `research/normalized/commerce-control/services-latest.json` and `work-latest.json` are also **non-authoritative snapshots**. They remain in their existing namespace temporarily because the legacy exporter can regenerate them; exporter namespace/durability cleanup is deferred to the later Commerce Control durability batch.

## Staged pull requests

- **PR #76** — Batch 4 promotion subset; OPEN/DRAFT/UNMERGED. Do not merge. It is superseded as a complete promotion candidate by later staged work and will be dispositioned during Batch 6C.
- **PR #77** — Batch 5 promotion candidate; OPEN/DRAFT/UNMERGED. Do not merge. It includes the closed hardening baseline through Batch 5 but not Batch 6A canonicalization.

Any later Batch 6 promotion PR must also remain draft/unmerged until the repository canonicalization sequence is complete and a deliberate production deployment is authorized.

## Archive policy

`Unknown/Archived/` is historical evidence only. No active runtime may treat it as configuration or current state.

During Batch 6A, stale operational status and retired seller-live `latest` material are preserved there by exact Git blob identity before being removed from active current-state paths.

Never place raw credentials or secrets in the repository archive.

## Current cleanup sequence

1. **Batch 6A — canonical state + stale operational truth archive** (this branch)
2. **Batch 6B — seller lifecycle move out of `drafts` + coherent path updates**
3. **Batch 6C — branch/PR cleanup + default/canonical branch alignment**
4. **Later Commerce Control durability** — JSONL inter-process locking/claim safety, sanitizer/storage invariant, and legacy export namespace cleanup

## Rules for future agents

1. Read `state/CURRENT.json` and this document before using older status, receipt, handoff, plan, or research material.
2. A file named `latest` is not automatically current.
3. A closed batch is not automatically deployed.
4. Do not merge a production-target PR merely to validate it; production PRs trigger Render deployment when merged.
5. Preserve uncertain historical material before moving/removing it.
6. Never commit secrets, private paid results, local SQLite/WAL/SHM files, or generated `node_modules`.
