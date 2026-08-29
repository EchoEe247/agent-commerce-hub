# Local Source Reconciliation Decisions

Branch: `reconcile/2026-08-27-canonical-candidate`
Base: `bc6b1a80aa4f71a7db68c35c07c54bbae7e69ef9`

This document records the per-file decision for each of the 11 dirty tracked
files found in the original (dirty) checkout, compared against the candidate
baseline `bc6b1a80`. Decisions:

- APPLY_LOCAL_CHANGE
- SUPERSEDED
- GENERATED_DO_NOT_APPLY
- SECRET_LOCAL_ONLY
- ALREADY_UPSTREAM
- UNKNOWN_REVIEW

## Summary

| Decision | Count |
|---|---|
| APPLY_LOCAL_CHANGE | 4 |
| SUPERSEDED | 2 |
| GENERATED_DO_NOT_APPLY | 5 |
| SECRET_LOCAL_ONLY | 0 |
| ALREADY_UPSTREAM | 0 |
| UNKNOWN_REVIEW | 0 |

## Per-file decisions

### APPLY_LOCAL_CHANGE (4)

These four files are the *tracked* fragment of a larger local B1-ID / scoped
BountyBook authentication feature that is entirely absent from baseline
`bc6b1a80`. They are genuinely valuable, security-disciplined, and not present
upstream, so they are applied to the candidate.

1. `tools/hermes-commerce-control/src/core/errors.ts`
   - Material diff: adds 8 B1-ID/BountyBook auth error codes.
   - Baseline blob / dirty sha differ. Applied verbatim from local source.

2. `tools/hermes-commerce-control/src/network/safe-fetch.ts`
   - Material diff: adds `postText` and `postAuthed` (origin-pinned bearer
     token attachment, every redirect hop re-checked, no auto-retry on the
     authenticated mutation path). All other SSRF/size/redirect protections
     unchanged.
   - Applied verbatim from local source.

3. `tools/hermes-commerce-control/src/policy/engine.ts`
   - Material diff: adds the `B1_ID_BOUNTYBOOK_AUTH` policy branch — scoped
     external write authorized only for the BountyBook platform on eip155
     chains, never moves value, blocks value movement / non-BountyBook
     platforms / non-eip155 networks.
   - Applied verbatim from local source.

4. `tools/hermes-commerce-control/src/policy/modes.ts`
   - Material diff: adds the `B1_ID_BOUNTYBOOK_AUTH` operation class.
   - Applied verbatim from local source.

NOTE: These four files are only a fragment. The remainder of the feature
(`src/policy/bountybook-auth-policy.ts`, `src/execution/scoped-bountybook.ts`,
`src/execution/`, `src/identity/`, `test/bountybook-auth.test.ts`,
`test/scoped-bountybook.test.ts`, several `scripts/*`) is untracked LOCAL_ONLY
material. It is intentionally NOT imported in this phase; the four tracked files
compile cleanly (`npm run typecheck` = PASS) and the full `npm test` suite
(489 tests) passes with them applied. Importing the rest is deferred to a later
review/import decision so the candidate stays compilable and test-green.

### SUPERSEDED (2)

The dirty main checkout modified the seller dependency manifests in a way that
would BREAK the candidate.

5. `products/drafts/data-quality-profiler/package.json`
   - Dirty change: removed `@coinbase/x402`, added `@x402/fetch`.
   - Candidate source (`src/payments/x402-plugin.mjs`) imports `@coinbase/x402`,
     so dropping it breaks the build. Baseline `bc6b1a80` retains
     `@coinbase/x402 2.1.0` and the lockfile agrees. Decision: keep baseline;
     do NOT apply the dirty manifest change. Reproducible install via
     `npm ci` on the baseline manifest is the authority.

6. `products/drafts/data-quality-profiler/package-lock.json`
   - Dirty change: removed the `@coinbase/x402` subtree to match the broken
     manifest. Superseded by the baseline lockfile (which keeps
     `@coinbase/x402` and is internally consistent with the baseline
     `package.json`). `npm ci` reproduces the tree from this lockfile.

### GENERATED_DO_NOT_APPLY (5)

These are generated runtime snapshots / dependency artifacts, not maintained
source.

7. `analytics/commerce-control/source-health-latest.json` — regenerated scan
   report (timestamps/latencies).
8. `research/normalized/commerce-control/services-latest.json` — regenerated
   normalized catalog (68 -> 654 services).
9. `research/normalized/commerce-control/work-latest.json` — regenerated
   normalized work catalog (44 -> 47).
10. `state/commerce-control/STATUS.json` — regenerated status report.
11. `products/drafts/data-quality-profiler/node_modules/.package-lock.json` —
    generated npm internal lockfile inside tracked node_modules. node_modules
    is removed from Git entirely in this candidate.

## No secrets entered the candidate

No secret-bearing file was applied. `CANDIDATE_REAL_SECRETS=0`.
