# Stale Operational State Archive — 2026-08-29

This directory preserves exact Git blobs that previously occupied active-looking status/`latest` paths but are no longer authoritative.

The move is evidence-preserving: archived files reuse the exact original blob SHA. Nothing here becomes current merely because it is retained.

## Archived items

| Original path | Archived path | Original blob SHA | Classification |
|---|---|---|---|
| `state/STATUS.json` | `state-STATUS.json` | `526cef4cc9a96e272875a9463f94067d1f313897` | superseded repository status; falsely described mainnet/deployment state |
| `state/commerce-control/STATUS.json` | `commerce-control-STATUS.json` | `06abeb3b7eea180d1df3f9890bc6328f2e3ed567` | August 19 Mode-A snapshot; historical only |
| `research/raw/agent402-seller-live/latest.json` | `agent402-seller-live-latest.json` | `b5514bfc9ea712d672f3683fa5440a7bbb8759ae` | retired seller-live `latest` evidence; old automatic writer was removed in Batch 4 |

## Current authority

Use:

- `docs/CURRENT_STATE.md`
- `state/CURRENT.json`

Do not use these archived files to decide deployment, payment authorization, branch state, runtime mode, seller capabilities, or current research freshness.

## Legacy `services-latest` / `work-latest`

`research/normalized/commerce-control/services-latest.json` and `work-latest.json` are intentionally **not moved in Batch 6A** because the legacy Commerce Control exporter can regenerate those exact paths. They are explicitly non-authoritative in `CURRENT_STATE.md`; exporter namespace cleanup is deferred to the later Commerce Control durability batch so the writer and paths change together.

No raw secrets are stored in this archive.
