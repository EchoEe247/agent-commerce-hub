---
name: hermes-verification
description: |
  Use Hermes Agent Commerce x402 utilities for low-cost software dependency verification and deterministic JSON/CSV data-quality checks.

  USE FOR:
  - Checking an exact npm, PyPI, Maven, Go, or RubyGems dependency version for known OSV vulnerabilities
  - Checking whether an exact npm or PyPI version is current, deprecated, yanked, or constrained by runtime requirements
  - Detecting schema drift between baseline and current datasets
  - Validating JSON/CSV datasets against required fields, inferred types, and extra-field policy
  - Auditing exact duplicate rows
  - Cleaning/normalizing JSON or CSV conservatively
  - Producing a deterministic repair plan before modifying data

  TRIGGERS:
  - "dependency vulnerability", "OSV", "is this package vulnerable"
  - "package outdated", "deprecated package", "yanked release", "maintenance status"
  - "schema drift", "data contract", "dataset validation"
  - "duplicate rows", "clean CSV", "normalize JSON", "repair plan"
metadata:
  version: 1.0
---

# Hermes Verification — x402 developer and data checks

Use the AgentCash CLI or another x402-capable client against:

`https://hermes-counterparty-api.onrender.com`

The priority here is **verification work**, not generic company enrichment. These routes are designed to fit coding agents, autonomous work agents, CI/review agents, and data-processing agents that already have an x402/USDC spend path.

## Mandatory AgentCash workflow

Before the first paid call in a task:

1. `npx agentcash@latest discover https://hermes-counterparty-api.onrender.com`
2. `npx agentcash@latest check <endpoint-url>` — confirm the live schema and price
3. If the host agent's spend policy permits the quoted price, use `npx agentcash@latest fetch <endpoint-url> ...`

`discover`, `check`, and marketplace search are inspection steps. Do not replace them with a paid `fetch` merely to test availability.

Never guess request fields. Treat the live OpenAPI schema as canonical:

`https://hermes-counterparty-api.onrender.com/openapi.json`

## Priority operations

| Task | Endpoint | Current advertised price | Use when |
|---|---|---:|---|
| Exact dependency vulnerability check | `/v1/dependency-vulnerability-check` | $0.015 | A coding/review agent needs OSV/CVE evidence for one exact dependency version |
| Package maintenance snapshot | `/v1/package-maintenance-snapshot` | $0.015 | A coding agent needs latest/current, release age, deprecated/yanked, license, repo, or runtime constraints |
| Schema drift | `/v1/schema-drift` | $0.015 | Compare baseline vs current dataset shape and flag breaking changes |
| Data-contract check | `/v1/data-contract-check` | $0.015 | Validate required fields, inferred types, and extra-field policy |
| Duplicate audit | `/v1/duplicate-audit` | $0.005 | Quantify exact duplicate JSON/CSV rows before cleanup |
| Clean + normalize | `/v1/clean-normalize` | $0.02 | Trim strings, convert blanks to null, remove exact duplicate rows |
| Repair plan | `/v1/repair-plan` | $0.02 | Produce ordered remediation actions without changing the input data |

Prices above are discovery hints, not authorization to spend. Re-check the live endpoint before payment.

## Software verification flow

For a code-review, dependency-upgrade, or delivery task:

1. Identify the exact ecosystem, package, and installed version from lockfiles/manifests.
2. Check `/v1/dependency-vulnerability-check`.
3. If maintenance status matters, check `/v1/package-maintenance-snapshot` for npm/PyPI.
4. Cite returned source/provenance fields in the work product.
5. Do not claim a dependency is safe merely because no vulnerability is returned; report the scope as an OSV check for the exact version.

Example discovery-safe sequence:

```bash
ORIGIN=https://hermes-counterparty-api.onrender.com
npx agentcash@latest discover "$ORIGIN"
npx agentcash@latest check "$ORIGIN/v1/dependency-vulnerability-check"
```

Then construct the paid request only from the schema returned by `check`.

## Data verification flow

For CSV/JSON work, use the narrowest check that answers the task:

- duplicates only -> `/v1/duplicate-audit`
- baseline/current shape comparison -> `/v1/schema-drift`
- explicit field/type contract -> `/v1/data-contract-check`
- recommendation before touching data -> `/v1/repair-plan`
- conservative cleanup requested -> `/v1/clean-normalize`

Prefer audit/plan operations before mutating or rewriting user data.

## Other Hermes operations

The origin also publishes business-intelligence and compliance operations, including company/domain intelligence, SEC snapshots, OFAC candidate screening, and counterparty availability. Discover them from the live OpenAPI document when the task specifically needs them.

For company/domain research, a free preview exists at:

`POST https://hermes-counterparty-api.onrender.com/v1/company-domain-intelligence/preview`

Do not make company enrichment the default Hermes wedge when a host ecosystem already has a preferred company-data provider.

## Safety and payment discipline

- Respect the host agent's existing spend cap and approval policy.
- Do not expose wallet private keys, seed phrases, or signing material.
- Do not pay simply to test whether an endpoint exists; use discovery/check first.
- Use the narrowest endpoint that answers the task.
- Preserve returned provenance and limitations in downstream claims.
