# Data Quality Profiler Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a deterministic paid x402 API that accepts JSON or CSV datasets and returns a reproducible machine-readable quality profile, while keeping mainnet deployment and financial actions disabled until separately authorized.

**Architecture:** A small Node.js 24 ESM service built with Fastify. Dataset normalization, profiling, scoring, fingerprinting, HTTP concerns, and x402 payment middleware remain separate modules. The paid route is protected by official x402 v2 middleware; testnet uses Base Sepolia and the public x402 test facilitator. Mainnet is fail-closed in configuration and is not authorized by this plan.

**Tech Stack:** Node.js 24, Fastify 5.11.x, `@x402/core`, `@x402/evm`, `@x402/fastify`, `@x402/extensions` v2, `csv-parse` 7.x, built-in `node:test`, ESM JavaScript, Docker packaging for later deployment readiness.

**Spec:** `docs/superpowers/specs/2026-08-18-data-quality-profiler-design.md`

## Global Constraints

- Product source lives under `products/drafts/data-quality-profiler/` until a later review explicitly promotes it.
- Public API endpoint is `POST /v1/profile`.
- Input formats are JSON records or CSV text wrapped in JSON.
- Maximum request body is 1 MiB (`1_048_576` bytes).
- Maximum records is 1,000.
- Maximum top-level fields per record is 250.
- Maximum nesting depth is 8.
- Processing deadline is 5,000 ms.
- No LLM calls, browser automation, remote URL fetching, arbitrary code execution, shell execution, database access, PDFs, ZIPs, or local file-path access from customer input.
- Customer dataset bodies are not retained or logged by default.
- Scoring and schema fingerprints must be deterministic and independent of clock time, randomness, request order, or external services.
- Initial x402 test network is Base Sepolia (`eip155:84532`).
- Initial price is `$0.02` per successful paid profile request.
- Test facilitator is `https://x402.org/facilitator` only for testnet.
- Base mainnet (`eip155:8453`) must fail closed unless a later user-approved production step explicitly changes the guard.
- No wallet private key, seed phrase, API key, NWC string, Coinbase credential, payment secret, or equivalent secret may enter GitHub.
- No hosting purchase, mainnet deployment, listing submission, wallet transfer, or Coinbase action is authorized by this plan.
- Use TDD: every behavior change begins with a failing test, then the smallest implementation that passes.
- Commit after every independently testable task.

---

## File Structure

Create the following product tree:

```text
products/drafts/data-quality-profiler/
├── package.json
├── package-lock.json
├── .env.example
├── .dockerignore
├── Dockerfile
├── README.md
├── src/
│   ├── app.mjs                 # Fastify construction and route wiring
│   ├── server.mjs              # process entrypoint only
│   ├── config.mjs              # validated environment/config
│   ├── errors.mjs              # stable service error types/codes
│   ├── logging.mjs             # request-safe structured log helpers
│   ├── dataset/
│   │   ├── limits.mjs          # body/record/field/depth/deadline limits
│   │   ├── normalize.mjs       # JSON/CSV normalization
│   │   ├── infer.mjs           # deterministic type inference/stat helpers
│   │   ├── profile.mjs         # dataset-wide profiling orchestration
│   │   ├── scoring.mjs         # exact transparent score formula
│   │   └── fingerprint.mjs     # canonical schema + SHA-256
│   └── payments/
│       └── x402.mjs            # x402 route config and middleware setup
└── test/
    ├── config.test.mjs
    ├── normalize.test.mjs
    ├── infer.test.mjs
    ├── profile.test.mjs
    ├── scoring.test.mjs
    ├── fingerprint.test.mjs
    ├── api.test.mjs
    ├── limits.test.mjs
    ├── logging.test.mjs
    └── x402.test.mjs
```

Each module has one responsibility. `profile.mjs` may consume the normalization/type/scoring/fingerprint modules, but no dataset module may import Fastify or x402.

---

### Task 1: Scaffold the service and establish a test harness

**Files:**
- Create: `products/drafts/data-quality-profiler/package.json`
- Create: `products/drafts/data-quality-profiler/src/app.mjs`
- Create: `products/drafts/data-quality-profiler/src/server.mjs`
- Create: `products/drafts/data-quality-profiler/test/api.test.mjs`

**Interfaces:**
- Produces: `buildApp({ config, paymentPlugin }) -> FastifyInstance`
- Produces: `GET /health -> { ok: true, service: "data-quality-profiler", version: "0.1.0" }`

- [ ] **Step 1: Create `package.json` with exact runtime scripts and dependencies**

Use:

```json
{
  "name": "data-quality-profiler",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "engines": { "node": ">=24 <25" },
  "scripts": {
    "start": "node src/server.mjs",
    "test": "node --test",
    "test:api": "node --test test/api.test.mjs"
  },
  "dependencies": {
    "@x402/core": "2.20.0",
    "@x402/evm": "2.20.0",
    "@x402/extensions": "2.20.0",
    "@x402/fastify": "2.20.0",
    "csv-parse": "7.0.2",
    "fastify": "5.11.2"
  }
}
```

Run:

```bash
cd products/drafts/data-quality-profiler
npm install
```

Expected: `package-lock.json` is created and `npm ls --depth=0` exits 0.

- [ ] **Step 2: Write a failing health-route test**

Create `test/api.test.mjs`:

```js
import test from "node:test";
import assert from "node:assert/strict";
import { buildApp } from "../src/app.mjs";

test("GET /health returns service identity without payment", async () => {
  const app = buildApp({
    config: { serviceVersion: "0.1.0" },
    paymentPlugin: async () => {},
  });
  const response = await app.inject({ method: "GET", url: "/health" });
  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), {
    ok: true,
    service: "data-quality-profiler",
    version: "0.1.0",
  });
  await app.close();
});
```

- [ ] **Step 3: Run the test and verify it fails**

Run:

```bash
npm run test:api
```

Expected: FAIL because `../src/app.mjs` does not exist or does not export `buildApp`.

- [ ] **Step 4: Implement the minimal Fastify app and process entrypoint**

Create `src/app.mjs`:

```js
import Fastify from "fastify";

export function buildApp({ config, paymentPlugin }) {
  const app = Fastify({
    logger: false,
    bodyLimit: 1_048_576,
  });

  app.get("/health", async () => ({
    ok: true,
    service: "data-quality-profiler",
    version: config.serviceVersion,
  }));

  app.register(paymentPlugin);
  return app;
}
```

Create `src/server.mjs`:

```js
import { buildApp } from "./app.mjs";

const app = buildApp({
  config: { serviceVersion: "0.1.0" },
  paymentPlugin: async () => {},
});

await app.listen({ host: "0.0.0.0", port: 4021 });
```

- [ ] **Step 5: Run tests**

Run:

```bash
npm test
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add products/drafts/data-quality-profiler
git commit -m "feat: scaffold data quality profiler service"
```

---

### Task 2: Add fail-closed configuration and stable service errors

**Files:**
- Create: `src/config.mjs`
- Create: `src/errors.mjs`
- Create: `test/config.test.mjs`
- Modify: `src/server.mjs`

**Interfaces:**
- Produces: `loadConfig(env) -> ServiceConfig`
- Produces: `ServiceError(code, message, statusCode, details)`
- `ServiceConfig` fields: `serviceVersion`, `host`, `port`, `x402Enabled`, `x402Network`, `x402Price`, `x402PayTo`, `x402FacilitatorUrl`, `allowMainnet`.

- [ ] **Step 1: Write failing configuration tests**

Create `test/config.test.mjs` with these exact cases:

```js
import test from "node:test";
import assert from "node:assert/strict";
import { loadConfig } from "../src/config.mjs";

test("defaults to local unpaid development mode", () => {
  const cfg = loadConfig({});
  assert.equal(cfg.x402Enabled, false);
  assert.equal(cfg.x402Network, "eip155:84532");
  assert.equal(cfg.x402Price, "$0.02");
  assert.equal(cfg.x402FacilitatorUrl, "https://x402.org/facilitator");
  assert.equal(cfg.allowMainnet, false);
});

test("requires a receiving address when x402 is enabled", () => {
  assert.throws(
    () => loadConfig({ X402_ENABLED: "true" }),
    /X402_PAY_TO is required/
  );
});

test("refuses Base mainnet unless explicitly unlocked", () => {
  assert.throws(
    () => loadConfig({
      X402_ENABLED: "true",
      X402_PAY_TO: "0x0000000000000000000000000000000000000001",
      X402_NETWORK: "eip155:8453",
    }),
    /mainnet is disabled/
  );
});
```

- [ ] **Step 2: Run the tests and verify failure**

Run:

```bash
node --test test/config.test.mjs
```

Expected: FAIL because `loadConfig` is absent.

- [ ] **Step 3: Implement configuration parsing and mainnet guard**

`loadConfig` must:

```js
export function loadConfig(env = process.env) {
  const x402Enabled = env.X402_ENABLED === "true";
  const x402Network = env.X402_NETWORK ?? "eip155:84532";
  const allowMainnet = env.ALLOW_MAINNET === "true";
  const x402PayTo = env.X402_PAY_TO ?? "";

  if (x402Enabled && !x402PayTo) {
    throw new Error("X402_PAY_TO is required when X402_ENABLED=true");
  }
  if (x402Network === "eip155:8453" && !allowMainnet) {
    throw new Error("Base mainnet is disabled; ALLOW_MAINNET=true requires separate user authorization");
  }

  return Object.freeze({
    serviceVersion: "0.1.0",
    host: env.HOST ?? "0.0.0.0",
    port: Number(env.PORT ?? "4021"),
    x402Enabled,
    x402Network,
    x402Price: env.X402_PRICE ?? "$0.02",
    x402PayTo,
    x402FacilitatorUrl: env.X402_FACILITATOR_URL ?? "https://x402.org/facilitator",
    allowMainnet,
  });
}
```

Create `errors.mjs` with a `ServiceError` class whose serialized fields are `code`, `message`, and optional `details`.

- [ ] **Step 4: Wire `loadConfig()` into `server.mjs`**

`server.mjs` must construct configuration once at startup and exit before binding a port if validation fails.

- [ ] **Step 5: Run all tests**

```bash
npm test
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add products/drafts/data-quality-profiler/src products/drafts/data-quality-profiler/test/config.test.mjs
git commit -m "feat: add fail-closed service configuration"
```

---

### Task 3: Normalize JSON and CSV under strict structural limits

**Files:**
- Create: `src/dataset/limits.mjs`
- Create: `src/dataset/normalize.mjs`
- Create: `test/normalize.test.mjs`
- Create: `test/limits.test.mjs`

**Interfaces:**
- Produces: `normalizeDataset(payload, { deadlineMs }) -> { format, records, fieldNames }`
- Produces: `assertMaxDepth(value, maxDepth)`
- Normalized records are plain objects only.

- [ ] **Step 1: Write failing normalization tests**

Cover all of these exact behaviors:

```js
const jsonPayload = {
  format: "json",
  records: [{ id: 1, name: "A" }, { id: 2, name: null }],
};
```

Expected normalized result: two records and sorted field union `['id', 'name']`.

CSV:

```js
const csvPayload = {
  format: "csv",
  data: "id,name\n1,A\n2,",
};
```

Expected: `[{ id: "1", name: "A" }, { id: "2", name: "" }]`.

Also assert stable error codes for:

- unsupported `format` -> `UNSUPPORTED_FORMAT`;
- `records` not an array -> `INVALID_DATASET`;
- any JSON record that is not a plain object -> `INVALID_RECORD_SHAPE`;
- more than 1,000 records -> `TOO_MANY_RECORDS`;
- any record with more than 250 top-level fields -> `TOO_MANY_FIELDS`;
- nesting deeper than 8 -> `NESTING_TOO_DEEP`;
- malformed CSV quoting -> `MALFORMED_CSV`.

- [ ] **Step 2: Verify tests fail**

```bash
node --test test/normalize.test.mjs test/limits.test.mjs
```

Expected: FAIL because modules are absent.

- [ ] **Step 3: Implement limits**

`limits.mjs` must export:

```js
export const LIMITS = Object.freeze({
  bodyBytes: 1_048_576,
  records: 1_000,
  fieldsPerRecord: 250,
  nestingDepth: 8,
  processingMs: 5_000,
});
```

`assertMaxDepth` must traverse arrays and plain objects iteratively or with bounded recursion and throw `NESTING_TOO_DEEP` at depth 9.

- [ ] **Step 4: Implement JSON/CSV normalization**

Use `csv-parse/sync` with strict parsing. Do not enable remote resources or dynamic code. Preserve CSV cell text as strings at normalization time; type inference happens later.

Normalization must compute the union of top-level keys and sort them lexicographically.

- [ ] **Step 5: Run tests**

```bash
npm test
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add products/drafts/data-quality-profiler/src/dataset products/drafts/data-quality-profiler/test
git commit -m "feat: normalize bounded JSON and CSV datasets"
```

---

### Task 4: Implement deterministic field type inference and statistics

**Files:**
- Create: `src/dataset/infer.mjs`
- Create: `test/infer.test.mjs`

**Interfaces:**
- Produces: `classifyValue(value) -> 'null'|'boolean'|'integer'|'number'|'string'|'array'|'object'`
- Produces: `profileField(records, fieldName) -> FieldProfile`

- [ ] **Step 1: Write failing primitive classification tests**

Assert:

```text
null -> null
true -> boolean
1 -> integer
1.5 -> number
"23" -> string
[] -> array
{} -> object
```

Do not coerce numeric-looking strings into numbers.

- [ ] **Step 2: Write failing field-statistic tests**

For:

```js
[
  { age: 10, code: "A" },
  { age: 20, code: "A" },
  { age: null, code: "A" },
]
```

assert:

- `age.inferred_type === 'integer'` because nullability does not make the field mixed;
- `age.null_count === 1`;
- `age.null_pct === 33.33` using two-decimal rounding;
- `age.distinct_count === 2` excluding null;
- numeric `min=10`, `max=20`, `mean=15`, `median=15`;
- `code.constant === true`;
- string min/max/mean length are all `1`.

For `[ {x: 1}, {x: "1"} ]`, assert `inferred_type === 'mixed'` and `type_conflicts` reports `{ integer: 1, string: 1 }`.

- [ ] **Step 3: Verify failure**

```bash
node --test test/infer.test.mjs
```

- [ ] **Step 4: Implement deterministic statistics**

Rules:

- Missing key and explicit `null` both count as missing.
- Empty CSV string `""` counts as missing for CSV-derived records; normalization may mark the format so `profileField` receives the missing-value rule explicitly.
- Distinct counts exclude missing values.
- Numeric statistics apply only when all non-missing values are integer/number.
- Median sorts a copy of numeric values numerically.
- `near_constant` is true when at least 95% of non-missing values equal the dominant value and there are at least 10 non-missing values.
- `unique_ratio = distinct_non_missing / non_missing_count`, rounded to four decimals.
- `candidate_identifier` is true for field names matching `^(id|.*_id|uuid|key)$` case-insensitively; integrity metrics are reported separately rather than suppressing candidacy.

- [ ] **Step 5: Run tests**

```bash
npm test
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add products/drafts/data-quality-profiler/src/dataset/infer.mjs products/drafts/data-quality-profiler/test/infer.test.mjs
git commit -m "feat: add deterministic field inference and statistics"
```

---

### Task 5: Implement dataset profiling, duplicate detection, and warnings

**Files:**
- Create: `src/dataset/profile.mjs`
- Create: `test/profile.test.mjs`

**Interfaces:**
- Consumes: `normalizeDataset`, `profileField`
- Produces: `profileDataset(normalized, { now, deadlineMs }) -> RawProfile`

- [ ] **Step 1: Write a failing complete-profile test**

Use a fixture containing:

- one duplicate row;
- one missing value;
- one mixed-type field;
- one constant field;
- one `customer_id` candidate identifier.

Assert dataset-level fields:

```json
{
  "record_count": 5,
  "field_count": 5,
  "duplicate_rows": 1
}
```

Assert warning codes include `DUPLICATE_ROWS`, `MISSING_VALUES`, `MIXED_TYPES`, `CONSTANT_FIELD`, and `IDENTIFIER_INTEGRITY` when the candidate identifier contains a duplicate or missing value.

- [ ] **Step 2: Write a failing duplicate canonicalization test**

These two rows must be duplicates despite key order:

```js
{ a: 1, b: 2 }
{ b: 2, a: 1 }
```

Nested object keys must also be canonicalized before duplicate comparison.

- [ ] **Step 3: Verify tests fail**

```bash
node --test test/profile.test.mjs
```

- [ ] **Step 4: Implement profiling orchestration**

Use a stable canonical JSON serializer that recursively sorts object keys. Duplicate detection hashes or stores the canonical row string. With v1 limits, storing at most 1,000 canonical rows is acceptable.

Check the deadline between record/field loops. If `Date.now() > deadlineMs`, throw `PROCESSING_TIMEOUT`.

Do not include raw record values in the profile response except aggregate statistics.

- [ ] **Step 5: Run tests**

```bash
npm test
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add products/drafts/data-quality-profiler/src/dataset/profile.mjs products/drafts/data-quality-profiler/test/profile.test.mjs
git commit -m "feat: add dataset-wide profiling and warnings"
```

---

### Task 6: Implement transparent scoring and stable schema fingerprints

**Files:**
- Create: `src/dataset/scoring.mjs`
- Create: `src/dataset/fingerprint.mjs`
- Create: `test/scoring.test.mjs`
- Create: `test/fingerprint.test.mjs`

**Interfaces:**
- Produces: `scoreProfile(rawProfile) -> { quality_score, score_breakdown, scoring_version }`
- Produces: `fingerprintSchema(fieldProfiles) -> 'sha256:<hex>'`

- [ ] **Step 1: Write failing scoring tests using exact formulas**

Define v1 deductions as:

```text
missing_data = -round(min(25, missing_cell_ratio * 25))
duplicates = -round(min(20, duplicate_row_ratio * 20))
type_conflicts = -round(min(20, mixed_field_ratio * 20))
malformed_records = 0 for successful v1 profiles because malformed input is rejected
constant_fields = -round(min(5, constant_field_ratio * 5))
identifier_integrity = -round(min(10, bad_identifier_ratio * 10))
quality_score = clamp(100 + sum(deductions), 0, 100)
```

Where:

- `missing_cell_ratio = missing_cells / max(1, record_count * field_count)`;
- `duplicate_row_ratio = duplicate_rows / max(1, record_count)`;
- `mixed_field_ratio = mixed_fields / max(1, field_count)`;
- `constant_field_ratio = constant_fields / max(1, field_count)`;
- `bad_identifier_ratio = bad_candidate_identifier_fields / max(1, candidate_identifier_fields)` if any candidate identifiers exist, otherwise 0.

Assert a clean fixture scores 100. Assert the same raw profile scores identically across repeated calls.

- [ ] **Step 2: Write failing fingerprint tests**

Fingerprint canonical schema entries only from stable semantics:

```js
[
  { name: "age", inferred_type: "integer", nullable: true },
  { name: "id", inferred_type: "integer", nullable: false }
]
```

Sort entries by field name before hashing. The fingerprint must not change when input object key order or record order changes but inferred schema remains the same.

- [ ] **Step 3: Verify failure**

```bash
node --test test/scoring.test.mjs test/fingerprint.test.mjs
```

- [ ] **Step 4: Implement scoring and fingerprinting**

Use `node:crypto` SHA-256 over UTF-8 canonical JSON. Prefix the digest with `sha256:`.

Return `scoring_version: "1.0"` so later formula changes can be explicit.

- [ ] **Step 5: Run all tests**

```bash
npm test
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add products/drafts/data-quality-profiler/src/dataset products/drafts/data-quality-profiler/test
git commit -m "feat: add reproducible scoring and schema fingerprints"
```

---

### Task 7: Expose `POST /v1/profile` with structured errors and body limits

**Files:**
- Modify: `src/app.mjs`
- Modify: `src/errors.mjs`
- Modify: `test/api.test.mjs`
- Modify: `test/limits.test.mjs`

**Interfaces:**
- Consumes: `normalizeDataset`, `profileDataset`, `scoreProfile`, `fingerprintSchema`
- Produces: response schema version `1.0`.

- [ ] **Step 1: Write failing successful API tests**

For unpaid local development mode, inject:

```js
{
  method: "POST",
  url: "/v1/profile",
  payload: {
    format: "json",
    records: [
      { id: 1, email: "a@example.com", age: 22 },
      { id: 2, email: null, age: "23" }
    ]
  }
}
```

Assert status `200` and presence of:

- `schema_version === "1.0"`;
- `request_id` matching `^prof_[0-9a-f-]{36}$`;
- `quality_score` integer 0..100;
- `score_breakdown`;
- `dataset.record_count === 2`;
- `dataset.schema_fingerprint` beginning `sha256:`;
- `fields.age.inferred_type === "mixed"`;
- `warnings` array;
- `processing_ms >= 0`.

- [ ] **Step 2: Write failing structured-error tests**

Assert response shape:

```json
{
  "error": {
    "code": "INVALID_DATASET",
    "message": "...",
    "details": {}
  }
}
```

and stable HTTP mapping:

- malformed/invalid dataset: 400;
- unsupported format: 415;
- body/record/field/depth limit: 413;
- processing timeout: 408;
- internal unexpected error: 500.

The 500 response must not expose stack traces.

- [ ] **Step 3: Write a failing 1 MiB body-limit test**

Inject a JSON body larger than 1,048,576 bytes and assert HTTP 413.

- [ ] **Step 4: Implement route and error handler**

`POST /v1/profile` flow:

```text
request ID
→ normalize
→ profile
→ score
→ fingerprint
→ response
```

Generate request IDs using `crypto.randomUUID()` only for request correlation. Request IDs must not influence score or fingerprint.

Use `performance.now()` solely for `processing_ms`.

- [ ] **Step 5: Run tests**

```bash
npm test
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add products/drafts/data-quality-profiler/src products/drafts/data-quality-profiler/test
git commit -m "feat: expose deterministic profile API"
```

---

### Task 8: Add privacy-safe structured operational logging

**Files:**
- Create: `src/logging.mjs`
- Create: `test/logging.test.mjs`
- Modify: `src/app.mjs`

**Interfaces:**
- Produces: `buildRequestLog({ requestId, bytes, recordCount, fieldCount, processingMs, status, errorCode, paymentRef })`
- Never consumes raw `records` or CSV `data`.

- [ ] **Step 1: Write a failing log-redaction test**

Create a sample request containing sentinel secrets/data:

```text
CUSTOMER_PAYLOAD_SENTINEL_7c8e
person@example.com
```

Capture the serialized operational log entry and assert neither string appears.

- [ ] **Step 2: Write a failing allowed-fields test**

Assert log entries may contain only:

```text
request_id
timestamp
request_bytes
record_count
field_count
processing_ms
status
error_code
payment_ref
```

`payment_ref` must be optional and non-secret; never log payment signatures or wallet credentials.

- [ ] **Step 3: Implement logging helper and Fastify hooks**

Log after response completion using aggregate metadata stored on request state. Do not enable Fastify's automatic body logging.

- [ ] **Step 4: Run tests**

```bash
npm test
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add products/drafts/data-quality-profiler/src/logging.mjs products/drafts/data-quality-profiler/src/app.mjs products/drafts/data-quality-profiler/test/logging.test.mjs
git commit -m "feat: add privacy-safe operational logging"
```

---

### Task 9: Integrate x402 v2 on Base Sepolia with a testable payment boundary

**Files:**
- Create: `src/payments/x402.mjs`
- Create: `test/x402.test.mjs`
- Modify: `src/app.mjs`
- Modify: `src/server.mjs`
- Modify: `src/config.mjs`

**Interfaces:**
- Produces: `createPaymentPlugin(config) -> Fastify plugin`
- When `x402Enabled === false`, plugin leaves `/v1/profile` reachable for local tests.
- When enabled on testnet, unpaid access to `/v1/profile` returns 402 with x402 v2 payment requirements.

- [ ] **Step 1: Write a failing disabled-mode test**

Assert `createPaymentPlugin({ x402Enabled: false })` does not block `/v1/profile`.

- [ ] **Step 2: Write a failing testnet configuration test**

Construct config:

```js
{
  x402Enabled: true,
  x402Network: "eip155:84532",
  x402Price: "$0.02",
  x402PayTo: "0x0000000000000000000000000000000000000001",
  x402FacilitatorUrl: "https://x402.org/facilitator",
  allowMainnet: false
}
```

Assert route config contains:

```text
scheme: exact
network: eip155:84532
price: $0.02
payTo: configured address
mimeType: application/json
```

Do not make a real facilitator request in unit tests.

- [ ] **Step 3: Implement the official x402 Fastify resource server**

Use the v2 package imports:

```js
import { paymentMiddleware, x402ResourceServer } from "@x402/fastify";
import { ExactEvmScheme } from "@x402/evm/exact/server";
import { HTTPFacilitatorClient } from "@x402/core/server";
import { declareDiscoveryExtension } from "@x402/extensions/bazaar";
```

Create:

```js
const facilitator = new HTTPFacilitatorClient({
  url: config.x402FacilitatorUrl,
});

const resourceServer = new x402ResourceServer(facilitator)
  .register("eip155:*", new ExactEvmScheme());
```

Protect `POST /v1/profile` with exact payment requirements and include Bazaar discovery metadata describing the accepted request object and JSON output.

- [ ] **Step 4: Add an integration test that verifies the unpaid 402 envelope without spending funds**

Run the service with x402 enabled and a dummy Base Sepolia receiving address. Send an unsigned request. Assert:

- HTTP 402;
- `PAYMENT-REQUIRED` response header exists;
- decoded payment requirements identify x402 version 2;
- accepted network is Base Sepolia;
- price resolves to `$0.02` semantics;
- no profiler output appears in the response.

If the middleware requires a facilitator-supported route lookup to construct the 402, use a local fake facilitator implementing only `/supported`, `/verify`, and `/settle` test responses. Never sign or settle a real payment in automated tests.

- [ ] **Step 5: Add a mainnet regression test**

Assert config still throws before Fastify starts when network is `eip155:8453` and `ALLOW_MAINNET` is absent/false.

- [ ] **Step 6: Run tests**

```bash
npm test
```

Expected: PASS with zero real blockchain transactions.

- [ ] **Step 7: Commit**

```bash
git add products/drafts/data-quality-profiler/src products/drafts/data-quality-profiler/test
git commit -m "feat: add x402 Base Sepolia payment boundary"
```

---

### Task 10: Add abuse, determinism, and security regression coverage

**Files:**
- Modify: `test/limits.test.mjs`
- Modify: `test/profile.test.mjs`
- Modify: `test/api.test.mjs`

**Interfaces:**
- No new public interfaces.

- [ ] **Step 1: Add pathological-input tests**

Add fixtures for:

- 1,001 records;
- 251 top-level fields;
- depth 9;
- a 1 MiB+ body;
- repeated deeply nested keys at legal depth;
- 1,000 rows × 250 fields within the legal limit.

Legal maximum fixture must complete without unbounded growth. Illegal fixtures must fail with the documented code.

- [ ] **Step 2: Add determinism tests**

Run the exact same dataset 20 times and assert identical:

- `quality_score`;
- `score_breakdown`;
- field profiles excluding `processing_ms`;
- schema fingerprint.

`request_id` and `processing_ms` are allowed to differ.

- [ ] **Step 3: Add security tests**

Dataset strings containing these values must be treated as inert data and never executed/fetched:

```text
../../../../etc/passwd
https://127.0.0.1:8081/wallet
$(touch /tmp/profiler-owned)
<script>alert(1)</script>
```

After the request, assert `/tmp/profiler-owned` does not exist. No HTTP fetch hook should be present in dataset modules.

- [ ] **Step 4: Add timeout test with injectable clock**

Do not wait five real seconds. Refactor profiling deadline checks to accept `now()` as a dependency in tests. Make `now()` cross the deadline during iteration and assert `PROCESSING_TIMEOUT` / HTTP 408.

- [ ] **Step 5: Run full test suite twice**

```bash
npm test && npm test
```

Expected: both runs PASS identically.

- [ ] **Step 6: Commit**

```bash
git add products/drafts/data-quality-profiler/test products/drafts/data-quality-profiler/src/dataset
git commit -m "test: harden profiler limits and determinism"
```

---

### Task 11: Package the service for reproducible local/container execution

**Files:**
- Create: `.env.example`
- Create: `.dockerignore`
- Create: `Dockerfile`
- Create: `README.md`

**Interfaces:**
- No mainnet activation.
- No secrets committed.

- [ ] **Step 1: Create `.env.example`**

Use only non-secret examples:

```dotenv
HOST=0.0.0.0
PORT=4021
X402_ENABLED=false
X402_NETWORK=eip155:84532
X402_PRICE=$0.02
X402_PAY_TO=0x0000000000000000000000000000000000000001
X402_FACILITATOR_URL=https://x402.org/facilitator
ALLOW_MAINNET=false
```

Clearly label the zero-like wallet as an example only.

- [ ] **Step 2: Create a minimal Dockerfile**

Use Node 24 Alpine, copy `package*.json`, run `npm ci --omit=dev`, copy `src`, expose 4021, and start with `node src/server.mjs`. Run as a non-root user available in the base image.

- [ ] **Step 3: Document local run/test commands**

README must include:

```bash
npm ci
npm test
X402_ENABLED=false npm start
curl -s http://127.0.0.1:4021/health
```

Include one unpaid local `/v1/profile` curl fixture and expected key fields.

Also document the testnet-only x402 environment variables without supplying any real wallet secret.

- [ ] **Step 4: Add a packaging smoke test**

Run:

```bash
npm ci
npm test
node src/server.mjs &
PID=$!
sleep 1
curl -fsS http://127.0.0.1:4021/health
kill "$PID"
wait "$PID" 2>/dev/null || true
```

Expected health JSON identifies version `0.1.0`.

If Docker is available in the execution environment, additionally run:

```bash
docker build -t data-quality-profiler:test .
docker run --rm -d --name dqp-test -p 4021:4021 data-quality-profiler:test
curl -fsS http://127.0.0.1:4021/health
docker stop dqp-test
```

If Docker is not available, record `docker_not_available` in the implementation receipt; the native Node smoke test remains mandatory.

- [ ] **Step 5: Commit**

```bash
git add products/drafts/data-quality-profiler
git commit -m "docs: package profiler for reproducible execution"
```

---

### Task 12: Produce implementation evidence and hand off for ChatGPT review

**Files:**
- Create: `receipts/implementation/data-quality-profiler/<timestamp>/verification.json`
- Create: `handoffs/hermes-to-chatgpt/data-quality-profiler-build-<date>.json`
- Do not move the product out of `products/drafts/` yet.

**Interfaces:**
- Handoff must conform to `schemas/handoff.schema.json`.

- [ ] **Step 1: Run final verification**

Run from product directory:

```bash
node --version
npm --version
npm ci
npm test
npm ls --depth=0
```

Then start the service in unpaid local mode and verify both `/health` and one known `/v1/profile` fixture.

- [ ] **Step 2: Record evidence**

`verification.json` must contain:

```json
{
  "product": "data-quality-profiler",
  "version": "0.1.0",
  "node_version": "captured command output",
  "npm_version": "captured command output",
  "test_command": "npm test",
  "tests_passed": true,
  "health_check_passed": true,
  "profile_smoke_passed": true,
  "x402_mode_tested": "testnet-envelope-only",
  "real_payment_sent": false,
  "mainnet_enabled": false,
  "secrets_committed": false,
  "docker_check": "passed-or-docker_not_available",
  "git_commit": "full implementation commit SHA"
}
```

Replace each descriptive capture field with the actual command result; do not leave generic marker text in the committed receipt.

- [ ] **Step 3: Create Hermes → ChatGPT handoff**

The handoff must reference:

- this implementation plan;
- the approved design spec;
- product source path;
- final implementation commit SHA;
- verification receipt;
- test results;
- explicit limitations.

`requested_action` must say:

```text
Review implementation against the approved design and acceptance gates. Do not authorize mainnet deployment, wallet funding, paid listing submission, or financial transfers as part of this handoff.
```

- [ ] **Step 4: Validate the handoff against the repository schema**

Use a local JSON-schema validator or a small Node validation script. The handoff status may be `ready` only after validation succeeds.

- [ ] **Step 5: Commit the evidence/handoff**

```bash
git add receipts/implementation handoffs/hermes-to-chatgpt
git commit -m "chore: hand off profiler implementation for review"
```

- [ ] **Step 6: Stop**

Do not:

- move the product to `products/ready/`;
- set `ALLOW_MAINNET=true`;
- use Base mainnet;
- create or fund a wallet;
- send USDC;
- submit Agent402/x402 marketplace listings;
- purchase hosting;
- interact with Coinbase.

Wait for ChatGPT/user review.

---

## Review Checklist for the Executor

Before declaring implementation complete, verify every design requirement maps to at least one test or artifact:

- JSON and CSV accepted;
- request/record/field/depth limits enforced;
- deterministic field profiling;
- duplicate detection canonicalizes object key order;
- mixed types, missingness, constants, near-constants, identifier candidates reported;
- numeric and string stats reported where valid;
- score formulas exactly match Task 6;
- scoring version returned;
- fingerprint deterministic and prefixed `sha256:`;
- structured errors and stable HTTP statuses;
- no payload logging;
- health endpoint unprotected;
- local unpaid mode works for development;
- x402 v2 testnet route emits 402 without real spend;
- Base mainnet fails closed;
- discovery metadata prepared;
- no real financial action occurs;
- final receipt and Hermes handoff contain actual results, not placeholders.

## Official x402 Implementation References

Use current official x402 Foundation documentation/repository as the implementation authority if library details differ from this plan:

- Seller quickstart: `https://docs.x402.org/getting-started/quickstart-for-sellers`
- Protocol repository: `https://github.com/x402-foundation/x402`
- Protocol v2 network IDs: Base Sepolia `eip155:84532`, Base mainnet `eip155:8453`.
- Testnet facilitator: `https://x402.org/facilitator`.

If an official package API has changed since this plan was written, preserve the designed interfaces/behavior and adapt only the x402 adapter module. Do not change product semantics, scoring, limits, privacy rules, or financial boundaries without a new review.