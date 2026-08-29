# Normalized research snapshots

Files in this directory are **research evidence**, not current operational state.

A filename ending in `-latest.json` reflects the naming convention used by the research workflow that produced it; it does **not** mean the file is current today. Use each snapshot's embedded `crawl_timestamp` / source timestamp to determine when it was actually observed.

In particular, the currently tracked Agent402 and the402 normalized snapshots were produced from older marketplace crawls and must not be used to infer today's seller listings, pricing, network recognition, health, or marketplace behavior without a fresh live check.

Repository-wide current operational truth is maintained in:

- `docs/CURRENT_STATE.md`
- `state/CURRENT.json`

For changing external marketplaces, perform a fresh query against the relevant live public source and record a dated receipt/snapshot if the result needs to be preserved. Do not overwrite historical evidence merely to make a `latest` filename appear current, and do not treat these snapshots as runtime configuration.
