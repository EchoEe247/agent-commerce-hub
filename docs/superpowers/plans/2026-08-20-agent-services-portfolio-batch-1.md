# Agent Services Portfolio Batch 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expand the existing Hermes x402 seller from two to eight real paid services by adding six deterministic zero-COGS data operations, then deploy and distribute them through the existing marketplaces.

**Architecture:** Keep one Fastify/Render service and the existing x402 payment rail. Add a focused pure-logic module for dataset operations; keep HTTP handlers thin; add explicit route metadata to the existing seller manifest and x402/Bazaar payment map. Use the current Base mainnet wallet/facilitator and no new runtime dependencies.

**Tech Stack:** Node.js 24, Fastify, `node:test`, existing `csv-parse`, @x402 core/EVM/Fastify/Bazaar packages, Render Docker service, Agent402, 402 Index.

**Spec:** `docs/superpowers/specs/2026-08-20-agent-services-portfolio-batch-1-design.md`

## Global Constraints

- Preserve existing `POST /v1/profile` and `POST /v1/counterparty-availability` behavior.
- Keep Base mainnet `eip155:8453`, canonical Base USDC, existing earning wallet, facilitator, and startup synchronization unchanged.
- No new runtime dependency, database, LLM, external API, secret, process, or hosting service.
- Reuse the current 1 MiB/1000-record/250-field/depth/deadline limits.
- Six new default prices: duplicate `$0.005`; quality gate `$0.01`; schema drift `$0.015`; contract `$0.015`; clean normalize `$0.02`; repair plan `$0.02`.
- All six routes are POST JSON and must expose Bazaar input/output metadata.
- TDD red -> green evidence is required before production deployment.
- Keep the existing first-sale automation; update it after launch rather than creating another monitor.

---

### Task 1: Add route-specific price configuration

**Files:**
- Modify: `products/drafts/data-quality-profiler/test/config.test.mjs`
- Modify: `products/drafts/data-quality-profiler/src/config.mjs`

**Interfaces:**
- Produces config fields `x402DuplicateAuditPrice`, `x402QualityGatePrice`, `x402SchemaDriftPrice`, `x402DataContractPrice`, `x402CleanNormalizePrice`, `x402RepairPlanPrice`.

- [ ] **Step 1: Write failing config tests**

Add assertions equivalent to:

```js
const config = loadConfig({});
assert.equal(config.x402DuplicateAuditPrice, "$0.005");
assert.equal(config.x402QualityGatePrice, "$0.01");
assert.equal(config.x402SchemaDriftPrice, "$0.015");
assert.equal(config.x402DataContractPrice, "$0.015");
assert.equal(config.x402CleanNormalizePrice, "$0.02");
assert.equal(config.x402RepairPlanPrice, "$0.02");

const custom = loadConfig({
  X402_DUPLICATE_AUDIT_PRICE: "$0.006",
  X402_QUALITY_GATE_PRICE: "$0.011",
  X402_SCHEMA_DRIFT_PRICE: "$0.016",
  X402_DATA_CONTRACT_PRICE: "$0.017",
  X402_CLEAN_NORMALIZE_PRICE: "$0.021",
  X402_REPAIR_PLAN_PRICE: "$0.022",
});
assert.equal(custom.x402DuplicateAuditPrice, "$0.006");
assert.equal(custom.x402RepairPlanPrice, "$0.022");
```

- [ ] **Step 2: Run config test and confirm RED**

Run:

```bash
cd products/drafts/data-quality-profiler
node --test test/config.test.mjs
```

Expected: failure because the six config properties do not exist.

- [ ] **Step 3: Implement the six config defaults/overrides**

Add to the frozen config object:

```js
x402DuplicateAuditPrice: env.X402_DUPLICATE_AUDIT_PRICE ?? "$0.005",
x402QualityGatePrice: env.X402_QUALITY_GATE_PRICE ?? "$0.01",
x402SchemaDriftPrice: env.X402_SCHEMA_DRIFT_PRICE ?? "$0.015",
x402DataContractPrice: env.X402_DATA_CONTRACT_PRICE ?? "$0.015",
x402CleanNormalizePrice: env.X402_CLEAN_NORMALIZE_PRICE ?? "$0.02",
x402RepairPlanPrice: env.X402_REPAIR_PLAN_PRICE ?? "$0.02",
```

- [ ] **Step 4: Re-run config test and confirm GREEN**

- [ ] **Step 5: Commit**

```bash
git add products/drafts/data-quality-profiler/src/config.mjs products/drafts/data-quality-profiler/test/config.test.mjs
git commit -m "feat: add portfolio route pricing config"
```

---

### Task 2: Build shared dataset analysis plus Duplicate Audit and Quality Gate

**Files:**
- Create: `products/drafts/data-quality-profiler/src/dataset/operations.mjs`
- Create: `products/drafts/data-quality-profiler/test/operations.test.mjs`

**Interfaces:**
- `analyzeDataset(payload, options?) -> { normalized, profile, schemaFingerprint, scored }`
- `duplicateAudit(payload, options?) -> { schema_version, record_count, unique_row_count, duplicate_rows, duplicate_ratio, duplicate_groups }`
- `qualityGate(payload, options?) -> { schema_version, pass, quality_score, observed, thresholds, checks, reasons }`

- [ ] **Step 1: Write failing operation tests**

Use deterministic fixtures such as:

```js
const duplicateInput = {
  format: "json",
  records: [
    { id: 1, name: "A" },
    { id: 1, name: "A" },
    { id: 2, name: null },
  ],
};

const audit = duplicateAudit(duplicateInput);
assert.equal(audit.record_count, 3);
assert.equal(audit.unique_row_count, 2);
assert.equal(audit.duplicate_rows, 1);
assert.deepEqual(audit.duplicate_groups[0].indexes, [0, 1]);

const gate = qualityGate({
  ...duplicateInput,
  minimum_quality_score: 0,
  max_duplicate_rows: 0,
  max_missing_values: 0,
  allow_mixed_types: true,
});
assert.equal(gate.pass, false);
assert.equal(gate.checks.duplicate_rows.pass, false);
assert.equal(gate.checks.missing_values.pass, false);
```

Also test default thresholds and malformed thresholds (`minimum_quality_score` outside 0-100, negative maxima, non-boolean `allow_mixed_types`) produce structured-operation errors with `INVALID_DATASET` prefixes so the existing classifier maps them to 400.

- [ ] **Step 2: Run the test and confirm RED because `operations.mjs` is absent**

- [ ] **Step 3: Implement `analyzeDataset`, duplicate grouping, and gate evaluation**

`analyzeDataset` must compose only existing modules:

```js
const normalized = normalizeDataset(payload, options);
const profile = profileDataset(normalized, options);
const schemaFingerprint = fingerprintSchema(profile.fields);
const scored = scoreProfile(profile);
return { normalized, profile, schemaFingerprint, scored };
```

Duplicate grouping must use the existing `canonicalize(record)` representation so it agrees with `/v1/profile` duplicate counts.

- [ ] **Step 4: Run `operations.test.mjs` and confirm GREEN**

- [ ] **Step 5: Commit**

```bash
git add products/drafts/data-quality-profiler/src/dataset/operations.mjs products/drafts/data-quality-profiler/test/operations.test.mjs
git commit -m "feat: add duplicate audit and quality gate operations"
```

---

### Task 3: Add Schema Drift and Data Contract Compatibility

**Files:**
- Modify: `products/drafts/data-quality-profiler/src/dataset/operations.mjs`
- Modify: `products/drafts/data-quality-profiler/test/operations.test.mjs`

**Interfaces:**
- `schemaDrift(payload, options?) -> { schema_version, baseline_fingerprint, current_fingerprint, added_fields, removed_fields, type_changes, nullable_changes, breaking_change }`
- `dataContractCheck(payload, options?) -> { schema_version, compatible, schema_fingerprint, missing_required_fields, extra_fields, type_mismatches, reasons }`

- [ ] **Step 1: Add failing tests**

Drift fixture:

```js
const drift = schemaDrift({
  baseline: { format: "json", records: [{ id: 1, amount: 10 }] },
  current: { format: "json", records: [{ id: "1", extra: true }] },
});
assert.deepEqual(drift.added_fields, ["extra"]);
assert.deepEqual(drift.removed_fields, ["amount"]);
assert.equal(drift.type_changes[0].field, "id");
assert.equal(drift.breaking_change, true);
```

Contract fixture:

```js
const result = dataContractCheck({
  dataset: { format: "json", records: [{ id: 1, email: "a@example.com", extra: 1 }] },
  contract: {
    required_fields: ["id", "email"],
    field_types: { id: "integer", email: "string" },
    allow_extra_fields: false,
  },
});
assert.equal(result.compatible, false);
assert.deepEqual(result.extra_fields, ["extra"]);
```

Add invalid-contract tests for duplicate/blank field names, invalid `field_types`, and non-boolean `allow_extra_fields`.

- [ ] **Step 2: Run and confirm RED**

- [ ] **Step 3: Implement drift comparison and contract validation**

Type comparisons use `profile.fields[field].inferred_type`. Nullable-state comparison uses whether `null_count > 0`. Sort all field-name arrays lexically for deterministic output.

- [ ] **Step 4: Run and confirm GREEN**

- [ ] **Step 5: Commit**

```bash
git add products/drafts/data-quality-profiler/src/dataset/operations.mjs products/drafts/data-quality-profiler/test/operations.test.mjs
git commit -m "feat: add schema drift and data contract checks"
```

---

### Task 4: Add Clean + Normalize and Repair Plan

**Files:**
- Modify: `products/drafts/data-quality-profiler/src/dataset/operations.mjs`
- Modify: `products/drafts/data-quality-profiler/test/operations.test.mjs`

**Interfaces:**
- `cleanNormalize(payload, options?) -> { schema_version, original_record_count, cleaned_record_count, removed_duplicate_rows, transformations, schema_fingerprint, records }`
- `repairPlan(payload, options?) -> { schema_version, quality_score, schema_fingerprint, issues, actions }`

- [ ] **Step 1: Add failing clean/repair tests**

```js
const cleaned = cleanNormalize({
  format: "json",
  records: [
    { id: 1, name: "  Alice  ", note: "   " },
    { id: 1, name: "Alice", note: null },
  ],
});
assert.equal(cleaned.cleaned_record_count, 1);
assert.equal(cleaned.removed_duplicate_rows, 1);
assert.deepEqual(cleaned.records, [{ id: 1, name: "Alice", note: null }]);

const plan = repairPlan({
  format: "json",
  records: [{ id: 1, value: "1" }, { id: 1, value: 2 }, { id: 1, value: null }],
});
assert.ok(plan.actions.some((x) => x.code === "DEDUPLICATE_ROWS"));
assert.ok(plan.actions.some((x) => x.code === "RESOLVE_MISSING_VALUES"));
assert.ok(plan.actions.some((x) => x.code === "NORMALIZE_FIELD_TYPES"));
```

Test `options.trim_strings`, `options.blank_to_null`, and `options.deduplicate` can each be disabled and must be booleans when supplied.

- [ ] **Step 2: Run and confirm RED**

- [ ] **Step 3: Implement conservative cleaning and deterministic recommendations**

Cleaning rules:

```js
trim_strings: true
blank_to_null: true
deduplicate: true
```

Only trim string edges, convert strings whose trimmed value is empty to `null`, and remove exact canonical duplicates after transformations. Never impute, cast nonblank values, rename fields, or drop columns.

Repair action ordering is fixed: duplicates, missing values, mixed types, identifier integrity, constant fields.

- [ ] **Step 4: Run and confirm GREEN**

- [ ] **Step 5: Commit**

---

### Task 5: Expose six HTTP routes and expand the seller manifest

**Files:**
- Modify: `products/drafts/data-quality-profiler/src/app.mjs`
- Modify: `products/drafts/data-quality-profiler/test/counterparty-api.test.mjs`
- Modify: `products/drafts/data-quality-profiler/test/api.test.mjs`

**Interfaces:**
- Six new POST routes call the six operation functions.
- `/.well-known/x402` reports exactly eight real resources/endpoints.

- [ ] **Step 1: Add failing manifest/API tests**

Manifest assertions:

```js
assert.equal(body.capabilities.tools, 8);
assert.equal(new Set(body.resources).size, 8);
assert.equal(body.payment.x402.priceRange, "$0.005-$0.03");
assert.equal(body.capabilities.categories.find((x) => x.key === "data-quality").tools, 7);
```

Assert paths/prices:

```js
const expected = new Map([
  ["/v1/duplicate-audit", 0.005],
  ["/v1/quality-gate", 0.01],
  ["/v1/schema-drift", 0.015],
  ["/v1/data-contract-check", 0.015],
  ["/v1/clean-normalize", 0.02],
  ["/v1/repair-plan", 0.02],
]);
for (const [path, price] of expected) {
  const endpoint = body.endpoints.find((x) => x.path === path);
  assert.equal(endpoint.method, "POST");
  assert.equal(endpoint.price_usd, price);
  assert.equal(endpoint.network, "eip155:8453");
}
```

HTTP injection tests call every route with a minimal valid body and payment middleware disabled, expecting 200 and route-specific fields.

- [ ] **Step 2: Run focused tests and confirm RED**

- [ ] **Step 3: Add imports, manifest entries, and thin handlers**

Handlers catch operation errors and reuse `classifyError` exactly like existing routes.

Search-oriented names:

- `duplicate-row-audit-json-csv`
- `data-quality-pass-fail-gate-etl-rag`
- `schema-drift-added-removed-type-changes`
- `data-contract-schema-compatibility-check`
- `clean-normalize-json-csv-deduplicate-trim`
- `dataset-repair-plan-missing-duplicates-mixed-types`

- [ ] **Step 4: Re-run focused tests and confirm GREEN**

- [ ] **Step 5: Commit**

---

### Task 6: Protect all new routes with x402 and Bazaar discovery

**Files:**
- Modify: `products/drafts/data-quality-profiler/src/payments/x402-plugin.mjs`
- Modify or create focused payment tests under `products/drafts/data-quality-profiler/test/`

**Interfaces:**
- Route prices map to the six config fields from Task 1.
- Every route declares JSON input/output discovery metadata.

- [ ] **Step 1: Add failing route/payment metadata tests**

Test that the plugin protects all eight POST routes and that route-specific prices match config. If direct plugin introspection is impractical, exercise an app with x402 enabled against a stub resource/facilitator seam already used by existing tests; otherwise add a small exported pure `buildProtectedRoutes(config)` helper and test that helper directly.

Expected new route price mapping:

```js
{
  "POST /v1/duplicate-audit": "$0.005",
  "POST /v1/quality-gate": "$0.01",
  "POST /v1/schema-drift": "$0.015",
  "POST /v1/data-contract-check": "$0.015",
  "POST /v1/clean-normalize": "$0.02",
  "POST /v1/repair-plan": "$0.02",
}
```

- [ ] **Step 2: Run and confirm RED**

- [ ] **Step 3: Add Bazaar declarations and route entries**

Use valid minimal probe examples:

```json
{"format":"json","records":[{"id":1},{"id":1}]}
```

for duplicate/quality/clean/repair;

```json
{"baseline":{"format":"json","records":[{"id":1}]},"current":{"format":"json","records":[{"id":1,"name":"A"}]}}
```

for drift; and

```json
{"dataset":{"format":"json","records":[{"id":1}]},"contract":{"required_fields":["id"],"field_types":{"id":"integer"},"allow_extra_fields":true}}
```

for contract.

- [ ] **Step 4: Run payment/focused tests and confirm GREEN**

- [ ] **Step 5: Commit**

---

### Task 7: Full verification and production publication

**Files:**
- No feature behavior beyond prior tasks.
- Temporary CI workflow may be created only on the feature branch if existing Actions do not run for it; it must not remain in the production diff.

- [ ] **Step 1: Run the complete package tests**

```bash
cd products/drafts/data-quality-profiler
npm ci
node --test test/*.test.mjs
```

Expected: zero failures.

- [ ] **Step 2: Run syntax checks**

```bash
node --check src/app.mjs
node --check src/config.mjs
node --check src/dataset/operations.mjs
node --check src/payments/x402-plugin.mjs
```

Expected: exit 0 for each.

- [ ] **Step 3: Verify feature-branch diff**

Diff against `feat/hermes-commerce-control-plane` must contain only the approved Batch 1 code/tests/spec/plan and no secret, token, workflow residue, wallet change, facilitator change, or unrelated refactor.

- [ ] **Step 4: Publish the tested feature head to `feat/hermes-commerce-control-plane`**

The user's approval of this portfolio design includes implementation, deployment, and distribution for Batch 1. Preserve a fast-forward history where possible.

- [ ] **Step 5: Verify Render deploy**

Confirm Render checks out the exact production head, build completes, health passes, and deploy status reaches `live`. Trigger one manual deploy only if the configured commit webhook again fails to create a deploy record.

---

### Task 8: Live x402 acceptance, Agent402 refresh, and 402 Index registration

**Files:**
- A temporary verification workflow may run from an isolated branch to make outbound POST registration calls; do not merge it into production.

- [ ] **Step 1: Probe all six new live routes unpaid**

For each route, send the valid minimal JSON probe body and assert HTTP 402. Decode `PAYMENT-REQUIRED` and verify:

- scheme `exact`
- network `eip155:8453`
- asset canonical Base USDC `0x833589fCD6EDb6E08f4c7C32D4f71b54bdA02913`
- payTo `0x2BD7c4e294B09E9a853168a58712498D03A45B01`
- amounts `5000`, `10000`, `15000`, `15000`, `20000`, `20000`
- `resource.url` uses HTTPS

- [ ] **Step 2: Register/refresh Agent402 origin**

```bash
curl -fsS -X POST 'https://agent402.tools/api/index/register' \
  -H 'content-type: application/json' \
  --data '{"origin":"https://hermes-counterparty-api.onrender.com"}'
```

Then poll seller detail until the new route names appear or one normal crawl interval has elapsed. Record `health`, `routable`, unique route list, and parser duplicate behavior separately.

- [ ] **Step 3: Register six new endpoints with 402 Index**

Call `POST https://402index.io/api/v1/register` once per route with `protocol=x402`, `http_method=POST`, route-specific `probe_body`, price, `payment_asset=USDC`, `payment_network=Base`, `category=data-quality`, `provider=Hermes Commerce`. Six writes are within the documented 10/hour/IP registration limit.

Expected: `201` pending/accepted or an existing-record update response; `422` must be diagnosed before claiming distribution complete.

- [ ] **Step 4: Verify 402 Index listings**

Confirm the verified domain is associated with the new service records and no route is silently unprobeable because of a bad request example.

- [ ] **Step 5: Update existing sale monitor**

Update automation `6a8712264e708191a05e8bfaa26b87f4` to cover all eight real paid routes and route-specific prices. Preserve hourly condition-watch cadence and genuine-external-sale exclusions.

- [ ] **Step 6: Record launch baseline**

Capture launch time, eight real routes, prices, Agent402 health/routability, 402 Index state, and earning-wallet starting balance so future sale measurement has a clean baseline.
