# Hermes Agent Commerce API / Data Quality Profiler

Agent-ready paid utilities for data quality, software/package intelligence, company research, sanctions screening, SEC data, and counterparty availability. The service is implemented as a standalone Node.js 24 Fastify application and exposes machine-readable OpenAPI, x402 discovery metadata, and agent guidance.

This directory is the canonical published seller source. For the exact current deployment commit and Render state, use the repository authorities `docs/CURRENT_STATE.md` and `state/CURRENT.json` rather than this package README.

## Quick start: local unpaid development

Requires Node.js 24.

```bash
npm ci
npm test
X402_PAYMENT_MODE=local-unpaid X402_ENABLED=false npm start
curl -fsS http://127.0.0.1:4021/health
```

Local unpaid operation is an **explicit opt-in**. If `X402_PAYMENT_MODE` is omitted, configuration resolves fail-closed to production mode and requires a complete paid configuration. This prevents a missing environment variable from accidentally exposing paid routes for free.

## Public discovery surfaces

These routes are payment-free:

- `GET /` — static human-readable discovery landing page
- `GET /health` — service identity/version
- `GET /openapi.json` — OpenAPI 3.1 operation catalog
- `GET /llms.txt` — agent-facing discovery guidance
- `GET /.well-known/x402` — seller/tool/payment manifest
- `POST /v1/company-domain-intelligence/preview` — bounded free acquisition preview

## Paid x402 operations

Canonical default prices are defined only in `src/config.mjs` through `SELLER_PRICE_DEFAULTS` and `SELLER_PRICE_CATALOG`. Discovery surfaces and the payment plugin derive from that authority.

| Operation | Default price |
| --- | ---: |
| `POST /v1/profile` | $0.02 |
| `POST /v1/counterparty-availability` | $0.03 |
| `POST /v1/entity-sanctions-screen` | $0.02 |
| `POST /v1/company-domain-intelligence` | $0.02 |
| `POST /v1/sec-company-snapshot` | $0.02 |
| `POST /v1/dependency-vulnerability-check` | $0.005 |
| `POST /v1/package-maintenance-snapshot` | $0.005 |
| `POST /v1/duplicate-audit` | $0.005 |
| `POST /v1/quality-gate` | $0.01 |
| `POST /v1/schema-drift` | $0.015 |
| `POST /v1/data-contract-check` | $0.015 |
| `POST /v1/clean-normalize` | $0.02 |
| `POST /v1/repair-plan` | $0.02 |

An unpaid request to a paid route in production should receive HTTP `402` with the x402 challenge metadata. Do not use a live-money purchase merely as a routine smoke test; the repository has read-only discovery/402 validation paths for that purpose.

## Core data-quality input

`POST /v1/profile` accepts JSON records:

```json
{
  "format": "json",
  "records": [
    { "id": 1, "email": "a@example.com", "age": 22 },
    { "id": 2, "email": null, "age": "23" }
  ]
}
```

or CSV content:

```json
{
  "format": "csv",
  "data": "id,email,age\n1,a@example.com,22\n2,,23"
}
```

In explicit local-unpaid mode, a development request can be made directly:

```bash
curl -sS -X POST http://127.0.0.1:4021/v1/profile \
  -H 'Content-Type: application/json' \
  -d '{"format":"json","records":[{"id":1,"email":"a@example.com","age":22},{"id":2,"email":null,"age":"23"}]}'
```

The response includes a deterministic quality score, schema fingerprint, missing-value/duplicate/type-conflict analysis, field inference, warnings, and processing metadata.

## Structural limits

The dataset profiler enforces bounded input/processing limits, including:

- maximum request body: **1 MiB**
- maximum records: **1,000**
- maximum fields per record: **250**
- maximum nesting depth: **8**
- processing timeout: **5 seconds**

External data integrations also use explicit pre-parse response-size bounds. See `docs/CURRENT_STATE.md` for the current upstream-boundary guarantees.

## Payment configuration

Important variables include:

| Variable | Purpose |
| --- | --- |
| `X402_PAYMENT_MODE` | `local-unpaid` for explicit local development or `production` for paid operation; unset is fail-closed production |
| `X402_ENABLED` | Must be `true` for production payment mode |
| `X402_NETWORK` | Supported Base CAIP-2 network, e.g. `eip155:84532` or authorized mainnet `eip155:8453` |
| `ALLOW_MAINNET` | Must be `true` before Base mainnet is accepted |
| `X402_PAY_TO` | Valid EVM receiving address required in production |
| `X402_FACILITATOR_MODE` | `xpay` or `cdp` |
| `X402_FACILITATOR_URL` | xPay facilitator URL when using xPay |
| `CDP_API_KEY_ID` / `CDP_API_KEY_SECRET` | Required only for CDP facilitator mode |

The checked-in `.env.example` is deliberately non-secret and configured for explicit local-unpaid development. Production secrets/credentials belong only in secure runtime configuration.

The current live production deployment uses Base mainnet x402 and the xPay facilitator; exact live deployment facts are maintained in `docs/CURRENT_STATE.md` / `state/CURRENT.json` so this package document does not become a second operational source of truth.

## Container

For local container testing, supply an explicit local-unpaid environment:

```bash
docker build -t data-quality-profiler:test .
docker run --rm -d --name dqp-test -p 4021:4021 \
  -e X402_PAYMENT_MODE=local-unpaid \
  -e X402_ENABLED=false \
  data-quality-profiler:test
curl -fsS http://127.0.0.1:4021/health
docker stop dqp-test
```

## Project layout

- `src/app.mjs` — Fastify routes, discovery surfaces, service operations
- `src/server.mjs` — configuration/payment wiring, root landing registration, listener
- `src/config.mjs` — fail-closed payment/network configuration and canonical pricing
- `src/payments/x402-plugin.mjs` — public seller x402 enforcement
- `src/commerce-telemetry.mjs` — structured commerce request telemetry
- `src/dataset/` — normalization, limits, inference, profiling, scoring, fingerprinting, data-quality operations
- `src/discovery/` — repository-side buyer-discovery tooling; excluded from the public seller Docker artifact
- `scripts/` — operator/CI tooling; excluded from the public seller Docker artifact
- `test/` — full regression suite; excluded from the public seller Docker artifact

The public Docker image intentionally contains the seller runtime rather than repository-only buyer, operator, test, or private financial tooling. See `docs/CURRENT_STATE.md` for the deployment-boundary invariant.
