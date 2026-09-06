# agent-commerce-hub

`agent-commerce-hub` is the shared coordination, product, research, and change-control repository for the agent-commerce system.

## Mission

The goal is straightforward: **help agents make real money with as little routine human babysitting as practical.**

That does not mean maximizing automation for its own sake. Repository work should improve the actual commercial loop:

`opportunity discovery → qualification → pricing → execution → quality control → delivery → payment → follow-up/repeat business → revenue measurement`

Prefer work that increases the probability, speed, value, or repeatability of getting paid, or that reduces the amount of operator intervention needed to get there.

Do not expand architecture, tooling, agent count, observability, or verification just because the engineering is interesting. Infrastructure earns its place when it enables revenue, removes a demonstrated commercial bottleneck, protects a real revenue path from a known failure mode, or makes successful paid work easier to repeat autonomously.

The boundary is equally important: revenue-first does **not** override production safety, financial authorization, security controls, legal/compliance requirements, or irreversible-risk decisions.

See [`docs/REVENUE_OPERATING_PRINCIPLES.md`](docs/REVENUE_OPERATING_PRINCIPLES.md) for the standing prioritization rules.

## Start with current authority

Before using old handoffs, research, receipts, or plans, read:

1. [`docs/CURRENT_STATE.md`](docs/CURRENT_STATE.md) — human-readable current operational state.
2. [`state/CURRENT.json`](state/CURRENT.json) — machine-readable current state.
3. [`docs/REVENUE_OPERATING_PRINCIPLES.md`](docs/REVENUE_OPERATING_PRINCIPLES.md) — durable revenue/autonomy policy.

The first two surfaces define what is current at repository level. Older `STATUS.json`, `*-latest` research files, dated receipts, plans, handoffs, and archived material are historical evidence unless `CURRENT` explicitly promotes or references them.

A file called `latest` is not automatically authority.

## Production boundary

The canonical/default branch is `main`.

The separately protected production branch is `feat/hermes-commerce-control-plane`, and Render deploys from that production branch rather than directly from `main`.

So:

> **merge to `main` ≠ production deployment**

A production change requires its own validated promotion, explicit production authorization, and separate review of any pending Render Blueprint mutation before that mutation is applied.

The canonical seller source is `products/published/data-quality-profiler/`. The lifecycle move from the former draft path is complete and the published path is live in production. Use [`docs/CURRENT_STATE.md`](docs/CURRENT_STATE.md) for the exact deployed commit and current Render state instead of copying those mutable details into multiple files.

## Repository layout

```text
agent-commerce-hub/
├── docs/                 # Current-state, operating, security, and subsystem docs
├── state/                # CURRENT.json and tracked audit snapshots
├── products/             # Published seller/product source plus lifecycle staging directories
├── tools/                # Commerce-control and related tooling
├── research/             # Research evidence; "latest" is not authority by name alone
├── analytics/            # Analysis outputs
├── receipts/             # Non-secret operational receipts
├── schemas/              # Shared machine-readable contracts
├── handoffs/             # Historical/active coordination handoffs
└── Unknown/Archived/     # Preserved non-authoritative historical/unknown material
```

## Core rules

- Revenue generation, practical agent autonomy, and reduced operator babysitting are standing optimization targets.
- GitHub is a source/evidence/change-control layer, **not** a secret store, wallet, or credential vault.
- Never commit passwords, API keys, tokens, private keys, wallet seeds, recovery phrases, NWC strings, payment preimages, session cookies, authorization headers, reusable signed payment authorizations, private paid results, local SQLite/WAL/SHM state, or generated `node_modules`.
- Anything under `Unknown/Archived/` is historical evidence and must never be consumed by an active runtime as current configuration or state.
- Preserve uncertain historical material rather than silently turning uncertainty into deletion or current truth.
- A technically complete change is not automatically the best next commercial action.
- A funded or attractive opportunity is not authorization to sign, fund, claim, purchase proof, submit, pay, or move value.

Before automated writes, read the relevant authority surfaces, especially:

- [`docs/SECURITY.md`](docs/SECURITY.md)
- [`docs/HANDOFF_PROTOCOL.md`](docs/HANDOFF_PROTOCOL.md)
- [`docs/REVENUE_OPERATING_PRINCIPLES.md`](docs/REVENUE_OPERATING_PRINCIPLES.md)
- [`docs/CURRENT_STATE.md`](docs/CURRENT_STATE.md)

The main operating idea is to keep moving the system toward **real, repeatable commercial execution with less operator work**, while being strict about the places where money, production, secrets, or irreversible actions require an actual authorization boundary.