# Agent Distribution Readiness Audit — 2026-08-24

## Scope

This audit is intentionally separated from live conversion verification. It uses public marketplace documentation, repository-owned discovery metadata, and read-only deployed-origin probes. It does not register, publish, pay, sign, settle, or modify external marketplace state.

Production origin: `https://hermes-counterparty-api.onrender.com`

## Executive finding

The production service is technically discoverable as an agent API, but **technical discoverability and actual marketplace distribution are not the same thing**.

The service exposes OpenAPI 3.1, paid-operation schemas, `x-payment-info`, declared 402 responses, buyer guidance, Bazaar extensions on runtime x402 challenges, `/.well-known/x402`, and `/llms.txt`.

A deployed-origin `@agentcash/discovery` preflight succeeded against production. It discovered 14 routes: 13 paid x402 operations plus the free company-intelligence preview. A direct check of `/v1/company-domain-intelligence` classified it as POST, paid, `$0.02`, x402.

The remaining distribution gap is publication into catalogs that require explicit registration or separate ingestion. The production service uses `https://facilitator.xpay.sh`; xpay documents payment support, verification, and settlement, but no Bazaar search/catalog API. Bazaar metadata in our challenge is useful to compatible consumers, but it does not itself prove Coinbase Bazaar listing.

## Channel matrix

| Channel | Current technical state | Distribution state | Recommended action |
| --- | --- | --- | --- |
| x402scan | Deployed OpenAPI discovery and paid-route check pass | Public origin registration is still a separate publication action | Register only after explicit approval |
| AgentCash | Production origin resolves 14 routes; company-domain paid route resolves correctly | Direct discovery works when origin is known; prominence still depends on distribution | Keep metadata stable and measure traffic after listings |
| Coinbase Bazaar | Runtime Bazaar metadata exists | Listing is not inferred from xpay settlement; separate external-index audit owns observed state | Do not change facilitator solely for discovery |
| 402 Index | 13 direct registration payloads can be generated from canonical OpenAPI examples | Direct registration is available and preferable to assuming Bazaar ingestion | Submit only after explicit approval |
| Enchant | API semantics are compatible | Curated channel | Treat as secondary outreach after core free listings |
| PayAPI Market | Free listing path was identified separately | Requires a deliberate provider contact identity | Do not invent or expose a personal contact |

## Deployed AgentCash / x402scan preflight

Disposable verification PR #50 ran the official discovery CLI against the live origin and was closed without merge after evidence capture.

Observed:

- Source: OpenAPI
- Spec: `https://hermes-counterparty-api.onrender.com/openapi.json`
- API: `Hermes Agent Commerce API`
- Routes: 14
- Paid routes: 13 x402 operations
- Free route: `POST /v1/company-domain-intelligence/preview`
- `POST /v1/company-domain-intelligence`: paid, `0.020000 USD`, x402

Warnings were metadata polish rather than blocking discovery:

- OpenAPI contact missing
- favicon missing
- auth-mode declaration missing for the free preview

A public contact email remains optional for discovery and must not be invented. The favicon is not an acquisition blocker. Free-preview auth-mode metadata can be revisited separately if it materially affects listing quality.

## x402scan / AgentCash requirements

Current documentation treats OpenAPI as the canonical discovery document and runtime 402 behavior as authoritative. Paid operations need input/output schemas, `x-payment-info`, and declared 402 responses. `info.x-guidance` provides agent-facing task guidance.

Registration creates a public listing and therefore remains a separate action requiring explicit approval.

References:

- https://www.x402scan.com/discovery/spec
- https://agentcash.dev/discovery
- https://www.x402scan.com/resources/register

## 402 Index

402 Index accepts direct endpoint registration in addition to catalog ingestion. The current API documentation supports searchable metadata including URL, name, protocol, HTTP method, probe body, description, USD price, category, provider, and optional contact details.

The readiness checker generates one registration object for each of the 13 paid endpoints from canonical OpenAPI data. It does not invent request bodies or listing copy:

- `probe_body` comes from the OpenAPI request example
- `description` comes from the operation description
- `price_usd` comes from `x-payment-info`
- `category` comes from the first OpenAPI tag
- `provider` comes from `info.title`
- no contact email is emitted without an approved public contact identity

References:

- https://402index.io/api-docs
- https://402index.io/about

## Current facilitator

The production service uses xpay. Its documented facilitator surface covers health/support discovery, verification, and settlement, but no public Bazaar catalog/search endpoint. The service therefore keeps xpay's settlement advantages while treating Coinbase Bazaar publication as an independent distribution concern.

References:

- https://docs.xpay.sh/en/x402-protocol/facilitator
- https://www.xpay.sh/blog/article/xpay-x402-facilitator/

## Ranked actions

1. Keep the `$0.02` company-intelligence price unchanged; current evidence does not identify price as the bottleneck.
2. Keep the now-live `/llms.txt`, OpenAPI, free preview, and runtime 402 metadata consistent.
3. Preserve the buyer-discovery harness as a regression gate for ordinary research/enrichment intents.
4. Preserve the deterministic distribution-readiness checker and its 13 prepared 402 Index records.
5. After explicit publication approval, register the production origin with x402scan and submit the paid endpoints to 402 Index.
6. Measure listing -> preview -> 402 -> payment-attempt telemetry before adding products or discounting further.
7. Keep Coinbase Bazaar/x402.direct verification in its separate audit lane and avoid facilitator churn without evidence.

## Safety boundary

The readiness tooling never sends registration requests, payment headers, wallet credentials, Authorization headers, or settlement calls. Publication status is reported separately from technical readiness so a green CI run can never be mistaken for an external listing.