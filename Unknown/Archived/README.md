# Unknown / Archived

This directory holds material that is **not** current operational source and
must not be executed, deployed, or read by any active runtime as authoritative.

## What belongs here

- Historical evidence (preservation receipts, snapshots, audit manifests).
- Unknown / superseded material awaiting later classification.
- Sanitized pointers to local-only preservation that lives outside Git.

## Historical evidence vs current source

Current source is the candidate branch `reconcile/2026-08-27-canonical-candidate`
(and the remote feature branch it is based on). Material under `Unknown/Archived`
describes points in time and divergent local states; it does not override the
candidate.

## Unknown / superseded material

Items classified `unknown` or `superseded` during reconciliation are retained
here for the later "Unknown/Archived" organization phase. They are not imported
into the canonical source tree.

## Preservation requirements

The full 126 MB local preservation mirror and the complete local preservation
directory live **outside Git** (in the Hermes-local area and the original
checkout's `Unknown/Archived/2026-08-27-reconciliation-preservation`). They are
evidence only. Originals were copied, never moved or deleted.

## No active runtime should read archived material as authoritative

No service, workflow, or test may treat `Unknown/Archived` contents as current
configuration, ledgers, or source.

## Raw secrets must never be placed here in Git

Raw credential material (private keys, plaintext tokens, encrypted/quarantined
identity) is excluded from this repository-local archive. Only sanitized
receipts and metadata pointing to the restrictive Hermes-local preservation area
may be committed.
