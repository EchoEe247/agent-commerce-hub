# Current State

> **Canonical operational truth:** this document and `state/CURRENT.json` are the repository-level current-state sources. Historical receipts, plans, handoffs, `*-latest` snapshots, and `Unknown/Archived/` material are evidence, not authority, unless explicitly referenced here.

Last current-state update: **2026-08-29**.

## Repository roles

- **Canonical/default repository branch:** `main`, aligned by Batch 6C PR #81.
- **Production deployment branch:** `feat/hermes-commerce-control-plane`.
- **Latest completed implementation batch:** P1 Commerce Control Durability Batch 7, validated on PR #82.

Before Batch 6C, `main` was stale at `fb1574abcad25f68c59d9589ae1701d43e3107cc`. That exact head is preserved by `archive/batch-6c-main-before-alignment-fb1574a`.

The production branch remains separately protected with required `workflow-policy`, `seller`, and `commerce-control` checks, admins enforced, and force-push/deletion disabled.

## Deployment boundary

Render auto-deploys from `feat/hermes-commerce-control-plane`, not from `main`. Repository hardening merged into `main` does **not** deploy production.

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
| P1 Repository Alignment Batch 6C | CLOSED | PR #81 aligned canonical state into `main` without production deploy |
| P1 Commerce Control Durability Batch 7 | CLOSED | code validated at `fcb576a485e3629dd739d1f8760bfa5ec5e724fd`, PR #82 |

## Financial state

Tracked JSON ledgers are audit snapshots, not the transactional runtime database.

- Mainnet: `state/commerce-control/ledgers/mainnet-budget-ledger.json`, blob `9a9e87dce730cc3fddcbdcf8926b12d53c6046ab`.
- Testnet: `state/commerce-control/ledgers/testnet-budget-ledger.json`, blob `0632862d26c600634068b61669db8de11faa8dad`.
- Mainnet validated totals: initial `2380000`, spent `10000`, remaining `2370000` atomic USDC.

The authoritative mainnet SQLite database remains local/gitignored and must not be initialized, replaced, exported, or reconciled for repository cleanup.

## Seller lifecycle

Canonical seller source:

`products/published/data-quality-profiler/`

Batch 6B moved the seller tree byte-for-byte from `products/drafts/data-quality-profiler/`; active workflows, financial CI, distribution CI, Commerce Control readiness inspection, and repository Render configuration use the published path.

Published repository lifecycle **does not mean deployed**. Production remains on the older protected deployment branch until #79 is deliberately merged.

## Commerce Control durability

`tools/hermes-commerce-control/` remains the Commerce Control package. Batch 7 closes the known durability gaps without enabling external writes or value movement.

Durability guarantees now include:

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

The former active-looking tracked snapshots were preserved by exact Git blob identity and retired from their old paths:

- services: `74eac508a8c54e1e0e50101b9d817051c3a12765`
- work: `963facec4a4cf93fa8aa43c904190f07b00e1e24`
- source health: `f2969d7242a0ce9b5b03702f9ca1f6c44be403cc`

Archive location: `Unknown/Archived/legacy-commerce-exports/2026-08-29/`.

## PR state

Batch 6C preserved historical terminal identities in `Unknown/Archived/branches/2026-08-29-batch-6c-pr-branch-index.md`.

Deliberately retained older PRs:

- **#8** — deferred the402 provider adapter; do not merge stale implementation wholesale. If revived, rebase/reimplement and add replay protection.
- **#63** — useful root landing page; extract/rebase onto the canonical seller later.
- **#79** — production-promotion candidate; OPEN/DRAFT/UNMERGED.

PR **#82** is the Batch 7 Commerce Control durability change targeting `main`. It does not target the Render-linked production branch.

## Remaining repository administration

Canonical `main` still needs branch protection equivalent to the production checks, and obsolete preserved branch refs can be deleted after consulting the Batch 6C archive index. Those are mechanical GitHub-administration tasks; they do not require a production deployment or financial runtime mutation.

## Archive policy

`Unknown/Archived/` is historical evidence only. No active runtime may treat it as configuration or current state. Never place raw credentials or secrets in the repository archive.

## Rules for future agents

1. Read `state/CURRENT.json` and this document before older status, handoff, plan, receipt, or research files.
2. A filename containing `latest` is not automatically current; Commerce Control may no longer generate `*-latest.json` outputs.
3. A closed validation batch or `products/published/` path is not automatically deployed.
4. Merging #79 is a production deployment event; do not use it merely for validation or repository cleanup.
5. Preserve uncertain historical material before removing it.
6. Never commit secrets, private paid results, local SQLite/WAL/SHM files, or generated `node_modules`.
