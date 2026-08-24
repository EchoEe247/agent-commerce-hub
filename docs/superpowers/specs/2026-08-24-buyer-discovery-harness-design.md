# Buyer Discovery Harness Design

## Status

Approved direction, design-stage only. This spec defines a new verification subsystem and does not authorize production deployment, registration, payment, or wallet use.

## Objective

Build a deterministic buyer-discovery verification harness that answers one question: can an independent agent starting from ordinary buyer intent reliably discover, understand, preview, and reach the correct paid x402 boundary for the Hermes company-intelligence product without being told the paid endpoint in advance?

The harness must verify the pre-payment acquisition path:

`buyer intent -> discovery surfaces -> product match -> free preview -> paid endpoint -> valid 402/Bazaar challenge`

It must never make a real payment.

## Repository and branch relationship

Implementation lives in `EchoEe247/agent-commerce-hub`.

This branch is intentionally stacked on `feat/agent-discovery-llms` / PR #38 because the verification target includes the new `/llms.txt` surface. The stack must remain explicit until PR #38 is merged or rebased onto the live commerce branch.

The live production-validation branch remains `feat/hermes-commerce-control-plane`; this subsystem must not modify payment settlement behavior, commerce telemetry semantics, or the production deployment configuration as part of its initial implementation.

## Constraints

- No production payment may be attempted.
- No wallet key, signer, token, payment header, Authorization header, or other secret may be required or committed.
- OpenAPI remains the canonical machine-readable discovery contract.
- Runtime unpaid 402 behavior remains the final proof of the paid boundary.
- `/llms.txt` is an additional agent-facing explanation surface, not a replacement for OpenAPI.
- The harness must be deterministic in CI; no LLM call is allowed in the required test path.
- External marketplace/catalog checks are observational and must not become prerequisites for the deterministic unit/integration suite.
- The harness may use public network calls only in explicit live-check mode.
- Registration to x402scan, AgentCash, Bazaar, or any marketplace is out of scope because registration is an external publishing action.
- The harness must distinguish verified observations from inferred recommendations.

These constraints follow the repository rule that GitHub is a coordination/evidence surface rather than a credential or wallet store, and that financial state changes do not authorize spending.

## Approaches considered

### Approach A: CLI-only external validator

Call `npx -y @agentcash/discovery@latest discover "$TARGET_URL"` and `check "$TARGET_URL"`, save their output, and treat that as the acquisition test.

Advantages:
- Very small implementation.
- Closely follows current AgentCash/x402scan guidance.
- Useful as an external compatibility check.

Disadvantages:
- Network-dependent and version-dependent.
- Does not model our specific buyer intents.
- Does not independently verify `/llms.txt` semantics or the free-preview upgrade path.
- A third-party CLI failure could break CI without any product regression.

### Approach B: full LLM buyer simulation

Give a model prompts such as “research this company” and ask it to discover and invoke the service autonomously.

Advantages:
- Closest to an end-user agent experience.
- Can reveal wording and ranking problems that deterministic checks miss.

Disadvantages:
- Non-deterministic.
- Requires model/provider configuration and potentially paid inference.
- Hard to distinguish product regressions from model behavior changes.
- Poor fit for a required regression gate.

### Approach C: deterministic core plus optional live adapters — selected

Implement a local deterministic acquisition evaluator that reads the service’s real OpenAPI and `/llms.txt` output, maps predefined buyer intents to expected discovery evidence, performs a free preview request, performs an unpaid paid-route request, decodes and validates the returned x402/Bazaar challenge, and produces a structured report. Add optional live adapters that can run AgentCash discovery commands and public catalog probes separately.

Why this is selected:
- It gives a stable regression gate for our actual funnel.
- It verifies the same surfaces agents use without requiring an LLM.
- It can run fully in-process with Fastify injection for CI.
- It can later be pointed at production without changing the evaluator model.
- External tooling remains valuable corroboration instead of becoming a brittle dependency.

## Buyer intent corpus

Version 1 uses a small explicit corpus rather than arbitrary natural-language generation:

1. `research_company` — “research this company”
2. `enrich_domain` — “enrich this domain”
3. `investigate_business` — “investigate this business”
4. `qualify_lead` — “qualify this lead”
5. `inspect_company_website` — “inspect this company website”

Each intent is expected to resolve to the company-domain-intelligence acquisition funnel. The harness does not claim semantic universality; it verifies that our published discovery surfaces contain enough explicit vocabulary and route metadata to support these high-value buyer formulations.

The corpus is data, not executable prompt logic. Adding an intent requires adding a test and explicit expected evidence.

## Architecture

### 1. Intent definitions

Create a focused module under the profiler product, tentatively:

`products/drafts/data-quality-profiler/src/discovery/buyer-intents.mjs`

It exports an immutable array of intent records:

```js
{
  id: "research_company",
  phrase: "research this company",
  expectedOperationId: "companyDomainIntelligence",
  expectedPreviewOperationId: "previewCompanyDomainIntelligence"
}
```

No fuzzy model inference occurs here.

### 2. Discovery evaluator

Create:

`products/drafts/data-quality-profiler/src/discovery/buyer-discovery-evaluator.mjs`

The evaluator accepts retrieved discovery artifacts rather than performing network I/O itself. Core input shape:

```js
{
  intents,
  openapi,
  llmsText,
  previewObservation,
  paidBoundaryObservation
}
```

The evaluator returns one JSON-serializable report with independent checks for:

- OpenAPI availability and version.
- `info.x-guidance` presence.
- Company paid operation presence.
- Company request schema containing required `domain`.
- Company output schema presence.
- Paid operation `x-payment-info` price and protocol metadata.
- Paid operation 402 response declaration.
- Free preview operation presence and absence of `x-payment-info`.
- `/llms.txt` buyer-intent vocabulary coverage.
- `/llms.txt` preview path and paid path references.
- Preview observation: HTTP 200, no payment challenge, `preview: true`, upgrade target equals the paid path.
- Paid boundary observation: HTTP 402, x402 version 2, expected network/payTo/amount shape, valid Bazaar extension metadata.

The evaluator does not settle, sign, or retry with payment.

### 3. In-process acquisition probe

Create a test/runtime helper that uses the existing `buildApp()` and Fastify `inject()` path. It performs two requests using a safe public example domain such as `stripe.com` while substituting the company-intelligence implementation in tests so CI does not depend on DNS/RDAP/web availability.

Probe sequence:

1. `GET /openapi.json`
2. `GET /llms.txt`
3. `POST /v1/company-domain-intelligence/preview` with `{ "domain": "stripe.com" }`
4. `POST /v1/company-domain-intelligence` with the same body and no payment header

The paid request must stop at 402. No payment-capable client is constructed.

The 402 decoder should reuse the same Base64 `PAYMENT-REQUIRED` interpretation already established in company x402 tests instead of introducing a second wire format.

Bazaar metadata is validated with `validateDiscoveryExtension` from the already installed `@x402/extensions` dependency.

### 4. Report format

Create a stable report contract, versioned from the first release:

```json
{
  "schema_version": "1.0",
  "target": "in-process",
  "overall": "pass",
  "summary": {
    "checks": 12,
    "passed": 12,
    "failed": 0
  },
  "intent_results": [
    {
      "intent_id": "research_company",
      "phrase": "research this company",
      "matched": true,
      "operation_id": "companyDomainIntelligence",
      "preview_operation_id": "previewCompanyDomainIntelligence",
      "evidence": ["openapi.info.x-guidance", "llms.txt"]
    }
  ],
  "checks": [
    {
      "id": "paid_boundary.http_402",
      "status": "pass",
      "observed": 402
    }
  ]
}
```

Rules:
- `overall` is `pass` only when every required check passes.
- No secrets or raw payment signatures are included.
- The report may include public route paths, prices, network identifiers, public payTo addresses, and public metadata because those are already part of the service’s discovery contract.
- Failures contain bounded diagnostic text, not full request/response bodies.

### 5. CLI script

Create:

`products/drafts/data-quality-profiler/scripts/buyer-discovery-check.mjs`

Default mode runs the deterministic in-process check and prints the JSON report. Exit code is `0` for pass and `1` for any required failure.

Optional production mode accepts a public target origin through `TARGET_URL`. In that mode it performs only unauthenticated/free HTTP requests and one unpaid paid-route probe. It must reject non-HTTP(S) origins and must never read wallet/signer environment variables.

The first implementation does not execute third-party registration actions.

### 6. Optional external compatibility adapter

A separate script may invoke the current public AgentCash discovery validator:

```bash
npx -y @agentcash/discovery@latest discover "$TARGET_URL"
npx -y @agentcash/discovery@latest check "$TARGET_URL"
```

This adapter is informative and live-only. Its results are recorded separately from the deterministic `overall` result because package updates, network outages, or registry changes are external variables.

The design deliberately does not parse marketplace ranking or buyer counts into the core pass/fail contract.

## Data flow

### Deterministic CI mode

`buyer-intents -> buildApp -> OpenAPI + llms.txt + preview + unpaid 402 -> evaluator -> JSON report -> test assertions`

### Production observation mode

`TARGET_URL -> fetch OpenAPI + llms.txt + preview + unpaid 402 -> evaluator -> JSON report`

No step after the 402 challenge is allowed.

## Failure classification

Required failures use stable categories so we can diagnose the funnel rather than receive one generic red build:

- `DISCOVERY_OPENAPI_MISSING`
- `DISCOVERY_GUIDANCE_MISSING`
- `DISCOVERY_INPUT_SCHEMA_MISSING`
- `DISCOVERY_OUTPUT_SCHEMA_MISSING`
- `DISCOVERY_PAYMENT_METADATA_MISSING`
- `DISCOVERY_402_DECLARATION_MISSING`
- `LLMS_INTENT_COVERAGE_MISSING`
- `PREVIEW_NOT_FREE`
- `PREVIEW_UPGRADE_MISMATCH`
- `PAID_BOUNDARY_NOT_402`
- `X402_CHALLENGE_INVALID`
- `BAZAAR_METADATA_INVALID`

The report can contain multiple failures in one run; the evaluator should not stop after the first failure unless an artifact is structurally unreadable.

## Testing strategy

Implementation is test-first.

### Unit tests

`test/buyer-discovery-evaluator.test.mjs`

Cover:
- all five intents match the valid OpenAPI + llms fixture;
- one missing intent phrase fails only that intent coverage check;
- preview carrying payment metadata fails `PREVIEW_NOT_FREE`;
- wrong upgrade path fails `PREVIEW_UPGRADE_MISMATCH`;
- paid response not equal to 402 fails `PAID_BOUNDARY_NOT_402`;
- malformed x402 challenge fails `X402_CHALLENGE_INVALID`;
- invalid Bazaar extension fails `BAZAAR_METADATA_INVALID`.

### Integration tests

`test/buyer-discovery-harness.test.mjs`

Use the real app builder and real payment middleware with the existing fake facilitator pattern. Prove the complete in-process sequence reaches:

- OpenAPI 200;
- `/llms.txt` 200 without payment;
- preview 200 without payment;
- paid route 402;
- valid x402 version/network/amount/payTo shape;
- valid Bazaar metadata;
- overall evaluator report `pass`.

### Regression gate

Add the new test files and script/runtime modules to `Counterparty Seller CI` path filters and focused test list so the PR gate executes them. The full profiler suite remains mandatory on PRs.

External AgentCash/x402scan checks remain a manually dispatched or explicit live step; they must not make deterministic CI depend on internet marketplace state.

## Security and financial boundaries

- Never create a signer.
- Never import wallet/private-key helpers.
- Never emit a payment header.
- Never call settlement endpoints.
- Never accept or log secret-bearing environment variables.
- Production mode must stop after confirming 402.
- Captured diagnostics must exclude raw request bodies beyond the fixed public test domain and exclude raw payment signatures.
- Public `payTo`, network, route, and price metadata are acceptable in reports because they are intentionally advertised by the service.

## Non-goals for version 1

- No autonomous LLM buyer.
- No marketplace registration.
- No transaction generation.
- No automatic price changes.
- No ranking optimization.
- No MCP server implementation.
- No scraping of competitor transaction statistics inside CI.
- No changes to settlement accounting or commerce telemetry.
- No Render deployment changes.

These can be evaluated later only if the deterministic harness shows that our own discovery contract is sound but real traffic remains absent.

## Success criteria

Version 1 is complete when:

1. A deterministic test can start from the five buyer-intent records and produce a passing acquisition report against the in-process service.
2. The harness verifies OpenAPI, `/llms.txt`, free preview, paid 402, and Bazaar metadata as one coherent funnel.
3. The paid route is never settled or retried with payment.
4. Intent coverage failures are independently diagnosable from payment-boundary failures.
5. The script emits a stable JSON report and nonzero exit status on required failures.
6. The focused CI gate and full profiler suite pass.
7. No secret, signer, wallet credential, or financial action is introduced.

## External compatibility rationale

Current AgentCash guidance states that OpenAPI at `/openapi.json` is the canonical discovery format, paid operations should publish input/output schemas plus `x-payment-info` and a 402 response, and runtime 402 behavior is also checked. It provides `@agentcash/discovery` `discover` and `check` commands for validation. Current x402scan guidance likewise resolves OpenAPI first and probes runtime 402 behavior. The x402 v2 specification defines Bazaar discovery as a separate catalog mechanism and supports filtering/querying discoverable resources. These external systems therefore fit as observational adapters around the deterministic core rather than as the core itself.

## Implementation sequencing

After this design is approved, create a detailed implementation plan with TDD checkpoints in `docs/superpowers/plans/2026-08-24-buyer-discovery-harness.md`. Implementation should proceed on the existing `feat/buyer-discovery-harness` stacked branch, with frequent commits and a draft PR targeted initially at `feat/agent-discovery-llms`. Once PR #38 is merged, rebase or retarget the harness PR onto `feat/hermes-commerce-control-plane` without force-pushing shared history.
