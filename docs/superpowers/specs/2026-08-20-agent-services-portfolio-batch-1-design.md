# Agent Services Portfolio Batch 1 Design

## Purpose

Expand the live Hermes x402 seller from two real paid services to eight real paid services without adding upstream API cost, new infrastructure, a second process, or another wallet. This batch is the first production step in a broader portfolio business: ship multiple agent-buyable services, distribute them across qualified marketplaces, measure paid demand, and iterate based on unique buyers, repeat buyers, calls, and revenue rather than treating the first sale as the finish line.

## Market rationale

Agent402 already sells raw JSON/CSV conversion and validation primitives around $0.001-$0.002 per call, while more compositional analysis, web, and decision tools charge materially more. Batch 1 therefore avoids commodity format conversion and instead sells deterministic analysis or transformation that saves an agent multiple steps. All six new routes are zero-COGS pure CPU operations built on the existing profiler code.

## Existing production services retained

1. `POST /v1/counterparty-availability` — $0.03 USDC
2. `POST /v1/profile` — $0.02 USDC

Both stay behaviorally compatible.

## New paid services

### 1. Duplicate Audit

- Route: `POST /v1/duplicate-audit`
- Price: `$0.005`
- Input: same dataset envelope as `/v1/profile`: JSON records or CSV text.
- Output: record count, duplicate-row count, unique-row count, duplicate ratio, and deterministic duplicate groups with first occurrence and repeated row indexes.
- Value: narrow, cheap, easy to route to when an agent specifically needs duplicate detection rather than a full profile.

### 2. Data Quality Gate

- Route: `POST /v1/quality-gate`
- Price: `$0.01`
- Input: normal dataset envelope plus optional thresholds:
  - `minimum_quality_score` default `80`
  - `max_duplicate_rows` default `0`
  - `max_missing_values` default `0`
  - `allow_mixed_types` default `false`
- Output: `pass`, observed metrics, threshold checks, and deterministic failure reasons.
- Value: turns the profiler into a machine-actionable go/no-go control for ETL, RAG, analytics, and agent workflows.

### 3. Schema Drift Detector

- Route: `POST /v1/schema-drift`
- Price: `$0.015`
- Input: `{ "baseline": <dataset>, "current": <dataset> }`.
- Output: baseline/current schema fingerprints, added fields, removed fields, inferred-type changes, nullable-state changes, and `breaking_change`.
- Breaking change rule: removed field or inferred-type change is breaking; added fields and nullable-state changes are reported but non-breaking.

### 4. Data Contract Compatibility

- Route: `POST /v1/data-contract-check`
- Price: `$0.015`
- Input:
  - `dataset`: standard dataset envelope
  - `contract.required_fields`: string array
  - `contract.field_types`: object mapping field names to expected profiler types
  - `contract.allow_extra_fields`: boolean, default `true`
- Output: `compatible`, missing required fields, extra fields when disallowed, type mismatches, observed schema fingerprint, and deterministic reasons.
- Supported expected types are the profiler's public inferred types; invalid contract types fail with a structured 400.

### 5. Clean + Normalize

- Route: `POST /v1/clean-normalize`
- Price: `$0.02`
- Input: standard dataset envelope plus optional `options`:
  - `trim_strings` default `true`
  - `blank_to_null` default `true`
  - `deduplicate` default `true`
- Output: cleaned JSON records, original/cleaned record counts, transformations applied, removed duplicate count, and schema fingerprint after cleaning.
- Rules are conservative and deterministic. It does not infer arbitrary semantic corrections, rewrite values with an LLM, or invent missing data.

### 6. Deterministic Repair Plan

- Route: `POST /v1/repair-plan`
- Price: `$0.02`
- Input: standard dataset envelope.
- Output: quality score, schema fingerprint, issue counts, and an ordered list of deterministic recommended actions derived from profiler evidence.
- Recommendations cover duplicate rows, missing values, mixed types, constant fields, and identifier-integrity warnings. The endpoint recommends; it does not mutate the dataset.

## Shared constraints

- Base mainnet x402 exact-payment rail remains `eip155:8453` with canonical Base USDC and the existing earning wallet.
- Existing facilitator and startup synchronization behavior remain unchanged.
- All routes remain under the existing 1 MiB body limit, 1000-record limit, 250-fields-per-record limit, nesting-depth limit, and processing deadline.
- No external network calls, databases, LLM inference, paid upstreams, new secrets, or new dependencies in Batch 1.
- Deterministic input must produce deterministic business output except for request IDs and timing metadata where already present.
- Errors remain structured through the existing error-classification path.
- Existing `/v1/profile` and `/v1/counterparty-availability` behavior must not regress.

## Code shape

Create a focused `src/dataset/operations.mjs` module containing reusable pure operations for the six new products and a small shared analysis helper built from the existing normalizer, profiler, fingerprint, and scorer. HTTP handlers in `app.mjs` remain thin: validate request shape, call the operation, and send JSON. Payment metadata remains in `payments/x402-plugin.mjs`, with a Bazaar discovery declaration for each new route.

Do not build a generic plugin framework or a new service registry in this batch. Eight routes are still small enough to keep explicit manifest and payment entries readable.

## Discovery manifest

`/.well-known/x402` must describe eight real tools, not parser duplicates. It must:

- list all eight route URLs under `resources`
- set `capabilities.tools` to `8`
- set the data-quality category count to `7` and business-intelligence to `1`
- advertise exact route names, search-oriented summaries, prices, and Base network
- set the overall price range to `$0.005-$0.03`

Search copy should use literal buyer-intent terms such as duplicate rows, data quality gate, schema drift, data contract, clean normalize, missing values, mixed types, and repair plan without keyword stuffing unrelated concepts.

## Payments and Bazaar discovery

Every new route receives its own exact x402 price and Bazaar input/output declaration. Price defaults live in config with environment overrides so production can reprice individual winners later without code changes.

Default prices:

- `X402_DUPLICATE_AUDIT_PRICE=$0.005`
- `X402_QUALITY_GATE_PRICE=$0.01`
- `X402_SCHEMA_DRIFT_PRICE=$0.015`
- `X402_DATA_CONTRACT_PRICE=$0.015`
- `X402_CLEAN_NORMALIZE_PRICE=$0.02`
- `X402_REPAIR_PLAN_PRICE=$0.02`

## Testing and acceptance

TDD is required. Acceptance requires:

1. Unit tests for all six operations, including malformed/edge inputs.
2. HTTP injection tests proving each route returns the expected deterministic response when payment middleware is disabled.
3. Manifest tests proving eight unique routes, correct counts, prices, network, wallet, and search-oriented summaries.
4. Config tests for all six new default prices and overrides.
5. Existing focused and full Node test suites passing.
6. Syntax checks passing.
7. Production deploy reaches `live` on Render.
8. Live unpaid requests to all six new routes return x402 `402` with correct Base network, canonical USDC, seller wallet, and route-specific amounts.
9. Agent402 refresh shows all real routes discoverable and seller remains `health=1` and `routable=true`.
10. Register all six routes with 402 Index using valid POST probe bodies; because the domain is already verified, listings should inherit provider verification after registration/review.
11. Update the existing first-sale monitor to cover all eight real services and their prices; do not create a duplicate monitor.

## Business measurement

Batch 1 is not judged by whether one endpoint can technically accept payment. After distribution, track per route:

- genuine paid calls
- unique external buyers
- repeat buyers
- gross USDC revenue
- days live
- marketplace health/discovery state

The next portfolio decision uses these measurements. No-sale routes can be repriced, repositioned, or replaced; routes with real demand get adjacent products and higher-value composites.

## Out of scope for this batch

The following are separate subprojects after Batch 1 is live:

- network-bound x402 seller-readiness auditing
- SEC/EDGAR and other public-data composites
- the402 provider registration, automated-service listings, and work-request bidding
- MPP/AgentCash payment-rail expansion
- Cloudflare Workers or Oracle migration
- subscriptions or bundles
