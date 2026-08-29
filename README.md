# agent-commerce-hub

Shared coordination, product, research, and change-control repository for the agent-commerce system.

## Start here

For current operational state, read:

1. [`docs/CURRENT_STATE.md`](docs/CURRENT_STATE.md) — human-readable current state.
2. [`state/CURRENT.json`](state/CURRENT.json) — machine-readable current state.

Those two files are the repository-level source of truth for what is current. Older `STATUS.json`, `*-latest` research files, dated receipts, plans, handoffs, and archived material are historical evidence unless `CURRENT` explicitly references them.

## Production boundary

The production branch is `feat/hermes-commerce-control-plane` and is protected by required CI checks. Render auto-deploys from that branch, so merging a promotion PR into it is a production deployment event.

Validated security/financial hardening may exist on staged branches before it is deployed. Do not equate “validated/closed” with “live.”

## Repository layout

```text
agent-commerce-hub/
├── docs/                 # Current-state, operating, security, and subsystem docs
├── state/                # CURRENT.json and tracked audit snapshots
├── products/             # Seller/product source; lifecycle cleanup is in progress
├── tools/                 # Hermes Commerce Control and related tooling
├── research/             # Historical/current research evidence; "latest" is not authority by name alone
├── analytics/            # Analysis outputs
├── receipts/             # Non-secret operational receipts
├── schemas/              # Shared machine-readable contracts
├── handoffs/             # Historical/active coordination handoffs
└── Unknown/Archived/     # Non-authoritative preserved historical/unknown material
```

## Core rules

- GitHub is a source/evidence/change-control layer, **not** a secret store, wallet, or credential vault.
- Never commit passwords, API keys, tokens, private keys, wallet seeds, recovery phrases, NWC strings, payment preimages, session cookies, authorization headers, reusable signed payment authorizations, private paid results, local SQLite/WAL/SHM state, or generated `node_modules`.
- Anything under `Unknown/Archived/` is historical evidence and must never be read by an active runtime as current configuration or state.
- A file named `latest` is not automatically current.
- Preserve uncertain historical material before removing or relocating it.

See `docs/SECURITY.md`, `docs/HANDOFF_PROTOCOL.md`, and `docs/CURRENT_STATE.md` before automated writes.
