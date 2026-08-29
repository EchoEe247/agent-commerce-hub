# Unknown / Archived

This directory holds material that is **not** current operational source and must not be executed, deployed, or read by any active runtime as authoritative.

## Current authority

Repository-level current state lives in:

- `docs/CURRENT_STATE.md`
- `state/CURRENT.json`

Those files override historical status, plans, handoffs, receipts, and research snapshots when deciding what is current.

## What belongs here

- Historical evidence (preservation receipts, snapshots, audit manifests).
- Unknown or superseded material awaiting later classification.
- Stale operational-looking files preserved before removal from active namespaces.
- Sanitized pointers to local-only preservation that lives outside Git.

Batch 6A stale operational state is indexed under:

`Unknown/Archived/stale-operational-state/2026-08-29/README.md`

## Historical evidence vs current source

Material under `Unknown/Archived` describes points in time, superseded designs, or divergent local states; it never overrides current source merely because it was preserved.

## Preservation requirements

The full local preservation mirror and complete local preservation directory live **outside Git** in the restricted Hermes-local area and original checkout. They are evidence only. Originals were copied, never moved or deleted during the preservation freeze.

## No active runtime should read archived material as authoritative

No service, workflow, test, installer, or scheduler may treat `Unknown/Archived` contents as current configuration, ledgers, state, or source.

## Raw secrets must never be placed here in Git

Raw credential material (private keys, plaintext tokens, encrypted/quarantined identity, or raw secret-bearing configuration) is excluded from this repository-local archive. Only sanitized receipts and metadata pointing to the restricted local preservation area may be committed.
