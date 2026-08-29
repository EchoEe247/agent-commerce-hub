# Batch 6C PR / branch preservation index

Date: 2026-08-29

This file preserves terminal branch identities and disposition before repository cleanup. It is historical evidence, not current operational state.

## Repository anchors before alignment

- Default branch `main`: `fb1574abcad25f68c59d9589ae1701d43e3107cc`
- Preservation ref for old `main`: `archive/batch-6c-main-before-alignment-fb1574a`
- Production branch `feat/hermes-commerce-control-plane`: `bc6b1a80aa4f71a7db68c35c07c54bbae7e69ef9`
- Validated Batch 6B candidate: `chore/p1-seller-lifecycle-batch-6b` at `c9512348567459be3164f2413d4e187a7bed7501`

## PRs retired in Batch 6C

| PR | Head branch | Terminal head | Disposition |
|---|---|---|---|
| #1 | `fix/x402-https-resource-url` | `bd60fb5d9cae47ff2c6196a31b5430b25d8b4248` | Temporary CI red/green evidence; superseded. Close without merge. |
| #2 | `tdd/agent402-profiler-ranking-20260820` | `984953f4a2e2aaf193a2f15f409572c218e90ba4` | Temporary verification-only PR; superseded. Close without merge. |
| #33 | `handoff/hermes-architecture-20260821` | `774432762d03b73c8eb009c65b1d11ac703914fb` | Historical handoff snapshot. Close without merge. |
| #34 | `handoff/agent-zero-architecture-20260821` | `25a66b4cada9b6fae056d34a91bbfac5b7dbb7f7` | Historical handoff snapshot. Close without merge. |
| #35 | `handoff/agent-zero-repair-validation-20260822` | `299f17919031f4aeef432173a4b3d7b074904353` | Historical repair/validation handoff. Close without merge. |
| #64 | `feat/revenue-opportunity-router` | `5ce3bfedf4f6b456d0c20ff9313a7981b6716b2e` | Divergent old opportunity-router implementation superseded by canonical opportunity work. Preserve intent only; close without merge. |
| #76 | `fix/p1-production-change-control-batch-4` | `f0f9503a4b01cff98003de9b06f4f77db2ce2fdb` | Validated Batch 4 subset superseded by later complete candidate. Close without merge. |
| #77 | `fix/p1-preview-abuse-batch-5` | `ab06f198904ff67e3d4b518d8c177af460a2c8ca` | Validated Batch 5 subset superseded by later complete candidate. Close without merge. |
| #78 | `chore/p1-canonical-state-batch-6a` | `54674d29ffb6fed9614ea6ef56b1520d16a8ec47` | Validated Batch 6A subset superseded by Batch 6B. Close without merge. |
| #80 | `chore/p1-repository-alignment-batch-6c` | `17143d78e34ad12541712832c8b16286b6e59f0d` | First main-alignment PR. GitHub reported merge conflicts against the two legacy main-only workflow commits. Preserve head and close without merge; superseded by snapshot alignment. |

## PRs deliberately retained

| PR | Head branch | Head | Disposition |
|---|---|---|---|
| #8 | `feat/the402-provider-adapter` | `fe068d2bb6fbed1210e1b82e771dd62941d93aef` | Deferred feature. Keep draft/unmerged. If revived, reimplement/rebase on canonical seller and add replay protection before production use. |
| #63 | `fix/root-landing` | `5385f702ab3f846095042d3624981174da212c6b` | Small useful root-landing feature. Keep unmerged; extract/rebase onto canonical seller later rather than merging stale branch wholesale. |
| #79 | `chore/p1-seller-lifecycle-batch-6b` | `c9512348567459be3164f2413d4e187a7bed7501` | Current production-promotion candidate. Keep OPEN/DRAFT/UNMERGED. Merging is a Render production deployment event. |

## Alignment resolution

The two `main`-only commits exposed older signer/buyer workflows already superseded by the hardened canonical versions. PR #80 could not merge cleanly because those files had diverged.

The connector did not permit constructing a two-parent merge commit. Batch 6C therefore preserves `main` ancestry and applies the exact canonical Batch 6C tree as one snapshot commit on top of the old `main` head:

- snapshot commit: `2184555139c4651bfc69edfeba7c94687b4f58cb`
- parent: old `main` head `fb1574abcad25f68c59d9589ae1701d43e3107cc`
- tree: exact Batch 6C canonical tree at the time of snapshot creation
- alignment branch: `chore/p1-main-snapshot-alignment-6c`

This avoids a force reset, preserves old `main` ancestry, keeps detailed Batch 6A/6B histories on their existing branches, and selects the independently validated hardened files as the canonical conflict resolution.

## Safety boundary

Batch 6C aligns the default `main` branch only. It does not merge PR #79, alter the Render-linked production branch, deploy Render, mutate the financial database, or perform live-money actions.

Obsolete remote branch refs may be deleted after their terminal SHA is preserved here. Branch-ref deletion is mechanical cleanup and does not change the disposition of preserved historical evidence.
