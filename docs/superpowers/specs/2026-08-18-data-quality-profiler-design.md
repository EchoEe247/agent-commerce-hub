# Data Quality Profiler — Design Specification

**Date:** 2026-08-18  
**Status:** Approved design; implementation not yet authorized  
**Repository:** `EchoEe247/agent-commerce-hub`  
**Primary target:** Agent402 / broader x402 ecosystem  
**Initial payment path:** USDC on Base via x402  
**Initial success criterion:** Obtain at least one genuine external paid call after a reliable public deployment and discovery listing.

## 1. Objective

Build a small deterministic paid API that accepts JSON or CSV datasets and returns a machine-readable dataset health report suitable for autonomous agents and automated data pipelines.

The first release must be deliberately narrow, cheap to operate, reproducible, and safe. It must not depend on an LLM, browser automation, external paid APIs, remote URL fetching, or arbitrary user code.

The commercial experiment is intended to answer one question before we expand the product catalog:

> Can a new seller in the x402 ecosystem attract genuine paid usage with a reliable low-cost deterministic endpoint?

## 2. Market rationale

Hermes' 2026-08-18 commerce census found Agent402/x402 to be materially more active than Hypawave, with live paid-call activity and broad x402 settlement evidence. The market remains highly concentrated, so the first product should minimize operating and development cost while testing discoverability and demand.

Hermes identified data validation / quality profiling as a plausible first opportunity because:

- data-oriented endpoints are common in the x402 ecosystem;
- comparable JSON/API quality-review functionality already exists;
- the workload can be fulfilled deterministically without paid model inference;
- per-call compute can remain extremely low;
- the output is objectively verifiable and machine-consumable.

The product should not be positioned as a generic JSON syntax validator. Its positioning is:

> **Machine-readable dataset health profiling for autonomous pipelines.**

## 3. Product contract

### 3.1 Public API

Initial endpoint:

```http
POST /v1/profile
Content-Type: application/json
```

The service accepts either:

1. JSON records supplied directly; or
2. CSV content supplied as a string.

Example JSON request:

```json
{
  "format": "json",
  "records": [
    {"id": 1, "email": "a@example.com", "age": 22},
    {"id": 2, "email": null, "age": "23"}
  ]
}
```

Example CSV request:

```json
{
  "format": "csv",
  "data": "id,email,age\n1,a@example.com,22\n2,,23"
}
```

### 3.2 Initial limits

The first release should enforce approximately:

- maximum request body: **1 MB**;
- maximum records: **1,000**;
- maximum fields per record: **250**;
- maximum nesting depth: **8**;
- execution timeout: approximately **5 seconds**.

The exact implementation values may be tightened during development if profiling on the target runtime shows a safer bound is necessary.

### 3.3 Explicit v1 exclusions

Do not support in v1:

- ZIP archives;
- PDFs;
- arbitrary file-system paths;
- database connections;
- remote URL fetching;
- browser execution;
- user-provided executable code;
- arbitrary shell commands;
- encrypted archives;
- LLM analysis;
- scheduled monitoring;
- `/compare` execution.

The report format should be designed so a future `/compare` endpoint can be added without breaking existing clients.

## 4. Report features

The v1 profiler should return, where applicable:

- record count;
- field/column count;
- inferred type per field;
- null/missing counts and percentages;
- distinct-value counts;
- unique ratio;
- duplicate-row count;
- mixed-type/type-conflict detection;
- constant or near-constant field detection;
- candidate identifier fields;
- numeric min, max, mean, and median;
- string-length statistics;
- malformed-record count;
- compact warning objects;
- transparent overall quality score;
- score breakdown;
- deterministic schema fingerprint;
- processing duration;
- request identifier;
- response schema version.

Example response shape:

```json
{
  "schema_version": "1.0",
  "request_id": "prof_...",
  "quality_score": 91,
  "score_breakdown": {
    "missing_data": -4,
    "duplicates": 0,
    "type_conflicts": -5,
    "malformed_records": 0,
    "constant_fields": 0,
    "identifier_integrity": 0
  },
  "dataset": {
    "record_count": 2,
    "field_count": 3,
    "duplicate_rows": 0,
    "schema_fingerprint": "sha256:..."
  },
  "fields": {
    "id": {
      "inferred_type": "integer",
      "null_count": 0,
      "distinct_count": 2,
      "unique_ratio": 1.0,
      "candidate_identifier": true
    },
    "email": {
      "inferred_type": "string",
      "null_count": 1,
      "null_pct": 50.0
    },
    "age": {
      "inferred_type": "mixed",
      "type_conflicts": {
        "integer": 1,
        "string": 1
      }
    }
  },
  "warnings": [
    {
      "code": "MIXED_TYPES",
      "field": "age"
    }
  ],
  "processing_ms": 7
}
```

## 5. Deterministic scoring model

The quality score must be explainable and reproducible. It must not be an opaque model judgment.

Initial scoring model:

```text
Start: 100

Missing-data penalty          up to -25
Duplicate-row penalty         up to -20
Type-conflict penalty         up to -20
Malformed-record penalty      up to -20
Constant-field penalty        up to -5
Identifier-integrity penalty  up to -10
```

Implementation must define exact formulas, caps, and rounding behavior in code and tests.

Requirements:

- identical input must produce the same score;
- deductions must be returned to the caller;
- scoring must be independent of execution order;
- no clock time, randomness, model output, or external service may influence the score;
- future scoring changes that alter semantics should require a schema/scoring version change.

## 6. Schema fingerprint

Each successfully profiled dataset should receive a stable fingerprint generated from a canonical representation of the inferred schema.

Example:

```json
{
  "schema_fingerprint": "sha256:..."
}
```

The canonicalization algorithm must be deterministic and documented. At minimum it should avoid being affected by object key iteration order.

The fingerprint exists primarily to make a future `/compare` feature possible for automated pipelines.

Future `/compare` may report changes such as:

- field added;
- field removed;
- inferred type changed;
- null rate changed;
- uniqueness changed;
- duplicate rate changed.

`/compare` is explicitly out of scope for the initial release.

## 7. Error contract

Errors must be structured and machine-readable.

Example:

```json
{
  "error": {
    "code": "INVALID_DATASET",
    "message": "JSON records must be objects.",
    "details": {
      "invalid_records": [17, 43]
    }
  }
}
```

The implementation should define stable error codes for at least:

- unsupported format;
- malformed JSON;
- malformed CSV;
- invalid record shape;
- request too large;
- too many records;
- too many fields;
- nesting too deep;
- processing timeout;
- payment required;
- payment verification failure;
- internal processing failure.

Buyer-caused invalid input and service-caused fulfillment failure must be distinguishable in logs and metrics.

## 8. Runtime architecture

The paid endpoint must be a small standalone service. Hermes is the operator, not part of the synchronous fulfillment path.

```text
Buyer / AI agent
      ↓
public HTTPS endpoint
      ↓
basic envelope validation
      ↓
x402 payment middleware
      ↓
payment verification
      ↓
Data Quality Profiler
      ↓
structured JSON result
```

Hermes may deploy, restart, test, inspect health, update non-secret metadata, prepare releases, and roll back releases. A customer call must not need to wake Hermes or invoke an LLM.

This separation keeps latency, reliability, and marginal cost predictable.

## 9. Payment architecture

Initial target:

- protocol: **x402**;
- asset: **USDC**;
- network: **Base**.

The service should perform cheap envelope checks before presenting/processing the paid path where the protocol flow permits, so obviously unsupported requests do not consume unnecessary work.

Detailed dataset processing must occur only after successful payment verification.

The implementation must safely handle replayed or duplicate payment attempts according to the selected x402 library/facilitator semantics.

Initial list price target: approximately **$0.02 per report**.

Pricing is not immutable. It should be treated as an experiment and may be adjusted after observed demand and call economics are available.

## 10. Wallet and financial boundary

The public service should use a dedicated self-custody commerce receiving address rather than exposing a primary exchange account directly.

Conceptual flow:

```text
customer USDC
     ↓
dedicated commerce wallet
     ↓
[user-approved transfer]
     ↓
Coinbase
     ↓
USD
```

Coinbase is the planned primary fiat off-ramp, but Coinbase interaction is outside this product's runtime.

Hermes must not autonomously:

- transfer received USDC out of the commerce wallet;
- change the receiving wallet;
- export private keys or recovery material;
- cash out through Coinbase;
- increase spending limits;
- purchase external services without user authorization;
- rotate financial credentials without explicit authorization.

No wallet secret, private key, recovery phrase, token, API key, or equivalent credential may be committed to this repository.

## 11. Privacy and retention

Customer dataset bodies must **not be retained by default**.

Operational logs should contain only what is necessary to diagnose service behavior, such as:

- request ID;
- timestamp;
- request byte size;
- record count after parsing;
- field count;
- processing duration;
- outcome/status;
- non-secret payment/settlement identifiers where safe;
- error classification.

Do not log raw CSV or JSON bodies by default.

If future debugging requires temporary payload retention, that must be a separately designed and explicitly approved feature with retention limits and privacy controls.

## 12. Hosting strategy

Do not purchase hosting before local implementation and acceptance tests pass.

Deployment criteria:

- stable public HTTPS URL;
- lightweight Node/Python/container support;
- low idle cost;
- automatic restart;
- sufficient memory/CPU for the v1 limits;
- usable logs/health checks;
- no GPU requirement.

The product must not require an expensive server merely to test whether demand exists.

## 13. Security model

The implementation must enforce hard resource limits and avoid unsafe parsing/execution behavior.

Security expectations include:

- no arbitrary code execution;
- no shell execution from customer input;
- no local file-path access from customer input;
- no URL fetching in v1;
- bounded parsing and analysis;
- timeout enforcement;
- memory-conscious duplicate/statistics algorithms;
- safe CSV parsing;
- controlled nesting traversal;
- no secrets in responses;
- no customer payloads in routine logs;
- no financial credentials in GitHub.

## 14. Acceptance gates

The service is not eligible for public mainnet discovery until all applicable gates pass.

### Functional

- valid JSON profile;
- valid CSV profile;
- missing values;
- duplicate rows;
- mixed types;
- constant fields;
- identifier candidates;
- numeric statistics;
- schema fingerprint;
- deterministic scoring.

### Limits

- requests over the byte limit are rejected;
- requests over the record limit are rejected;
- requests over the field limit are rejected;
- excessive nesting is rejected;
- timeout is enforced.

### Security

- arbitrary code cannot execute;
- file paths cannot be accessed;
- URLs are not fetched;
- secrets do not appear in responses/logs;
- pathological inputs cannot trivially exhaust memory or CPU.

### Determinism

- identical input produces identical analysis;
- identical input produces identical score;
- schema fingerprint is stable;
- score breakdown is reproducible.

### API

- structured success responses;
- structured errors;
- schema version present;
- request IDs present;
- sensible HTTP status codes.

### Payments

- unpaid request cannot obtain paid output;
- valid paid request can obtain output;
- replay/duplicate-payment behavior is safe;
- payment failure cannot accidentally expose paid output;
- service-caused failure is distinguishable from invalid buyer input.

### Operations

- health endpoint;
- startup test;
- restart test;
- useful non-sensitive logs;
- no dataset-body retention by default;
- documented rollback procedure.

## 15. Responsibilities

### ChatGPT

Owns product reasoning and review:

- API contract;
- scoring specification;
- competitive positioning;
- pricing analysis;
- threat-model review;
- QA review;
- interpretation of market evidence;
- decision support on whether to expand the product.

### Hermes

Owns implementation and operation after explicit implementation authorization:

- implementation;
- tests;
- dependency setup;
- local runtime verification;
- deployment preparation;
- health checks;
- x402 integration;
- discovery metadata;
- operational telemetry;
- reproducible evidence committed to GitHub;
- release/rollback execution within approved boundaries.

### User

Retains authority over:

- financial transfers;
- wallet withdrawals;
- Coinbase cash-out;
- material spending decisions;
- final production authorization where requested.

## 16. Shared GitHub workflow

The repository is the coordination surface between Hermes and ChatGPT.

Expected product lifecycle:

```text
researched
  ↓
design approved
  ↓
building
  ↓
review
  ↓
ready
  ↓
approved
  ↓
published
  ↓
measuring
  ↓
iterate | retire
```

`ready` must never be interpreted as automatic authorization to make a financial transaction.

Implementation evidence should be placed under the repository's established product, handoff, analytics, and receipt paths rather than pasted into chat when avoidable.

## 17. Initial experiment and decision rules

The first commercial objective is not immediate meaningful revenue.

Initial success criterion:

> Deploy a reliable paid endpoint, make it discoverable, and obtain at least one genuine external paid call.

Interpretation guide:

- **0 external paid calls:** inspect discovery, positioning, listing quality, and market fit before building additional products;
- **1–10 external paid calls:** evidence that a new seller can receive real market traffic;
- **repeat buyers or growing call count:** consider `/compare`, larger input tiers, or adjacent deterministic products;
- **meaningful recurring volume:** optimize infrastructure and consider expanding the catalog.

Do not build multiple additional paid endpoints merely because implementation is easy. Expansion should follow observed demand.

## 18. Out of scope for this design

This specification does not authorize or design:

- production implementation;
- hosting purchase;
- wallet creation or funding;
- Coinbase interaction;
- mainnet deployment;
- Agent402/x402 listing submission;
- `/compare` implementation;
- LLM-backed premium tiers;
- remote web extraction;
- document conversion;
- repository analysis services;
- monitoring subscriptions.

Those require later implementation planning and/or separate approval.

## 19. Evidence references

This design is based on the Hermes commerce-scout evidence committed in `ca9220f`, including:

- `handoffs/hermes-to-chatgpt/commerce-scout-2026-08-18.json`
- `research/normalized/agent402-market-latest.json`
- `research/normalized/the402-market-latest.json`
- `research/reports/agent402-vs-the402-2026-08-18.md`
- `research/opportunities/commerce-opportunities-2026-08-18.md`

The design intentionally targets Agent402/x402 first. the402 remains paused as a commercial target until its live payment/work-request functionality returns and is re-evaluated.
