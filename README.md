# agent-commerce-hub

Shared coordination, product, research, and change-control repository for the agent-commerce system.

## Mission

`agent-commerce-hub` exists to help agents make money with as little human babysitting as practical.

Repository work should preferentially improve the commercial loop from opportunity discovery through qualification, pricing, execution, quality control, delivery, payment, follow-up, and revenue measurement. Prefer work that increases the probability, speed, value, or repeatability of getting paid, or that materially reduces operator intervention needed to do so.

Do not expand architecture, tooling, agent count, observability, or verification merely because it is technically interesting. Infrastructure is justified when it enables revenue, removes a demonstrated commercial bottleneck, protects revenue from a real failure mode, or makes paid work more autonomous and reusable.

Production safety, financial authorization, security boundaries, and irreversible-risk controls still override speed when applicable.

See [`docs/REVENUE_OPERATING_PRINCIPLES.md`](docs/REVENUE_OPERATING_PRINCIPLES.md) for the standing prioritization and agent-autonomy rules.

## Start here

For current operational state, read:

1. [`docs/CURRENT_STATE.md`](docs/CURRENT_STATE.md) — human-readable current state.
2. [`state/CURRENT.json`](state/CURRENT.json) — machine-readable current state.
3. [`docs/REVENUE_OPERATING_PRINCIPLES.md`](docs/REVENUE_OPERATING_PRINCIPLES.md) — standing revenue-first and low-babysitting mission.

Those first two files are the repository-level source of truth for what is current. Older `STATUS.json`, `*-latest` research files, dated receipts, plans, handoffs, and archived material are historical evidence unless `CURRENT` explicitly references them. The revenue operating principles are durable project policy rather than transient state.

## Production boundary

The canonical repository branch is `main`. The separately protected production branch is `feat/hermes-commerce-control-plane`, and Render deploys from that branch rather than from `main`.

A merge to `main` is therefore **not** a production deployment. Production changes require a separately validated promotion into the protected production branch, explicit production authorization, and separate review of any pending Render Blueprint mutation before it is applied.

The canonical seller source is `products/published/data-quality-profiler/`; the lifecycle move from the former draft path is complete and the published path is live in production. See `docs/CURRENT_STATE.md` for the exact deployed commit and current Render state.

## Repository layout

```text
agent-commerce-hub/
├── docs/                 # Current-state, operating, security, and subsystem docs
├── state/                # CURRENT.json and tracked audit snapshots
├── products/             # Published seller/product source plus empty lifecycle staging directories
├── tools/                # Hermes Commerce Control and related tooling
├── research/             # Research evidence; "latest" is not authority by name alone
├── analytics/            # Analysis outputs
├── receipts/             # Non-secret operational receipts
├── schemas/              # Shared machine-readable contracts
├── handoffs/             # Historical/active coordination handoffs
└── Unknown/Archived/     # Non-authoritative preserved historical/unknown material
```

## Core rules

- Revenue generation, practical agent autonomy, and reduced operator babysitting are standing optimization targets; see `docs/REVENUE_OPERATING_PRINCIPLES.md`.
- GitHub is a source/evidence/change-control layer, **not** a secret store, wallet, or credential vault.
- Never commit passwords, API keys, tokens, private keys, wallet seeds, recovery phrases, NWC strings, payment preimages, session cookies, authorization headers, reusable signed payment authorizations, private paid results, local SQLite/WAL/SHM state, or generated `node_modules`.
- Anything under `Unknown/Archived/` is historical evidence and must never be read by an active runtime as current configuration or state.
- A file named `latest` is not automatically current.
- Preserve uncertain historical material before removing or relocating it.

See `docs/SECURITY.md`, `docs/HANDOFF_PROTOCOL.md`, `docs/REVENUE_OPERATING_PRINCIPLES.md`, and `docs/CURRENT_STATE.md` before automated writes.
