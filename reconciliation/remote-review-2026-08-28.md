# Remote Candidate Review — 2026-08-28

Reviewed candidate:

`a8a79cefe08be3d1a2f6cd9a9c0b7191c12b3041`

Base:

`bc6b1a80aa4f71a7db68c35c07c54bbae7e69ef9`

## Result

The dependency cleanup and preservation work are retained. Three corrections
were required before the candidate could be treated as a canonical baseline.

### 1. Partial B1-ID/BountyBook feature removed from candidate

The first reconciliation pass applied four tracked source fragments:

- `src/core/errors.ts`
- `src/network/safe-fetch.ts`
- `src/policy/engine.ts`
- `src/policy/modes.ts`

Those changes are part of a larger local-only B1-ID/BountyBook authentication
feature whose executor, identity modules, policy module, scripts, and dedicated
tests were deliberately not imported.

Remote review found that keeping only the fragment is not a neutral cleanup:

- it adds an authenticated `postAuthed` bearer-token network path;
- it adds a policy class that allows scoped BountyBook authentication before the
  generic signer/secret-access block;
- the current package documentation still states that Mode A blocks external
  writes and that Stage B1 is not implemented;
- the dedicated B1 feature tests remain outside the candidate.

Therefore the four source files are restored to their `bc6b1a80` blobs. The
complete local feature remains preserved outside Git for a later coherent
review/import decision. No B1 feature material was deleted.

### 2. Preservation receipt ledger statement corrected

The first public receipt incorrectly said the two preserved ledgers were
byte-identical in public fields. The preservation freeze established:

- `LEDGER_COPIES_IDENTICAL=NO`
- `LEDGER_SEMANTIC_DIVERGENCE=YES`

The receipt now records that divergence explicitly and performs no financial
reconciliation.

### 3. Preservation ignore pattern corrected

The first root `.gitignore` did not match the actual dated directory shape
`Unknown/Archived/2026-08-27-reconciliation-preservation/`.

The ignore policy now explicitly covers `*-reconciliation-preservation`
directories while leaving sanitized archive receipts trackable.

## Retained candidate work

- seller `node_modules` remains removed from Git;
- strict lockfiles/package manifests remain unchanged from the tested baseline;
- root/package ignore policy remains in place;
- local-only material remains preserved externally;
- no real secret is intentionally added;
- no ledger, wallet, payment, Render service, default branch, or production
  configuration is changed by this review.

## Required local validation

Hermes must validate the resulting candidate locally with strict `npm ci`,
seller tests, Commerce Control typecheck/tests, opportunity tests, secret scan,
and `git diff --check` before this candidate is promoted or merged.
