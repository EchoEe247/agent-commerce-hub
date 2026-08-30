# Current State

> **Canonical operational truth:** this document and `state/CURRENT.json` are the repository-level current-state sources. Historical receipts, plans, handoffs, `*-latest` snapshots, and `Unknown/Archived/` material are evidence, not authority, unless explicitly referenced here.

Last current-state reconciliation: **2026-08-30**.

This snapshot is intended to land with PR **#115**. Its source `main` baseline is `f5f8db15da57959bf8d53d06d834f09321398950`, the merge of PR #114.

## Mission and revenue state

`agent-commerce-hub` is revenue-first. Standing policy: `docs/REVENUE_OPERATING_PRINCIPLES.md`.

Preferred loop:

`opportunity discovery → qualification → pricing → execution → quality gate → delivery → payment → follow-up/repeat business → revenue measurement`

Engineering should shorten that loop, prevent demonstrated revenue-threatening failures, or reduce routine operator babysitting. Generic hardening without a concrete commercial/autonomy benefit is deprioritized.

Canonical seller: `products/published/data-quality-profiler/`.

The seller remains production-deployed with 13 paid x402 operations plus a free company-domain preview, but canonical post-deploy evidence still records:

`payment_succeeded_observed_since_deploy: false`

No successful paid seller transaction has been established by repository evidence yet. Real demand, executable opportunity conversion, and actual settlement remain the commercial bottleneck.

## Repository and production boundary

- Canonical/default branch: `main`.
- Production branch: `feat/hermes-commerce-control-plane`.
- Both are protected; required checks are `workflow-policy`, `seller`, and `commerce-control`.
- A merge to `main` is **not** a production deployment.
- Production changes require a fresh validated promotion plus explicit production authorization.

The latest production promotion remains PR **#95**, production commit `3c501ee37bd3472afe1736213cc493dc254911a8`, Render deploy `dep-da9fhedg1s2s73a930n0`, `products/published/data-quality-profiler`, `X402_FACILITATOR_MODE=xpay`.

PR **#114** merged to `main` at `f5f8db15da57959bf8d53d06d834f09321398950`. Its post-merge `workflow-policy`, `seller`, and `commerce-control` gates passed. It did not deploy production.

## Financial state

Tracked JSON ledgers are audit snapshots; transactional authority remains the local/gitignored SQLite database.

Mainnet snapshot: `state/commerce-control/ledgers/mainnet-budget-ledger.json`, Base mainnet USDC, initial `2380000`, spent `10000`, remaining `2370000` atomic units.

Testnet snapshot: `state/commerce-control/ledgers/testnet-budget-ledger.json`, Base Sepolia `eip155:84532`; successful signer writeback remains restricted to run-scoped `testnet-audit/run-<run_id>-<run_attempt>` branches.

Repository work must not initialize, replace, export, or reconcile the local transactional database incidentally.

## Commerce Control

Canonical package: `tools/hermes-commerce-control/`.

Current implemented revenue path includes ingestion/dedupe, deterministic triage, durable model evaluation, revenue ranking, execution routing, verification planning/resolution, pursuit dossiers/operator packets, Agent402/the402/Agent Bounties/BountyBook/CDP Bazaar/PaySH/Piprail discovery, Reddit RSS opportunity ingestion, and the human-fulfillment stack described below.

Agent Bounties discovery now uses the unified canonical Base ready-to-earn projection and includes Open Competition V2 rather than relying on the older autonomous-bounty-only inventory.

## Agent Bounties unified ready-to-earn discovery

Canonical modules:

- `tools/hermes-commerce-control/src/adapters/agent-bounties/index.ts`
- `tools/hermes-commerce-control/src/adapters/agent-bounties/unified.ts`

Current read path:

`GET /v1/opportunities?limit=<bounded>&network=base-mainnet&source_type=canonical_base&view=ready_to_earn`

The 2026-08-30 projection reported 75 canonical Base items. Normalization preserves exact atomic-USDC conversion and carries goal, public URL, work/payment state, verifier profile/readiness, deadline, competition mode, required external spend, provider-advertised gross cash margin, scoring phase/window, qualifying-action objective, and safe-next-action instructions.

Funding evidence remains conservative: `payment_state=escrowed` maps to funded with **observed**, not verified, evidence. Canonical settlement remains authoritative. Autonomous bounties use `BountySettled` for payment proof; Open Competition V2 uses `CompetitionSettledV2`.

Competition actionability is phase-aware. `scoring` can be preparation-eligible; `upcoming` and proof phases stay visible but non-actionable. Discovery never enables live claim, funding, submission, proof purchase, signing, or value movement.

## Forward-GMV opportunity dossier

Canonical dossier:

`docs/opportunity-dossiers/agent-bounties-forward-gmv-2026-08-30.md`

Three overlapping actively scoring Forward-GMV competitions were observed:

| Window | Contract | Prize | Configured proof/relay spend | Snapshot entries |
| --- | --- | ---: | ---: | ---: |
| Aug 24 → Aug 31 | `0x2f1d2b24105596b153e473032256569fe544a44f` | 3.00 USDC | 0.11 USDC | 0 |
| Aug 24 → Sep 7 | `0x6f635dfd07085aa48ec8b11767eeb48936969f5c` | 3.00 USDC | 0.11 USDC | 0 |
| Aug 24 → Sep 21 | `0x8c990ddf5360c00ee0b2090000e3a3a6f90a6a9d` | 3.00 USDC | 0.11 USDC | 0 |

The upstream qualifying action is materially relevant to human/counterparty fulfillment: useful marketplace demand must be funded by the competition entrant and canonically completed by a **different eligible wallet**. The independent participant is therefore part of the upstream acceptance condition rather than generic outsourced labor.

Official metric source establishes:

`attributed_gmv = settlement_gmv × entrant_canonical_funding / total_canonical_funding`

It excludes operator/reserve-created demand, excluded reward contracts, creator-as-solver, entrant-as-solver, zero entrant funding, and noncanonical/out-of-window settlements.

### Overlapping eligibility conclusion

Source-level inspection supports **eligibility stacking** for one qualifying canonical child settlement across overlapping Forward-GMV competitions:

- each competition freezes its own epoch/window and creates its own attested snapshot;
- a canonical settlement is accepted into a snapshot only when it falls inside that campaign's window and other exclusions;
- strict settlement ordering prevents duplicate copies inside one snapshot;
- the metric contains no global consumed-settlement registry;
- `OpenCompetitionBountyV2Beta3` is isolated per competition and binds the proof journal to that competition address/bounty id; replay state is local solver-nonce state, not cross-competition settlement consumption.

Therefore a qualifying child settled during the shared Aug-24-to-Aug-31 overlap can be independently eligible in the weekly, fortnight, and monthly snapshots at the inspected source revision.

This is **not** a guarantee of three payouts. Each is a separate `best_score` competition and each requires its own valid proof/qualification and winning score. Live rules and evidence must be re-fetched before action.

### Cash model

For child irreversible cost `C`, per-competition provider proof/relay spend `0.11`, other costs `O`, and `k` competitions actually won:

`profit(k) = 3.00k - C - 0.11k - O = 2.89k - C - O`

Illustrative only: if a valid useful child could be created and canonically settled for exactly 1.00 USDC all-in and won all three observed competitions, the simplified result would be `7.67 USDC` before `O`. The live hosted surface has **not** been proven to support a 1.00-USDC all-in child, and competition losses can make the transaction negative.

The base autonomous bounty contract requires positive solver and verifier rewards, `solver != creator`, and a solver claim bond equal to the verifier reward. It does not itself impose a dollar-denominated minimum beyond positive atomic amounts; current hosted tooling/policy minimums still require a fresh check.

Current dossier decision: **prepare, do not execute**.

## Human fulfillment

Frozen contract core: `tools/hermes-commerce-control/src/opportunities/human-fulfillment.ts`.

The worker contract freezes scope, acceptance criteria, evidence requirements, worker reference, deadline, full compensation, and positive pre-agreed good-faith-attempt compensation. Unknown upstream payout or a zero/negative gross-margin floor blocks worker-facing economic readiness.

Final review outcomes remain:

- `accepted` → full compensation;
- `good_faith_failed` → pre-agreed partial compensation;
- `no_meaningful_effort` → zero after review;
- `established_fraud` → zero after review;
- `suspicious` → manual review, no automatic denial.

No worker payment execution is enabled.

### GiveGigs concrete path

Current modules:

- `human-recruitment-adapters.ts` — frozen worker-facing payloads;
- `human-recruitment-intent.ts` — exact B1 intent;
- `human-recruitment-executor.ts` — provider-neutral execution boundary;
- `givegigs-recruitment-transport.ts` — concrete `OFFSITE_PAY` POST transport;
- `givegigs-application-ingestion.ts` — public no-auth application read + candidate binding;
- `human-candidate-assignment.ts` — qualification/assignment;
- `human-attempt-orchestration.ts` — attempts/corrections/blockers/replacement;
- `human-fulfillment-lifecycle.ts` — append-only lifecycle.

General external writes remain disabled. GiveGigs recruitment can be activated only for one exact prepared `hintent_<32 hex>` with `HUMAN_RECRUITMENT_B1_ENABLED=true` and the matching approved intent id. The API key remains lazily sourced from secret custody and never belongs in config, payloads, hashes, journals, receipts, or lifecycle state.

GiveGigs application reads are public no-auth safe reads. An application does not qualify or hire a worker. Candidate binding changes only the worker identity on the already-frozen contract; task scope, evidence, compensation, deadline, economics, and policy remain unchanged.

Only `qualified` + accepted assignments may begin execution. Corrections cannot add scope or change compensation. External blockers do not become worker fault. Replacement never retroactively decides the prior worker's compensation.

## Product Listing Graphic

Draft: `products/drafts/product-listing-graphic/`, version **0.2.0**. Graphics validation remains PASS. The product remains commercially unfinished: pricing, payment, intake/output delivery, first-sale distribution, complete dry run, publication, and deployment are not complete.

## Open PR state

The deliberately deferred provider PR remains **#8 — `feat: add the402 provider adapter`**, pending provider credentials/secret custody and explicit production authorization if revived.

PR **#115 — `Add Agent Bounties Forward-GMV opportunity dossier`** is the current non-production research/state reconciliation change.

## Strategic frontier

The internal human path reaches:

`qualified upstream opportunity → frozen worker terms → exact GiveGigs-bound recruitment payload → exact B1 approval → OFFSITE_PAY task POST → public application read → candidate-specific frozen contract → qualification → assignment/acceptance → attempt/correction/blocker/replacement → final review → private performance history`

The Forward-GMV research now adds a concrete commercial reason to invoke that path: an upstream competition requires another eligible wallet to complete the child demand, and one qualifying child may be eligible across multiple overlapping prize windows.

The remaining blocker is **transaction-specific economics and execution feasibility**, not generic architecture.

Priority after this slice:

1. re-fetch the three Forward-GMV competitions immediately before any decision and confirm phase/window/current competition evidence;
2. choose one genuinely useful child deliverable and establish its exact canonical protocol, solver reward, verifier reward, bond, total funding target, tooling minimum, and settlement deadline;
3. establish one real independent solver/counterparty and their wallet/eligibility/compensation requirements without recruiting them yet;
4. quote each required proof/relay path and compute maximum downside plus risk-adjusted economics for weekly/fortnight/monthly separately and jointly;
5. prepare the exact chain/asset/amount/destination/calldata or intent bundle, then stop for explicit operator authorization before the first wallet signature, funding, claim, proof purchase, or value movement.

Do not build another opportunity engine or more generic recruitment infrastructure before those live facts are resolved.

## Rules for future agents

1. Read `state/CURRENT.json` and this document before historical material.
2. A merge to `main` is not a production deployment.
3. Production mutation requires a fresh promotion and explicit authorization.
4. Prefer complete coherent implementation followed by the relevant full gate; fix concrete failures rather than re-planning settled architecture.
5. Do not reopen completed reliability work without new failure evidence.
6. Agent Bounties current discovery uses unified canonical `ready_to_earn`; legacy autonomous inventory is compatibility only.
7. Open Competition V2 is preparation-eligible only in advertised scoring phase.
8. Provider-advertised gross margin is not guaranteed profit. Include child funding, worker/counterparty cost, verifier/bond mechanics, proof/relay spend, gas, failure probability, deadline risk, and competition losing risk.
9. One settlement's source-level eligibility across overlapping competitions is not proof of multiple prizes; re-fetch each contract/policy before action.
10. A funded opportunity never authorizes wallet signatures, claims, funding, proof purchases, or submissions by itself.
11. Use a human/counterparty only where the upstream task or execution genuinely requires an independent participant/capability; do not outsource work that can be kept internally merely because a marketplace exists.
12. Worker-facing adapters consume frozen contract artifacts and must not leak upstream payout/internal margin/model scoring by default.
13. Never enable general external writes for recruitment; B1 binds to one exact prepared `hintent_...`.
14. GiveGigs contact/payment/location settings remain bound into the target; changes require a fresh intent approval.
15. Never persist or commit the GiveGigs API key.
16. Ambiguous GiveGigs POST outcomes remain pending until reconciliation; do not auto-retry.
17. GiveGigs application reads remain no-auth `SafeFetch` reads derived from validated task references.
18. A GiveGigs application is not qualification or hiring; raw applicant text is untrusted and is not lifecycle evidence by default.
19. Incomplete candidate questionnaires are `needs_followup`, not automatic rejection.
20. Only qualified + accepted assignments may begin worker execution.
21. Corrections address frozen deficiencies only; no new scope or compensation changes.
22. Operator/upstream/site blockers do not become worker fault.
23. Worker payment/value movement remains a separate B2 concern.
24. Good-faith partial compensation is fixed before execution.
25. Suspicion alone never becomes automatic no-pay/fraud/permanent ban.
26. Seller pricing changes use the canonical catalog and consistency coverage.
27. Public seller Docker changes preserve the private buyer/financial/operator boundary.
28. GitHub expressions must not appear directly inside workflow `run:` commands.
29. Testnet signer audit snapshots write only to run-scoped branches and never force-push.
30. Never commit secrets, private paid results, local SQLite/WAL/SHM files, or generated `node_modules`.
31. `Unknown/Archived/` is historical evidence only.