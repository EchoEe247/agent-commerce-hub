# Reconciliation

This directory records the evidence and decisions used to reconcile local
Hermes state with the GitHub repository.

## Authority

Files here are reconciliation records, not runtime configuration.

`local-source-decisions.*` records the first local preservation/candidate pass.
A later ChatGPT remote review found that the four B1-ID/BountyBook source files
marked `APPLY_LOCAL_CHANGE` there were only a fragment of a larger LOCAL_ONLY
feature. Because those fragments introduced an authenticated external-write
policy exception without the remainder of the feature or its dedicated tests,
they were removed from the canonical candidate and deferred for complete review.

The current correction is documented in:

`remote-review-2026-08-28.md`

The preserved full local feature remains available outside Git in the restricted
Hermes reconciliation archive. It must be reviewed and imported as one coherent
feature, or archived, rather than activated piecemeal.
