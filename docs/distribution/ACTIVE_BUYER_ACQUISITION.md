# Active Buyer Acquisition

Status: active distribution experiment

## Decision

Passive registration is no longer the sales strategy. Registries, OpenAPI, llms.txt, Agent402/x402 manifests, and search indexes remain infrastructure, but revenue experiments now target identifiable agents that already have an x402/USDC payment path and a workflow Hermes can improve.

Do not respond to zero sales by lowering every price or adding more unrelated products. First measure qualified buyer exposure and direct integration attempts.

## Primary wedge

Lead with developer verification and deterministic data-quality utilities:

- dependency vulnerability check
- package maintenance snapshot
- schema drift
- data-contract check
- duplicate audit
- clean/normalize
- repair plan

Reason: several agent ecosystems already route generic web/company enrichment to preferred providers. The verification routes have cleaner workflow fit for coding, code-review, autonomous-work, CI, and data-processing agents.

Company/domain, SEC, OFAC, and counterparty utilities remain available for workflows that specifically need them; they are not the default outbound pitch.

## Qualification gate

A prospect is qualified only when at least three are true:

1. It has a real x402 payer/client path or a funded AgentCash/Bankr-style wallet integration.
2. It autonomously performs work where verification/research improves the deliverable.
3. Its repository/product is maintained or has active user/integration discussion.
4. There is a concrete low-friction insertion point (skill, catalog, allowlist, tool registry, plugin, or documented x402 client).
5. A Hermes call can replace manual work or reduce hallucination risk in a repeatable task.

Reject projects that merely sell x402 services but do not buy external services.

## First target: CashClaw

Repository: `moltlaunch/cashclaw`

Why it qualifies:

- autonomous paid-work agent
- optional AgentCash wallet/tool integration
- default specialties include code review, TypeScript, and React
- system prompt already injects a paid API catalog
- tool shells out to AgentCash for paid calls
- maintainers already receive integration/vendor proposals through GitHub issues

Current integration blocker:

CashClaw's `agentcash_fetch` tool hard-allowlists a fixed set of provider hostnames. Hermes cannot be called until `hermes-counterparty-api.onrender.com` is added to that allowlist and useful Hermes routes are added to the prompt catalog.

Proposed minimal integration:

1. Add `hermes-counterparty-api.onrender.com` to the AgentCash hostname allowlist.
2. Add the seven verification operations from `skills/hermes-verification/SKILL.md` to the AgentCash catalog.
3. Use them only when task context calls for dependency/package/data verification.
4. Preserve CashClaw's existing wallet controls; no new key handling is required.

Suggested buyer-facing value proposition:

> Add low-cost pre-submit verification to CashClaw jobs: exact-version OSV vulnerability checks, npm/PyPI maintenance status, and deterministic JSON/CSV contract/schema/duplicate/repair checks. They use CashClaw's existing AgentCash/x402 payment path; no new account, API key, or subscription.

## Secondary target class: direct @x402/fetch agents

Prioritize maintained agents that already instantiate an x402 EVM client on Base and pay external APIs. Their integration surface is smaller than AgentCash: they can call the Hermes origin directly after a 402 challenge.

Target workflows:

- dependency or package review before code delivery
- due-diligence substeps before an agent commits to a counterparty/action
- structured data validation before producing a report or upload
- deterministic audit checks where an LLM alone is a poor verifier

## Search-only acquisition probe

`.github/workflows/active-buyer-search.yml` executes only no-spend discovery commands against six buyer-intent queries.

Allowed:

- `agentcash search`
- `bankr x402 search`

Forbidden in this workflow:

- `agentcash fetch`
- `agentcash try`
- `bankr x402 call`
- signing, wallet secrets, transactions, or funding

The probe exists to answer whether Hermes appears organically for the verification intents we intend to sell. Search visibility and direct outreach are separate channels; a search miss does not block direct integration outreach.

## Metrics

Track the funnel separately:

- qualified prospects identified
- direct integration/outreach attempts
- prospects that inspect/discover the origin
- unpaid paid-route requests returning 402
- payment attempts
- successful settlements
- repeat paid callers

Do not count self-generated calls as buyer demand.

## Next actions

1. Read the search-only workflow output and record whether Hermes surfaces for each intent.
2. Send one targeted CashClaw integration proposal referencing the ready Hermes verification skill and exact minimal patch.
3. Identify 3-5 additional payer-capable work/coding/data agents and adapt the pitch to each workflow.
4. Re-check production telemetry after real distribution attempts.
5. Only then decide whether search metadata, integration packaging, endpoint design, or pricing is the next bottleneck.
