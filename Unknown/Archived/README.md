# Unknown / Archived

This directory holds material that is **not** current operational source and
must not be executed, deployed, or read by any active runtime as authoritative.

## What belongs here

- Historical evidence (preservation receipts, snapshots, audit manifests).
- Unknown / superseded material awaiting later classification.
- Sanitized pointers to local-only preservation that lives outside Git.

## Historical evidence vs current source

Current operational source lives outside this directory and is determined by
the repository's canonical branch plus its current-state documentation.
Material under `Unknown/Archived` describes points in time, superseded designs,
or divergent local states; it never overrides current source.

## Unknown / superseded material

Items classified `unknown` or `superseded` during reconciliation may be retained
here for later review. Archived material is not imported into the active source
tree merely because it was preserved.

## Preservation requirements

The full local preservation mirror and complete local preservation directory
live **outside Git** in the restricted Hermes-local area and original checkout.
They are evidence only. Originals were copied, never moved or deleted during
the preservation freeze.

## No active runtime should read archived material as authoritative

No service, workflow, test, installer, or scheduler may treat
`Unknown/Archived` contents as current configuration, ledgers, state, or source.

## Raw secrets must never be placed here in Git

Raw credential material (private keys, plaintext tokens, encrypted/quarantined
identity, or raw secret-bearing configuration) is excluded from this
repository-local archive. Only sanitized receipts and metadata pointing to the
restricted local preservation area may be committed.
