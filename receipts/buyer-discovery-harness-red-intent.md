# Buyer Discovery Harness TDD Evidence

## Task 1 — intent corpus and evaluator

- RED workflow: `Buyer Discovery TDD` run `32737388274`.
- Expected failure: `ERR_MODULE_NOT_FOUND` for `src/discovery/buyer-intents.mjs`; no evaluator production implementation existed yet.
- Intermediate diagnostic run: `32737747297` showed 11/12 required checks passing and isolated the remaining failure to Bazaar fixture validation.
- Root cause: `declareDiscoveryExtension()` returns `{ bazaar: extension }`; the test fixture had accidentally nested that wrapper under `extensions.bazaar`.
- GREEN workflow: run `32737934822`, conclusion `success`; all seven evaluator contracts passed.

## Task 2 — in-process pre-payment funnel

- RED workflow: run `32738020475`.
- Expected failure: `ERR_MODULE_NOT_FOUND` for `src/discovery/buyer-discovery-runner.mjs` while all Task 1 tests remained green.
- GREEN workflow: run `32738300848`, conclusion `success` after adding the runner.
- Verified funnel: OpenAPI -> `/llms.txt` -> free preview -> unpaid paid route -> HTTP 402 -> valid x402/Bazaar challenge.
- Settlement guard remained at zero calls.

## Task 3 — CLI

- RED workflow: run `32738372837`.
- Expected failure: CLI script did not exist; the two CLI contract tests failed on missing `scripts/buyer-discovery-check.mjs` while evaluator and funnel tests passed.
- GREEN workflow: run `32738555397`, conclusion `success` after adding the CLI, package script, and quiet in-process logging.

## Permanent gate

- `Counterparty Seller CI` run `32738746820`: `success` with syntax checks, focused seller tests, buyer-discovery CLI check, full profiler suite, and live OFAC/SEC/OSV/npm/PyPI source smokes.
- Temporary `Buyer Discovery TDD` workflow was then removed.
- Post-cleanup permanent-gate run `32738872857`: every substantive and cleanup step completed successfully, including focused tests, CLI check, full profiler suite, and all live source smokes.

## Financial boundary

No real payment was made. The harness does not create a signer, read wallet credentials, emit an outgoing payment header, retry the paid request after 402, or authorize settlement.
