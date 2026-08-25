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

## Discovery cold-start finding

AgentCash-backed x402scan discovery currently requests catalog search with `broad=false`. Its source comments state that broad mode includes resources without usage signals, while the normal restricted mode cuts those resources from results. This creates a plausible cold-start problem for a new origin with zero usage: lack of prior usage can reduce organic discovery, which in turn makes acquiring the first usage harder.

Operational implication: direct integration, curated-skill placement, and first-buyer activation are acquisition channels in their own right. Do not wait for semantic marketplace search alone to create the first transaction.

## Outreach experiment 1: CashClaw

Repository: `moltlaunch/cashclaw`

Why it qualifies:

- autonomous paid-work agent
- optional AgentCash wallet/tool integration
- default specialties include code review, TypeScript, and React
- system prompt already injects a paid API catalog
- tool shells out to AgentCash for paid calls

Current integration blocker:

CashClaw's `agentcash_fetch` tool hard-allowlists a fixed set of provider hostnames. Hermes cannot be called until `hermes-counterparty-api.onrender.com` is added to that allowlist and useful Hermes routes are added to the prompt catalog.

Proposed minimal integration:

1. Add `hermes-counterparty-api.onrender.com` to the AgentCash hostname allowlist.
2. Add the seven verification operations from `skills/hermes-verification/SKILL.md` to the AgentCash catalog.
3. Use them only when task context calls for dependency/package/data verification.
4. Preserve CashClaw's existing wallet controls; no new key handling is required.

Outbound status:

- targeted maintainer email sent 2026-08-25
- subject: `CashClaw AgentCash: add Hermes verification APIs?`
- GitHub issue route was attempted first but connector permissions rejected the external write; no issue was posted
- hypothesis: a small allowlist + catalog patch unlocks Hermes for code/data work without changing CashClaw payment infrastructure

## Outreach experiment 2: Wes Sander agent projects

Repositories:

- `ucsandman/budget-aware-research-agent`
- `ucsandman/TreasuryClaw`

Why they qualify:

- maintained in August 2026
- use AgentCash for paid external API calls
- their wrappers accept an arbitrary endpoint URL instead of a fixed provider-only allowlist
- TreasuryClaw has an upstream approval/max-spend model before non-interactive AgentCash execution

Outbound status:

- targeted maintainer email sent 2026-08-25
- subject: `AgentCash/x402 utility for your research + OpenClaw agents`
- hypothesis: Hermes verification calls can be adopted without new payment plumbing and can sit behind the project's existing spend-control layer

## Outreach experiment 3: Remlo

Repository: `winsznx/remlo`

Why it qualifies:

- maintained in August 2026
- agent-payment/payroll infrastructure using x402/MPP
- includes an x402 compliance-report surface
- has a three-agent treasury council
- its Compliance specialist explicitly considers whether a recipient or venue may be on a restricted list

Concrete Hermes insertion point:

Before a high-value payroll/treasury council vote involving a new counterparty, call Hermes `POST /v1/entity-sanctions-screen` and add the structured result to the Compliance specialist evidence payload. This converts a sanctions-related prompt consideration into externally checked evidence.

Outbound status:

- targeted maintainer email sent 2026-08-25
- subject: `Remlo compliance agent: external x402 sanctions screen`
- hypothesis: external sanctions evidence is a stronger product fit than generic developer verification because it directly supports an existing compliance-agent decision path

## Secondary target class: direct @x402/fetch agents

Prioritize maintained agents that already instantiate an x402 EVM client on Base and pay external APIs. Their integration surface is smaller than AgentCash: they can call the Hermes origin directly after a 402 challenge.

Target workflows:

- dependency or package review before code delivery
- due-diligence substeps before an agent commits to a counterparty/action
- structured data validation before producing a report or upload
- deterministic audit checks where an LLM alone is a poor verifier

One verified example is `profbernardoj/everclaw-community-branches`, which contains a live-style `@x402/fetch` CoinGecko client that pays $0.01 USDC on Base. Treat this as a candidate ecosystem, not yet an outreach conversion, until a specific Hermes workflow and reliable maintainer contact route are established.

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

Current acquisition counts as of 2026-08-25:

- qualified independent maintainer targets contacted: 3
- targeted outbound emails sent: 3
- external GitHub issues successfully posted: 0
- buyer-funded Hermes calls attributable to this campaign: not yet observed

## Next actions

1. Monitor replies to the three targeted messages and respond with the smallest integration artifact requested.
2. Qualify 2-3 additional independent payer-capable agents, prioritizing direct `@x402/fetch` clients and compliance/counterparty workflows.
3. Pursue a documented AgentCash curated-skill/catalog inclusion path so Hermes does not depend on broad semantic search.
4. Re-check production commerce telemetry after the real distribution attempts above.
5. Distinguish origin discovery, 402 challenge traffic, payment attempts, successful settlements, and repeat buyers.
6. Only after this evidence decide whether search metadata, integration packaging, endpoint design, or pricing is the next bottleneck.
