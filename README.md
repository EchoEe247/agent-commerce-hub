# agent-commerce-hub

Shared coordination repository for commerce research, product preparation, handoffs, and results between Hermes and ChatGPT.

## Core rule

GitHub is the shared evidence and coordination layer. It is **not** a secret store, wallet, or credential vault.

## Repository layout

```text
agent-commerce-hub/
├── research/
│   ├── raw/              # Immutable source captures from marketplaces
│   ├── normalized/       # Machine-readable normalized datasets
│   ├── reports/          # Human-readable market reports
│   └── opportunities/    # Evidence-backed opportunity analyses
├── handoffs/
│   ├── hermes-to-chatgpt/
│   └── chatgpt-to-hermes/
├── products/
│   ├── drafts/
│   ├── ready/
│   └── published/
├── analytics/            # Performance and market comparison outputs
├── receipts/             # Non-secret operational receipts/status records
├── schemas/              # Shared machine-readable contracts
├── state/                # Current coordination state
└── docs/                 # Operating and security documentation
```

## Ownership model

- **Hermes:** live market collection, raw evidence, normalization, runtime validation, publication/execution status.
- **ChatGPT:** analysis, opportunity selection, product design/review, QA, pricing/listing strategy, post-result analysis.
- **GitHub:** canonical shared handoff surface between the two.

## Never commit

Do not commit passwords, API keys, access tokens, private keys, wallet seeds, recovery phrases, NWC connection strings, payment preimages, session cookies, Authorization headers, or equivalent credentials.

See `docs/HANDOFF_PROTOCOL.md` and `docs/SECURITY.md` before writing automated outputs.
