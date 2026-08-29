# Data Quality Profiler

Machine-readable dataset health profiling for autonomous pipelines.

A small standalone Node.js (Fastify) service that accepts a JSON or CSV dataset,
enforces hard structural limits, determines a deterministic schema fingerprint,
computes a transparent quality score, and returns a machine-consumable report.

## Quick start (local development)

Requires Node.js 24.

```bash
npm ci
npm test
X402_ENABLED=false npm start
curl -s http://127.0.0.1:4021/health
```

`npm start` defaults to unpaid local development mode. The payment boundary is
disabled when `X402_ENABLED=false`, so `/v1/profile` is reachable without an
x402 header.

## Endpoints

### `GET /health`

Returns service identity and version. Always payment-free.

```json
{ "ok": true, "service": "data-quality-profiler", "version": "0.1.0" }
```

### `POST /v1/profile`

Accepts a dataset as JSON:

```json
{
  "format": "json",
  "records": [
    { "id": 1, "email": "a@example.com", "age": 22 },
    { "id": 2, "email": null, "age": "23" }
  ]
}
```

or CSV content as a string:

```json
{
  "format": "csv",
  "data": "id,email,age\n1,a@example.com,22\n2,,23"
}
```

Example unpaid request:

```bash
curl -s -X POST http://127.0.0.1:4021/v1/profile \
  -H 'Content-Type: application/json' \
  -d '{"format":"json","records":[{"id":1,"email":"a@example.com","age":22},{"id":2,"email":null,"age":"23"}]}'
```

Expected key output fields:

```json
{
  "schema_version": "1.0",
  "request_id": "prof_...",
  "quality_score": 85,
  "score_breakdown": { "missing_data": -17, "duplicates": 0, "type_conflicts": -25, "malformed_records": 0, "constant_fields": 0, "identifier_integrity": 0 },
  "dataset": { "record_count": 2, "field_count": 3, "duplicate_rows": 0, "schema_fingerprint": "sha256:..." },
  "fields": { "id": { "inferred_type": "integer", ... } },
  "warnings": [ { "code": "MISSING_VALUES", "count": 1 } ],
  "processing_ms": 7
}
```

## Limits

- maximum request body: **1 MiB**
- maximum records: **1,000**
- maximum fields per record: **250**
- maximum nesting depth: **8**
- processing timeout: **5 seconds**

Exceeding a limit returns a structured error with a stable HTTP status
(`413`, `408`, `400`, or `415`).

## Payment boundary (x402 v2, Base Sepolia testnet)

The service can enforce an x402 v2 payment boundary on `/v1/profile`. This is
**testnet-envelope-only** and disabled by default. Configuration is via
environment variables (see `.env.example`):

| Variable                | Example                                   | Meaning                                    |
|-------------------------|-------------------------------------------|--------------------------------------------|
| `X402_ENABLED`          | `false`                                   | Enable/disable the payment boundary        |
| `X402_NETWORK`          | `eip155:84532`                            | Base Sepolia (testnet)                     |
| `X402_PRICE`            | `$0.02`                                   | Listed price per report                    |
| `X402_PAY_TO`           | `0x000...0001` (example only)             | Receiving address                          |
| `X402_FACILITATOR_URL`  | `https://x402.org/facilitator`            | x402 facilitator                           |
| `ALLOW_MAINNET`         | `false`                                   | Base mainnet stays fail-closed             |

No real wallet secret or seed is required for development. `ALLOW_MAINNET`
must remain `false`; the implementation refuses Base mainnet
(`eip155:8453`) unless it is set.

## Container

```bash
docker build -t data-quality-profiler:test .
docker run --rm -d --name dqp-test -p 4021:4021 data-quality-profiler:test
curl -fsS http://127.0.0.1:4021/health
docker stop dqp-test
```

## Project layout

- `src/app.mjs` — Fastify app, routes, structured error handling
- `src/server.mjs` — entrypoint wiring config, payment plugin, listener
- `src/config.mjs` — fail-closed environment configuration
- `src/dataset/` — normalization, limits, inference, profiling, scoring, fingerprint
- `src/payments/` — x402 v2 payment boundary
- `src/logging.mjs` — privacy-safe operational logging (no payloads)
- `test/` — Node test runner suite