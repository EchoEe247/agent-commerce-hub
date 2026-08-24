# Agent Distribution Readiness Audit — 2026-08-24

## Scope

This audit is intentionally separated from live production conversion verification. It uses public marketplace documentation and repository-owned discovery metadata. It does not register, publish, pay, sign, settle, or modify the production service.

Production origin under review: `https://hermes-counterparty-api.onrender.com`

## Executive finding

The service's machine-readable discovery contract is substantially ready, but **technical discoverability and actual marketplace distribution are not the same thing**.

The current branch already exposes OpenAPI 3.1, paid-operation schemas, `x-payment-info`, declared 402 responses, buyer guidance, Bazaar extensions on the runtime x402 challenge, `/.well-known/x402`, and `/llms.txt`.

The main distribution gap is that several important catalogs require either explicit registration or ingestion through a catalog-producing facilitator. The production service currently uses `https://facilitator.xpay.sh`; xpay documents `/health`, `/supported`, `/verify`, and `/settle`, but no Bazaar discovery/catalog API. Therefore Bazaar metadata in our challenge is useful to compatible consumers, but it does not by itself establish a path into Coinbase's Bazaar index or Bazaar-derived directories.

## Channel matrix

| Channel | What the channel requires | Current technical state | Distribution state | Recommended action |
| --- | --- | --- | --- | --- |
| x402scan | `/openapi.json`, `info.x-guidance`, input/output schemas, `x-payment-info`, 402 declarations, valid runtime 402 | Ready on the discovery branch | Publishing requires origin registration | Run deployed `@agentcash/discovery` audit, then request explicit approval before registering the production origin |
| AgentCash | OpenAPI-first discovery and valid runtime 402; `/llms.txt` is strongly useful for agent understanding/reuse | Ready on the discovery branch | Origin can be discovered directly when known; marketplace prominence still depends on listing/use | After deployment, validate `discover` + `check`; add origin to reusable agent context after registration is settled |
| Coinbase Bazaar | Bazaar discovery extension plus ingestion by a Bazaar-capable discovery/facilitator path | Runtime Bazaar metadata exists | Current xpay facilitator does not document a Bazaar catalog/discovery API | Do not switch facilitator just for distribution. Treat CDP Bazaar as a separate later integration experiment |
| 402 Index | Aggregates Bazaar and also accepts direct endpoint registration; POST endpoints may provide a `probe_body` | OpenAPI contains enough examples to generate direct registration payloads | Bazaar auto-ingestion is not reliable with the current facilitator path; direct registration is available | Generate 13 registration payloads now; submit only after explicit publishing approval |
| Enchant | Curated tool catalog; successful enrichment providers expose a subset of endpoints there | API semantics are compatible, but no public self-registration workflow was found | Curated/business-development channel | Keep out of CI. Prepare a provider pitch only after the core listings are live and measurable |
| Market402 | Public capability search/index and `POST /submit` surface | Discovery metadata is suitable for a submission package | Not yet evidenced as listed | Secondary distribution after x402scan + 402 Index |

## Evidence

### x402scan / AgentCash

- x402scan discovery spec: https://www.x402scan.com/discovery/spec
- AgentCash discovery spec: https://agentcash.dev/discovery
- x402scan registration: https://www.x402scan.com/resources/register

The current x402scan guidance treats OpenAPI as the canonical discovery document and runtime 402 behavior as authoritative. Registration creates a public listing and its own documentation explicitly requires approval before publishing an origin.

`info.contact.email` is recommended for ownership/contact and Poncho merchant-page customization, but it is not required for basic discovery. This repository should **not** publish a personal contact address by default. Add a public business contact only when one is deliberately chosen.

### StableEnrich benchmark

- StableEnrich: https://stableenrich.dev/
- StableEnrich x402scan page: https://www.x402scan.com/server/b8a06bde-b6e8-4a10-b4e0-cc6a25fb9efb
- Enchant StableEnrich page: https://askenchant.com/tools/stableenrich

StableEnrich combines several distribution surfaces: x402scan listing, explicit AgentCash onboarding, `/llms.txt`, direct docs, and a curated Enchant presence. Its x402scan page showed roughly 53K transactions and 501 buyers over 30 days during this audit. This is evidence that enrichment demand exists and that multi-surface distribution matters.

### 402 Index

- Directory/API documentation: https://402index.io/api-docs
- About/ingestion sources: https://402index.io/about

402 Index exposes hybrid semantic search to agents and aggregates Bazaar, but it also provides `POST /api/v1/register`. Registration accepts `url`, `name`, `protocol`, `http_method`, and an optional `probe_body`, which is especially useful for our POST-only paid operations. Registrations are verified/reviewed before appearing publicly.

### Coinbase Bazaar

- Search resources: https://docs.cdp.coinbase.com/api-reference/v2/rest-api/x402-facilitator/search-resources
- Bazaar MCP: https://docs.cdp.coinbase.com/api-reference/v2/rest-api/x402-facilitator/bazaar-mcp-server
- x402 FAQ / Bazaar extension: https://docs.cdp.coinbase.com/x402/support/faq

Coinbase exposes a distinct Bazaar discovery index and semantic-search/MCP surface. Bazaar metadata is the resource description that can be ingested into that index; it is not evidence that an arbitrary third-party facilitator automatically forwards resources into Coinbase's catalog.

### Current facilitator

- xpay facilitator docs: https://docs.xpay.sh/en/x402-protocol/facilitator
- xpay facilitator announcement: https://www.xpay.sh/blog/article/xpay-x402-facilitator/

xpay documents payment verification and settlement, but no discovery catalog endpoint. It remains attractive for zero-fee, gas-sponsored settlement, so changing it purely to chase Bazaar visibility would trade a known payment advantage for uncertain acquisition benefit.

## Ranked actions

1. **Keep the $0.02 company-intelligence price unchanged.** The benchmark does not support price as the primary blocker.
2. **Finish technical discovery validation on the deployed origin** using the already-built buyer-discovery harness and AgentCash discovery tooling.
3. **Prepare, but do not submit, x402scan origin registration.** Publishing requires explicit approval.
4. **Prepare 402 Index registration payloads for all 13 paid operations** from OpenAPI examples. This avoids dependence on Bazaar ingestion.
5. **Measure listing → preview → 402 → payment-attempt telemetry** before adding more products or discounting.
6. **Treat Coinbase Bazaar as a later distribution experiment.** Verify whether using a Bazaar-producing/CDP facilitator actually changes indexing before any facilitator migration.
7. **Treat Enchant and other curated catalogs as secondary channels** after the core listings are live and measurable.

## Automation target

Add a deterministic, non-publishing `distribution-readiness` checker that:

- validates the OpenAPI fields required by x402scan/AgentCash;
- validates that `/llms.txt` covers the paid catalog and company acquisition funnel;
- reports the current facilitator's known Bazaar-catalog capability without pretending metadata equals listing;
- generates preview-only 402 Index registration payloads from OpenAPI examples;
- reports recommended publication actions separately from technical failures;
- never sends network registration requests, payment headers, credentials, or settlement calls.
