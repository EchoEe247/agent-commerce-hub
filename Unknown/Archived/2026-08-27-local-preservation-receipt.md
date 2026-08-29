# Local Preservation Receipt — 2026-08-27

Sanitized pointer only. No secret values or secret filesystem contents are
included.

- **Preservation date:** 2026-08-27
- **Purpose:** Evidence-preserving freeze for the `EchoEe247/agent-commerce-hub`
  reconciliation, taken before any candidate mutations.
- **Repository archive count (manifest items):** 535
  - copied into repository archive: 532
  - LOCAL_ONLY items: 511
  - LOCAL_ONLY or LOCAL_NEWER copied: 516
  - unpreserved blockers: 0
- **Manifest SHA-256 (repository and Hermes-local manifests):**
  `7812d3f7e414069730f2d4eb0a7aad5fb350274a8f2199c25a80886e831c0fc7`
- **External Hermes mirror:** a 126 MB tar mirror of the repository archive was
  written to the mode-0700 Hermes-local preservation area
  (`~/.hermes/commerce-control/Unknown/Archived/2026-08-27-reconciliation-preservation/`).
  Mirror SHA-256:
  `5e8ad035df28799cb4d87d61ba2a44fb6c2839461eb6da8ca6c76bb85a7b936b`
- **Raw local/private preservation:** exists outside Git. Originals were copied,
  not moved or deleted. No raw secret values are contained in this repository
  receipt.
- **Ledger copies:** two `budget-ledger.json` copies (dirty-main and
  runtime-proof/current-ref) were preserved independently. They are **not**
  byte-identical and they differ semantically:
  - `LEDGER_COPIES_IDENTICAL=NO`
  - `LEDGER_SEMANTIC_DIVERGENCE=YES`
  No ledger reconciliation, payment, signature, or external transaction was
  performed during the freeze.

This receipt is metadata only. It records preservation integrity and must not be
used as the current source of truth for runtime or financial state.
