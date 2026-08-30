# Current State

> **Canonical operational truth:** this document and `state/CURRENT.json` are the repository-level current-state sources. Historical receipts, plans, handoffs, `*-latest` snapshots, and `Unknown/Archived/` material are evidence, not authority, unless explicitly referenced here.

Last current-state reconciliation: **2026-08-30**.

This snapshot is intended to land with PR **#113**. Its source `main` baseline is `705199fb2a6d49fa7705113c9fb594cca4b67536`.

## Project mission

`agent-commerce-hub` is revenue-first. Standing policy: `docs/REVENUE_OPERATING_PRINCIPLES.md`.

Preferred loop:

`opportunity discovery → qualification → pricing → execution → quality gate → delivery → payment → follow-up/repeat business → revenue measurement`

Engineering should shorten that loop, prevent demonstrated revenue-threatening failures, or reduce routine operator babysitting. Generic hardening without a concrete commercial/autonomy benefit is deprioritized.

## Repository and production boundary

- Canonical/default branch: `main`.
- Production branch: `feat/hermes-commerce-control-plane`.
- Both are protected; required checks are `workflow-policy`, `seller`, and `commerce-control`.
- A merge to `main` is **not** a production deployment.
- Production changes require a fresh validated promotion plus explicit production authorization.

The latest production promotion remains PR **#95**, production commit `3c501ee37bd3472afe1736213cc493dc254911a8`. Render deployment `dep-da9fhedg1s2s73a930n0` remains recorded live from that baseline at `products/published/data-quality-profiler`, with `X402_FACILITATOR_MODE=xpay`.

## Published seller and revenue observation

Canonical seller: `products/published/data-quality-profiler/`.

The seller remains production-deployed with 13 paid x402 operations, a free company-domain preview, centralized pricing authority, public/private Docker boundary coverage, bounded upstream reads, SSRF controls, and successful unpaid HTTP `402` challenges. Latest recorded Agent402 observation listed 14 tools / 13 paid tools.

Canonical post-deploy evidence still records:

`payment_succeeded_observed_since_deploy: false`

No successful paid seller transaction has been established by repository evidence yet. Demand acquisition and executable opportunity conversion remain the main commercial bottleneck.

## Financial state

Tracked JSON ledgers are audit snapshots; transactional authority remains the local/gitignored SQLite database.

Mainnet snapshot remains `state/commerce-control/ledgers/mainnet-budget-ledger.json`, blob `9a9e87dce730cc3fddcbdcf8926b12d53c6046ab`, Base mainnet USDC, initial `2380000`, spent `10000`, remaining `2370000` atomic units.

Testnet snapshot remains `state/commerce-control/ledgers/testnet-budget-ledger.json`, blob `0632862d26c600634068b61669db8de11faa8dad`, Base Sepolia `eip155:84532`; successful signer writeback remains restricted to run-scoped `testnet-audit/run-<run_id>-<run_attempt>` branches.

Repository work must not initialize, replace, export, or reconcile the local transactional database incidentally.

## Commerce Control opportunity pipeline

Canonical package: `tools/hermes-commerce-control/`.

Implemented stages include:

- ingestion and deduplication;
- deterministic triage;
- local model evaluation and durable evaluation claiming;
- revenue-oriented ranking;
- execution routing;
- human fulfillment planning;
- recruitment drafting;
- frozen worker contract drafting;
- worker-facing recruitment payload rendering;
- recruitment external-action intent preparation;
- exact-intent scoped B1 human-recruitment authorization;
- provider-neutral recruitment execution boundary;
- **concrete GiveGigs OFFSITE_PAY marketplace transport**;
- **crash-conservative GiveGigs recruitment idempotency journal**;
- **public GiveGigs application/candidate ingestion through the shared safe-read boundary**;
- **candidate-specific frozen contract derivation that changes only worker identity**;
- candidate qualification / follow-up / rejection classification;
- assignment offer / acceptance / replacement state;
- accepted-assignment attempt submission and assessment;
- bounded correction request/response orchestration;
- external-blocker attribution without automatic worker fault;
- explicit replacement authorization from supported terminal conditions;
- private worker-performance / future-eligibility records;
- append-only human-fulfillment lifecycle persistence;
- final human attempt/compensation review;
- verification planning/resolution;
- pursuit dossiers and operator packets;
- Reddit RSS opportunity ingestion.

Marketplace/service discovery adapters remain Agent402, the402, Agent Bounties, BountyBook, CDP Bazaar, PaySH, and Piprail. GiveGigs is now a concrete human-recruitment execution and application-ingestion path, not a duplicate opportunity engine.

## Execution routing

Canonical implementation: `tools/hermes-commerce-control/src/opportunities/execution-routing.ts`.

Offline command:

```bash
npm run opportunities:route-execution -- --json
```

The router emits `agent_direct`, `human_fulfillment`, `hybrid`, `manual_review`, `watch`, or `reject`. Existing ranking gates remain authoritative and route/capability contradictions fail to manual review.

## Human recruitment and fulfillment contract

Frozen contract core: `tools/hermes-commerce-control/src/opportunities/human-fulfillment.ts`.

Detailed contract: `docs/human-fulfillment-contract.md`.

The contract freezes worker scope, acceptance criteria, evidence requirements, worker reference, deadline, full compensation, and positive pre-agreed good-faith-attempt compensation. Unknown upstream payout or a zero/negative gross margin floor blocks worker-facing economic readiness. Suspicion alone cannot automatically deny compensation.

Final reviewed outcomes remain:

- `accepted` → full compensation due;
- `good_faith_failed` → pre-agreed partial compensation due;
- `no_meaningful_effort` → zero after review;
- `established_fraud` → zero after review;
- `suspicious` → manual review with no automatic denial.

No worker payment execution is enabled.

## Worker-facing recruitment adapters

Canonical renderer: `tools/hermes-commerce-control/src/opportunities/human-recruitment-adapters.ts`.

Documentation: `docs/human-recruitment-adapters.md`.

Preparation exists for Reddit-style public posts, generic marketplace listings, direct/private outreach, and custom/other recruitment surfaces. Rendered payloads are built only from frozen worker terms and exclude upstream payout, internal margin, source listing text/title, evaluator/model reasoning, ranking/risk labels, and internal worker references.

A payload cannot be produced while economic readiness is blocked. Direct recruitment is private-message only. The target records when platform/community rules were verified.

The generic recruitment executor now passes only the already-frozen public `workerTerms` to a concrete transport in addition to title/body/target. This lets a provider map exact compensation and work kind without exposing internal economics.

## Scoped B1 recruitment activation

Canonical config/policy boundary:

- `tools/hermes-commerce-control/src/config.ts`
- `tools/hermes-commerce-control/src/policy/engine.ts`
- `tools/hermes-commerce-control/src/opportunities/human-recruitment-intent.ts`

Execution boundary: `tools/hermes-commerce-control/src/opportunities/human-recruitment-executor.ts`.

Detailed activation contract: `docs/human-recruitment-b1-activation.md`.

General external writes remain disabled. The only B1 authorization implemented is one exact prepared human-recruitment intent, activated by the non-secret pair:

- `HUMAN_RECRUITMENT_B1_ENABLED=true`
- `HUMAN_RECRUITMENT_B1_APPROVED_INTENT_ID=hintent_<32 hex>`

Activation without an exact intent id fails closed. A stale id with activation disabled also fails closed. `EXTERNAL_WRITES_ENABLED` remains forbidden.

Recruitment intent ids are derived from immutable action facts rather than policy outcome. Intended flow:

`prepare blocked intent → inspect exact intent id → explicitly approve that id → re-evaluate same intent → execute through channel transport`

A different recruitment intent remains blocked with `EXTERNAL_WRITE_NOT_AUTHORIZED`; unrelated external writes remain blocked with `EXTERNAL_WRITE_DISABLED`. Signer/key access and all value movement are evaluated before the scoped recruitment grant and remain blocked.

The provider-neutral executor re-evaluates central policy at execution time, requires target/community rules verification no older than seven days, and passes the intent id to the transport as an idempotency key. A successful receipt records `externalMutationExecuted: true`, while compensation and live value movement remain false.

## GiveGigs concrete recruitment transport

Canonical module: `tools/hermes-commerce-control/src/opportunities/givegigs-recruitment-transport.ts`.

Documentation: `docs/givegigs-recruitment-transport.md`.

The transport targets the documented GiveGigs `POST /api/ai/tasks` endpoint using `OFFSITE_PAY`. GiveGigs' public API contract was re-checked on 2026-08-30: write endpoints require an API key, `OFFSITE_PAY` is live, and funded/crypto-staked tasks remain a separate future mode. This transport does not fund a task or move value.

GiveGigs-specific worker-visible settings are normalized and hashed into the generic target `givegigs:offsite-pay:<32 hex>`. The binding covers contact instructions, off-site payment-method text, optional client/skills/urgency/expiry settings, and remote/local location fields. Changing any bound setting changes the target and therefore requires a new exact B1 intent approval.

Physical contracts require a `LOCAL` configuration with valid latitude, longitude, and country. Remote contracts require `REMOTE`. Provider constraints are checked before the remote call.

The raw GiveGigs API key is supplied lazily by an injected secret provider. It is not stored in `CommerceConfig`, payloads, intents, target hashes, request hashes, idempotency records, receipts, or lifecycle state. The credential-bearing endpoint is fixed to `https://givegigs.com/api/ai/tasks`, preventing untrusted listing/provider text from redirecting the key.

`JsonlGiveGigsIdempotencyStore` persists a claim before the POST. Completed intents replay the stored task URL without another network call. Ambiguous network/5xx/malformed-success outcomes remain pending and block automatic retry, forcing reconciliation instead of risking duplicate worker listings. Provider responses that definitively establish no task creation can release the claim for a corrected retry. Corrupt complete journal records fail closed.

No real GiveGigs API key has been used and no live GiveGigs task has been created by repository validation. A live post still requires fresh platform-rule verification plus explicit activation of the exact prepared `hintent_...`.

## GiveGigs application ingestion

Canonical module: `tools/hermes-commerce-control/src/opportunities/givegigs-application-ingestion.ts`.

Documentation: `docs/givegigs-application-ingestion.md`.

GiveGigs' public API contract was re-checked on 2026-08-30: `GET /api/ai/tasks/:taskId` is documented as a no-auth task-detail endpoint that includes applications, while write operations remain API-key authenticated.

The reader accepts only validated public GiveGigs task references in the `https://givegigs.com/ai/gigs/tasks/<taskId>` namespace and derives the API endpoint locally. Reads run through the repository's shared no-credential `SafeFetch` boundary. Provider-supplied URLs, applicant text, and application metadata cannot change the destination or attach credentials.

Applications are normalized into deterministic provider/candidate references. Malformed individual rows are skipped, but a non-empty response that yields no usable worker identity fails closed rather than silently pretending there are no candidates. Provider task identity is checked when supplied.

A normalized application does **not** qualify or hire the worker. `bindGiveGigsApplicationToContract(...)` creates a new candidate-specific frozen contract whose only changed worker term is `workerReference`; scope, acceptance criteria, evidence requirements, both compensation amounts, deadline, economics, compensation policy, and payment boundary remain unchanged. A financially blocked template cannot be candidate-bound.

The resulting contract flows directly into the existing candidate qualification module. The candidate lifecycle helper records only durable provider/candidate linkage and a bounded provider-status note; raw applicant messages are intentionally omitted from lifecycle state.

No authenticated GiveGigs application acceptance/hire write is implemented by this slice.

## Candidate qualification and assignment

Canonical module: `tools/hermes-commerce-control/src/opportunities/human-candidate-assignment.ts`.

Documentation: `docs/human-candidate-assignment.md`.

Candidate qualification is explicit rather than a generic score. Requirements can cover capability, equipment, legitimate credential, location, schedule, or another task-specific condition. Each requirement is either self-attested or requires an evidence reference.

Physical work must include an explicit location requirement. Standard checks require the candidate to confirm the deadline, correction/follow-up availability, communication expectations, and compensation terms.

Qualification outcomes are:

- `qualified` — all hard requirements and required qualification evidence pass;
- `needs_followup` — an answer/evidence item is missing but no hard failure has been established;
- `not_qualified` — the candidate explicitly cannot satisfy a hard task or execution condition.

`needs_followup` deliberately preserves a correction/questionnaire loop instead of treating incomplete answers as worker failure.

Only a fully qualified candidate on the same financially viable contract/opportunity can receive an assignment. An assignment starts `offered`; its `acceptBy` must precede the task deadline to preserve replacement time. `accepted` is the only assignment decision that permits execution to begin. `declined`, `withdrawn`, and `expired` leave execution disabled and allow replacement. A replacement may explicitly reference the prior assignment id.

Assignment/qualification records never execute payment.

## Attempt, correction, blocker, and replacement orchestration

Canonical module: `tools/hermes-commerce-control/src/opportunities/human-attempt-orchestration.ts`.

Documentation: `docs/human-attempt-correction-orchestration.md`.

A worker attempt can be recorded only against the same accepted assignment, contract, opportunity, and candidate. Attempts carry bounded evidence, an explicit attempt number, submission time, and a late flag relative to the frozen task deadline.

Attempt assessment outcomes are:

- `accepted` — recommends the existing final `accepted` review path;
- `correction_required` — requires concrete deficiencies and can produce a bounded correction request;
- `worker_failed` — may justify replacement consideration but does not decide compensation;
- `manual_review` — stays on the existing suspicious/manual-review path without automatic worker fault or no-pay;
- `external_blocker` — attributes a blocker to operator/upstream/site/other-external conditions instead of worker fault.

Corrections are bounded by a pre-set maximum cycle count and a deadline that cannot exceed the original frozen task deadline. Each correction request records a hash of the original task brief, acceptance criteria, evidence requirements, both compensation amounts, and deadline. New scope and compensation changes are explicitly disallowed.

Correction responses require a fresh assessment; they do not self-certify acceptance.

External blockers cannot themselves create a worker performance penalty. When a good-faith attempt is documented they recommend the existing `good_faith_failed` final review path; otherwise the case remains manual/suspicious rather than inventing worker fault.

Replacement authorization is supported only for an assignment declined/withdrawn/expired, worker cannot continue, an actually expired correction deadline, actually exhausted correction cycles, or a final review that explicitly established `no_meaningful_effort`. Replacement does not change the previous worker's compensation outcome.

## Private worker performance history

Final QA can be converted into a private performance record containing correction counts, communication quality, timeliness, and a bounded note.

Future eligibility is intentionally nuanced:

- clean accepted work → `eligible`;
- good-faith failure or accepted work with material execution friction → `case_by_case`;
- unresolved suspicious evidence → `hold_for_manual_review`;
- review-established no meaningful effort or fraud → `do_not_reoffer`.

Suspicion does not become an automatic fraud finding or permanent ban.

## Persistent human-fulfillment lifecycle

Canonical store: `tools/hermes-commerce-control/src/opportunities/human-fulfillment-lifecycle.ts`.

The append-only lifecycle supports recruitment payloads/intents/execution, candidate observations, candidate qualification, contracts, assignments, assignment decisions, worker acceptance, attempt submission/assessment, correction request/response, external blockers, replacement authorization, final review, and private worker performance. Events can carry their deterministic record ids without creating a second execution store.

Events remain schema-validated, deterministic, deduplicated by event id, file-locked, filterable by opportunity, and crash-tail-repaired.

The GiveGigs transport has a separate narrow local idempotency journal because it must claim an outbound request before the provider call; that journal prevents duplicate provider writes and does not replace the human-fulfillment lifecycle.

## Private C-Shop worker

Canonical adapter remains `tools/cshop-worker-adapter/`, pinned to `stubbb/c-shop@f3b2033c07df92e8e72ff83a29955a2c10494d95`.

It remains private/local, loopback by default, remote only with explicit opt-in and bearer token, uses explicit MCP session IDs, rejects arbitrary raw scripts, excludes named styles, and constrains workspace filenames. Existing real build/workspace/MCP validation and required regression coverage remain authoritative. Do not reopen without new failure evidence.

## Product Listing Graphic

Draft: `products/drafts/product-listing-graphic/`, version **0.2.0**.

Graphics validation remains **PASS** with receipt `receipts/visual-acceptance/product-listing-graphic/2026-08-30-split-layout-v02/acceptance.json`.

The product remains commercially unfinished: pricing unset, payment integration not configured, customer intake/output delivery not defined, first-sale distribution path not selected, no complete commercial dry run, unpublished, and undeployed.

## Open PR state

The deliberately deferred provider PR remains **#8 — `feat: add the402 provider adapter`**, pending provider credentials/secret custody and explicit production authorization if revived.

PR **#113** is the GiveGigs application-ingestion/candidate-binding change represented by this snapshot. It targets `main` only and is not a production deployment.

## Strategic frontier

The internal human path now reaches:

`qualified upstream opportunity → frozen worker terms → exact GiveGigs-bound recruitment payload → exact B1 approval → concrete OFFSITE_PAY task POST → public application read → candidate-specific frozen contract → qualification → assignment/acceptance → attempt/correction/blocker/replacement handling → final review → private performance history`

The first concrete marketplace path now covers both outbound recruitment and inbound application discovery without conflating marketplace application status with qualification or hiring. The remaining blocker is real demand + real worker execution, not another generic candidate layer.

Priority after this slice:

1. **real worker/counterparty validation** — once there is a verified upstream opportunity and valid secret custody, explicitly approve one exact B1 GiveGigs recruitment intent, observe real applications through the safe-read bridge, bind/qualify one candidate, and exercise assignment/attempt handling;
2. **buyer/upstream demand validation** — record actual conversion and payout evidence;
3. **provider-side GiveGigs application acceptance/hire write** — implement only when a real validated case requires the marketplace mutation, with its own exact scoped authorization rather than general external writes;
4. **B2 worker-payment path** — only when an accepted real worker transaction requires value movement, with separate explicit financial authorization;
5. **commercialize Product Listing Graphic** where it competes favorably with upstream-demand work.

Do not create a second opportunity engine or duplicate recruitment economics/compensation rules per provider.

## Rules for future agents

1. Read `state/CURRENT.json` and this document before older state, plans, receipts, or `*-latest` files.
2. A merge to `main` is not a production deployment.
3. Preserve the separate protected production branch; production mutation requires explicit authorization.
4. Do not reopen completed reliability work without new failure evidence.
5. Prefer coherent implementation followed by the relevant full gate; fix concrete failures rather than repeatedly re-planning settled architecture.
6. Worker-facing adapters must consume frozen contract artifacts and must not leak upstream payout/internal margin/model scoring by default.
7. Never enable general external writes to recruit a worker. B1 recruitment authorization must bind to one exact prepared `hintent_...` id.
8. GiveGigs worker-visible contact/payment/location configuration must remain bound into the `givegigs:offsite-pay:<hash>` target; changing it requires a fresh recruitment payload/intent and approval.
9. Never persist or commit a raw GiveGigs API key. The credential may exist only in secret custody and the fixed provider request path.
10. An ambiguous GiveGigs POST outcome must remain pending until remote reconciliation; do not automatically retry and risk a duplicate listing.
11. GiveGigs application reads must remain no-auth `SafeFetch` reads derived from a validated GiveGigs task reference; do not accept provider-controlled read destinations or credential headers.
12. A GiveGigs application is not qualification or hiring. Bind only the concrete worker identity into a candidate-specific frozen contract; do not change scope, evidence, compensation, deadline, or economics during binding.
13. Raw applicant messages are untrusted and must not be promoted into qualification evidence or persisted to lifecycle state by default.
14. An incomplete candidate questionnaire is `needs_followup`; do not silently convert missing information into a hard rejection.
15. Only `qualified` + accepted assignments may begin worker execution.
16. Physical qualification must explicitly confirm location feasibility.
17. Corrections must address frozen deficiencies only; do not add scope or change compensation after execution begins.
18. Replacement does not retroactively decide the previous worker's compensation outcome.
19. Operator/upstream/site blockers must not be converted into worker fault or a worker-performance penalty.
20. Worker payment/value movement remains a separate B2 concern.
21. Good-faith partial compensation must be fixed before execution, not invented retroactively.
22. Suspicion alone must not automatically become a zero-compensation/fraud outcome or permanent worker ban.
23. Seller pricing changes must use the canonical price catalog and pass consistency coverage.
24. Public seller Docker changes must preserve the private buyer/financial/operator boundary.
25. GitHub expressions must not appear directly inside workflow `run:` commands; use `env:` and quoted shell variables.
26. Testnet signer audit snapshots must write only to run-scoped audit branches and must not force-push.
27. Never commit secrets, private paid results, local SQLite/WAL/SHM files, or generated `node_modules`.
28. `Unknown/Archived/` is historical evidence only.