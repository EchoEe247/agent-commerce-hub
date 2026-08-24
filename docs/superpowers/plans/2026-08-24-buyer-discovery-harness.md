# Buyer Discovery Harness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a deterministic, non-paying buyer-discovery harness that verifies ordinary company-research buyer intents can traverse the service's OpenAPI and `/llms.txt` discovery surfaces, use the free preview, and reach a valid unpaid x402/Bazaar 402 boundary.

**Architecture:** Keep the system split into four focused units: immutable buyer-intent data, a pure evaluator that converts discovery artifacts and HTTP observations into a versioned report, collection runners for in-process and public-origin observations, and a thin CLI. Required CI remains deterministic and uses the real Fastify app plus real x402 middleware against a local fake facilitator; public network checks are opt-in through `TARGET_URL` and never send payment credentials.

**Tech Stack:** Node.js 24 ESM, Fastify 5, Node `node:test`, existing `@x402/*` 2.20.0 packages, `validateDiscoveryExtension` from `@x402/extensions/bazaar`.

**Spec:** `docs/superpowers/specs/2026-08-24-buyer-discovery-harness-design.md`

## Global Constraints

- No production payment may be attempted.
- No wallet key, signer, token, outgoing payment header, Authorization header, or other secret may be required or committed.
- OpenAPI remains the canonical machine-readable discovery contract.
- Runtime unpaid 402 behavior remains the final proof of the paid boundary.
- `/llms.txt` is an additional agent-facing explanation surface, not a replacement for OpenAPI.
- Required CI is deterministic and performs no LLM call.
- External marketplace/catalog state is never a prerequisite for deterministic CI.
- Public network calls are allowed only when `TARGET_URL` explicitly selects live-check mode.
- Marketplace registration and real payment are out of scope.
- The harness must distinguish verified observations from inferred recommendations.
- The implementation branch remains stacked on `feat/agent-discovery-llms` until PR #38 is merged or the stack is retargeted.

---

## File Structure

- Create `products/drafts/data-quality-profiler/src/discovery/buyer-intents.mjs` — immutable version-1 intent corpus and explicit expected operation IDs/terms.
- Create `products/drafts/data-quality-profiler/src/discovery/buyer-discovery-evaluator.mjs` — pure validation/reporting logic, payment-header decoding, OpenAPI/llms/preview/402/Bazaar checks.
- Create `products/drafts/data-quality-profiler/src/discovery/buyer-discovery-runner.mjs` — deterministic in-process collector and opt-in remote collector; no payment signing or settlement.
- Create `products/drafts/data-quality-profiler/scripts/buyer-discovery-check.mjs` — CLI that selects in-process mode by default or public-origin mode via `TARGET_URL`, prints JSON, and sets exit status.
- Create `products/drafts/data-quality-profiler/test/buyer-discovery-evaluator.test.mjs` — unit contracts and failure classification.
- Create `products/drafts/data-quality-profiler/test/buyer-discovery-harness.test.mjs` — full in-process funnel with real payment middleware and local fake facilitator.
- Create `products/drafts/data-quality-profiler/test/buyer-discovery-script.test.mjs` — executable CLI behavior and invalid-target safety.
- Modify `.github/workflows/counterparty-seller-ci.yml` — syntax/focused test coverage and stacked-PR trigger paths.

---

### Task 1: Intent Corpus and Pure Evaluator

**Files:**
- Create: `products/drafts/data-quality-profiler/src/discovery/buyer-intents.mjs`
- Create: `products/drafts/data-quality-profiler/src/discovery/buyer-discovery-evaluator.mjs`
- Create: `products/drafts/data-quality-profiler/test/buyer-discovery-evaluator.test.mjs`

**Interfaces:**
- Produces `BUYER_INTENTS`, a frozen array of records shaped as `{ id, phrase, terms, expectedOperationId, expectedPreviewOperationId }`.
- Produces `evaluateBuyerDiscovery({ intents, openapi, llmsText, previewObservation, paidBoundaryObservation, target }) -> report`.
- `previewObservation` is `{ statusCode, paymentRequiredHeader, body }`.
- `paidBoundaryObservation` is `{ statusCode, paymentRequiredHeader }`.
- Report shape begins with `{ schema_version: "1.0", target, overall, summary, intent_results, checks }`.

- [ ] **Step 1: Write the failing evaluator tests**

Create tests that build a minimal valid fixture with:

```js
const openapi = {
  openapi: "3.1.0",
  info: { "x-guidance": "Research a company, enrich a domain, investigate a business, qualify a lead, or inspect a company website." },
  paths: {
    "/v1/company-domain-intelligence/preview": {
      post: {
        operationId: "previewCompanyDomainIntelligence",
        requestBody: { content: { "application/json": { schema: { type: "object", required: ["domain"], properties: { domain: { type: "string" } } } } } },
        responses: { "200": { description: "preview" } },
      },
    },
    "/v1/company-domain-intelligence": {
      post: {
        operationId: "companyDomainIntelligence",
        summary: "Research and enrich a company domain",
        "x-payment-info": { protocols: [{ x402: {} }], price: { mode: "fixed", currency: "USD", amount: "0.020000" } },
        requestBody: { content: { "application/json": { schema: { type: "object", required: ["domain"], properties: { domain: { type: "string" } } } } } },
        responses: {
          "200": { content: { "application/json": { schema: { type: "object", properties: { company: { type: "object" } } } } } },
          "402": { description: "Payment Required" },
        },
      },
    },
  },
};
```

Use the real `declareDiscoveryExtension` helper to make a valid Bazaar extension for the payment-required fixture, then base64-encode:

```js
const challenge = Buffer.from(JSON.stringify({
  x402Version: 2,
  accepts: [{ scheme: "exact", network: "eip155:84532", payTo: "0x0000000000000000000000000000000000000001", amount: "20000" }],
  extensions: { bazaar },
})).toString("base64");
```

Required test cases:

```js
test("valid discovery funnel passes all five buyer intents and required checks", () => { /* overall pass */ });
test("missing qualify-lead vocabulary fails LLMS_INTENT_COVERAGE_MISSING without hiding other intent results", () => { /* one intent unmatched */ });
test("preview payment metadata fails PREVIEW_NOT_FREE", () => { /* preview x-payment-info added */ });
test("wrong preview upgrade path fails PREVIEW_UPGRADE_MISMATCH", () => { /* body.upgrade.path wrong */ });
test("paid response other than 402 fails PAID_BOUNDARY_NOT_402", () => { /* 200 */ });
test("malformed payment-required header fails X402_CHALLENGE_INVALID", () => { /* invalid base64/json */ });
test("invalid Bazaar metadata fails BAZAAR_METADATA_INVALID", () => { /* malformed extension */ });
```

- [ ] **Step 2: Verify RED**

Run:

```bash
cd products/drafts/data-quality-profiler
node --test test/buyer-discovery-evaluator.test.mjs
```

Expected: FAIL because `../src/discovery/buyer-intents.mjs` and `../src/discovery/buyer-discovery-evaluator.mjs` do not exist.

- [ ] **Step 3: Implement the intent corpus**

Create exactly five records:

```js
export const BUYER_INTENTS = Object.freeze([
  Object.freeze({ id: "research_company", phrase: "research this company", terms: ["research", "company"], expectedOperationId: "companyDomainIntelligence", expectedPreviewOperationId: "previewCompanyDomainIntelligence" }),
  Object.freeze({ id: "enrich_domain", phrase: "enrich this domain", terms: ["enrich", "domain"], expectedOperationId: "companyDomainIntelligence", expectedPreviewOperationId: "previewCompanyDomainIntelligence" }),
  Object.freeze({ id: "investigate_business", phrase: "investigate this business", terms: ["investigate", "business"], expectedOperationId: "companyDomainIntelligence", expectedPreviewOperationId: "previewCompanyDomainIntelligence" }),
  Object.freeze({ id: "qualify_lead", phrase: "qualify this lead", terms: ["qualify", "lead"], expectedOperationId: "companyDomainIntelligence", expectedPreviewOperationId: "previewCompanyDomainIntelligence" }),
  Object.freeze({ id: "inspect_company_website", phrase: "inspect this company website", terms: ["inspect", "company", "website"], expectedOperationId: "companyDomainIntelligence", expectedPreviewOperationId: "previewCompanyDomainIntelligence" }),
]);
```

- [ ] **Step 4: Implement minimal evaluator checks**

Implement `evaluateBuyerDiscovery()` with these stable check IDs/codes:

```text
discovery.openapi -> DISCOVERY_OPENAPI_MISSING
discovery.guidance -> DISCOVERY_GUIDANCE_MISSING
discovery.input_schema -> DISCOVERY_INPUT_SCHEMA_MISSING
discovery.output_schema -> DISCOVERY_OUTPUT_SCHEMA_MISSING
discovery.payment_metadata -> DISCOVERY_PAYMENT_METADATA_MISSING
discovery.402_declaration -> DISCOVERY_402_DECLARATION_MISSING
llms.intent_coverage -> LLMS_INTENT_COVERAGE_MISSING
preview.free -> PREVIEW_NOT_FREE
preview.upgrade -> PREVIEW_UPGRADE_MISMATCH
paid_boundary.http_402 -> PAID_BOUNDARY_NOT_402
paid_boundary.x402 -> X402_CHALLENGE_INVALID
paid_boundary.bazaar -> BAZAAR_METADATA_INVALID
```

Normalize discovery text with:

```js
const discoveryText = `${openapi?.info?.["x-guidance"] ?? ""}\n${llmsText ?? ""}`.toLowerCase();
```

An intent matches only when its expected paid and preview operation IDs exist and every `terms` token occurs in `discoveryText`. Preserve per-intent evidence names (`openapi.info.x-guidance`, `llms.txt`) instead of raw documents.

Decode `paymentRequiredHeader` locally with `Buffer.from(header, "base64").toString("utf8")` + `JSON.parse()`. Require `x402Version === 2`, at least one `accepts` entry, `scheme === "exact"`, a non-empty network, a non-empty payTo, and amount equal to OpenAPI USD price converted to six-decimal USDC base units (`0.020000 -> 20000`). Validate `extensions.bazaar` using `validateDiscoveryExtension`.

Return every required check in one report; do not short-circuit ordinary failures.

- [ ] **Step 5: Verify GREEN and deterministic failure classification**

Run:

```bash
node --test test/buyer-discovery-evaluator.test.mjs
```

Expected: all evaluator tests PASS.

- [ ] **Step 6: Commit Task 1**

```bash
git add products/drafts/data-quality-profiler/src/discovery/buyer-intents.mjs \
  products/drafts/data-quality-profiler/src/discovery/buyer-discovery-evaluator.mjs \
  products/drafts/data-quality-profiler/test/buyer-discovery-evaluator.test.mjs
git commit -m "feat: add deterministic buyer discovery evaluator"
```

---

### Task 2: Deterministic In-Process Funnel Runner

**Files:**
- Create: `products/drafts/data-quality-profiler/src/discovery/buyer-discovery-runner.mjs`
- Create: `products/drafts/data-quality-profiler/test/buyer-discovery-harness.test.mjs`

**Interfaces:**
- Consumes `BUYER_INTENTS` and `evaluateBuyerDiscovery()` from Task 1.
- Produces `runInProcessBuyerDiscovery() -> Promise<report>`.
- Produces `runRemoteBuyerDiscovery({ targetUrl, fetchImpl = globalThis.fetch }) -> Promise<report>` for Task 3.
- Neither function accepts a signer, private key, payment header, or settlement callback.

- [ ] **Step 1: Write the failing in-process integration test**

The test imports `runInProcessBuyerDiscovery()` and asserts:

```js
const report = await runInProcessBuyerDiscovery();
assert.equal(report.overall, "pass");
assert.equal(report.target, "in-process");
assert.equal(report.intent_results.length, 5);
assert.equal(report.intent_results.every((item) => item.matched), true);
assert.equal(report.checks.find((item) => item.id === "preview.free")?.status, "pass");
assert.equal(report.checks.find((item) => item.id === "paid_boundary.http_402")?.observed, 402);
assert.equal(report.checks.find((item) => item.id === "paid_boundary.bazaar")?.status, "pass");
```

Also assert the report contains no keys matching `/private|secret|signature|authorization/i` by recursively walking object keys.

- [ ] **Step 2: Verify RED**

Run:

```bash
node --test test/buyer-discovery-harness.test.mjs
```

Expected: FAIL because `buyer-discovery-runner.mjs` does not exist.

- [ ] **Step 3: Implement local fake facilitator and safe company fixture**

Inside the runner module, create a private Fastify facilitator with only:

```js
GET /supported -> { kinds: [{ x402Version: 2, scheme: "exact", network: "eip155:84532", extra: {} }], extensions: [], signers: {} }
POST /verify -> { isValid: true }
POST /settle -> { success: true, transaction: "0x" + "00".repeat(32), network: "eip155:84532" }
```

The harness itself never supplies a payment header, so `/settle` is not expected to be called. Track `settleCalls`; if it is nonzero, throw `buyer discovery harness attempted settlement`.

Use public non-secret test values:

```js
const PAY_TO = "0x0000000000000000000000000000000000000001";
const config = {
  serviceVersion: "0.1.0",
  x402Enabled: true,
  x402Network: "eip155:84532",
  x402PayTo: PAY_TO,
  x402CompanyDomainPrice: "$0.02",
  x402FacilitatorUrl: facilitatorUrl,
};
```

Inject a deterministic `companyDomainIntelligence` implementation returning company, website, mail, security, source, and warning fields for `stripe.com` so CI never depends on DNS/RDAP/web access.

- [ ] **Step 4: Collect the four acquisition artifacts through the real app**

Use the existing `buildPaymentPlugin(config)` and `buildApp({ config, paymentPlugin, companyDomainIntelligence })`, then collect only:

```js
GET /openapi.json
GET /llms.txt
POST /v1/company-domain-intelligence/preview { domain: "stripe.com" }
POST /v1/company-domain-intelligence { domain: "stripe.com" } // deliberately no payment header
```

Pass bounded observations to `evaluateBuyerDiscovery()`. Store only status code, `payment-required` header, and parsed preview body; do not retain arbitrary request headers.

Always close both Fastify apps in `finally`.

- [ ] **Step 5: Implement opt-in remote collector without payment capability**

`runRemoteBuyerDiscovery({ targetUrl, fetchImpl })` must:

```js
const url = new URL(targetUrl);
if (!["http:", "https:"].includes(url.protocol)) throw new Error("TARGET_URL must use http or https");
```

Normalize to an origin with no username/password. Reject `url.username || url.password`. Fetch the same four surfaces with ordinary `fetch()` and only `content-type: application/json` on POST requests. Never forward ambient Authorization or payment headers.

For the paid POST, read `response.headers.get("payment-required")`; do not retry after 402.

- [ ] **Step 6: Verify GREEN**

Run:

```bash
node --test test/buyer-discovery-harness.test.mjs test/buyer-discovery-evaluator.test.mjs
```

Expected: all tests PASS and `settleCalls === 0` implicitly enforced.

- [ ] **Step 7: Commit Task 2**

```bash
git add products/drafts/data-quality-profiler/src/discovery/buyer-discovery-runner.mjs \
  products/drafts/data-quality-profiler/test/buyer-discovery-harness.test.mjs
git commit -m "feat: add buyer discovery funnel runner"
```

---

### Task 3: Safe JSON CLI

**Files:**
- Create: `products/drafts/data-quality-profiler/scripts/buyer-discovery-check.mjs`
- Create: `products/drafts/data-quality-profiler/test/buyer-discovery-script.test.mjs`
- Modify: `products/drafts/data-quality-profiler/package.json`

**Interfaces:**
- Consumes `runInProcessBuyerDiscovery()` and `runRemoteBuyerDiscovery()`.
- CLI stdout is exactly one JSON report on success.
- Exit code `0` means `report.overall === "pass"`; exit code `1` means evaluator failure or safe configuration error.

- [ ] **Step 1: Write failing CLI tests**

Use `spawnSync(process.execPath, ["scripts/buyer-discovery-check.mjs"], { cwd: projectRoot, encoding: "utf8" })` and assert:

```js
assert.equal(result.status, 0);
const report = JSON.parse(result.stdout);
assert.equal(report.overall, "pass");
assert.equal(report.target, "in-process");
```

Add an invalid-target test:

```js
const result = spawnSync(process.execPath, ["scripts/buyer-discovery-check.mjs"], {
  cwd: projectRoot,
  env: { ...process.env, TARGET_URL: "ftp://example.com" },
  encoding: "utf8",
});
assert.equal(result.status, 1);
assert.match(result.stderr, /TARGET_URL must use http or https/);
```

- [ ] **Step 2: Verify RED**

Run:

```bash
node --test test/buyer-discovery-script.test.mjs
```

Expected: FAIL because the script does not exist.

- [ ] **Step 3: Implement the thin CLI**

Use:

```js
const report = process.env.TARGET_URL
  ? await runRemoteBuyerDiscovery({ targetUrl: process.env.TARGET_URL })
  : await runInProcessBuyerDiscovery();

process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
process.exitCode = report.overall === "pass" ? 0 : 1;
```

Catch configuration/runtime errors, write only `error.message` to stderr, and set exit code 1. Do not dump environment variables or full response objects.

Add package script:

```json
"check:buyer-discovery": "node scripts/buyer-discovery-check.mjs"
```

- [ ] **Step 4: Verify GREEN**

Run:

```bash
node --test test/buyer-discovery-script.test.mjs
npm run check:buyer-discovery
```

Expected: tests PASS; CLI emits JSON with `overall: "pass"` and no payment occurs.

- [ ] **Step 5: Commit Task 3**

```bash
git add products/drafts/data-quality-profiler/scripts/buyer-discovery-check.mjs \
  products/drafts/data-quality-profiler/test/buyer-discovery-script.test.mjs \
  products/drafts/data-quality-profiler/package.json
git commit -m "feat: add buyer discovery verification cli"
```

---

### Task 4: CI Integration and Full Verification

**Files:**
- Modify: `.github/workflows/counterparty-seller-ci.yml`

**Interfaces:**
- The existing `Counterparty Seller CI` remains the required gate.
- The stacked PR may target `feat/agent-discovery-llms`, so pull-request trigger branches must include that base during the stack.

- [ ] **Step 1: Update CI trigger/path coverage**

Add `feat/buyer-discovery-harness` to push branches and `feat/agent-discovery-llms` to pull-request target branches.

Add path filters for:

```text
products/drafts/data-quality-profiler/src/discovery/**
products/drafts/data-quality-profiler/scripts/buyer-discovery-check.mjs
products/drafts/data-quality-profiler/test/buyer-discovery-evaluator.test.mjs
products/drafts/data-quality-profiler/test/buyer-discovery-harness.test.mjs
products/drafts/data-quality-profiler/test/buyer-discovery-script.test.mjs
products/drafts/data-quality-profiler/package.json
```

- [ ] **Step 2: Add syntax checks**

In the existing syntax-check step add:

```bash
node --check src/discovery/buyer-intents.mjs
node --check src/discovery/buyer-discovery-evaluator.mjs
node --check src/discovery/buyer-discovery-runner.mjs
node --check scripts/buyer-discovery-check.mjs
```

- [ ] **Step 3: Add focused tests and CLI check**

Append to the focused `TESTS` array:

```bash
TESTS+=(test/buyer-discovery-evaluator.test.mjs)
TESTS+=(test/buyer-discovery-harness.test.mjs)
TESTS+=(test/buyer-discovery-script.test.mjs)
```

After focused tests, add:

```bash
npm run check:buyer-discovery
```

The existing PR-only full `npm test` and live public-source smokes remain unchanged.

- [ ] **Step 4: Run local-equivalent verification where available**

Run from `products/drafts/data-quality-profiler`:

```bash
node --check src/discovery/buyer-intents.mjs
node --check src/discovery/buyer-discovery-evaluator.mjs
node --check src/discovery/buyer-discovery-runner.mjs
node --check scripts/buyer-discovery-check.mjs
node --test test/buyer-discovery-evaluator.test.mjs test/buyer-discovery-harness.test.mjs test/buyer-discovery-script.test.mjs
npm run check:buyer-discovery
npm test
```

Expected: all commands PASS.

- [ ] **Step 5: Commit Task 4**

```bash
git add .github/workflows/counterparty-seller-ci.yml
git commit -m "ci: gate buyer discovery verification"
```

- [ ] **Step 6: Open a draft stacked PR**

Open from `feat/buyer-discovery-harness` to `feat/agent-discovery-llms` with a body that explicitly states:

```text
- stacked on PR #38 because /llms.txt is part of the verification target
- no payment, signer, wallet secret, or settlement capability
- RED evidence for each TDD checkpoint
- GREEN focused/full-suite CI evidence
- retarget to feat/hermes-commerce-control-plane after PR #38 lands
```

- [ ] **Step 7: Verify GitHub Actions before claiming completion**

Wait for `Counterparty Seller CI` on the final PR head, inspect the job result, and only mark the implementation complete when the workflow conclusion is `success`. If it fails, inspect logs and follow systematic debugging before changing production code.
