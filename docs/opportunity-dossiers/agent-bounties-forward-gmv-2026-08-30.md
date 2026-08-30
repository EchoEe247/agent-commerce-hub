# Agent Bounties Forward-GMV opportunity dossier — 2026-08-30

Status: **non-live decision dossier**. No wallet signature, claim, child funding, proof request, submission, worker contact, or value movement is authorized by this document.

## Why this opportunity is materially different

The active Agent Bounties forward-GMV competitions reward an entrant for creating and funding **useful marketplace demand that is canonically completed by a different eligible wallet**. The second participant is therefore part of the upstream acceptance condition. This is a legitimate reason to use the repository's human/counterparty fulfillment path rather than outsource work that the agent could simply keep in-house.

The commercial question is not whether a human marketplace exists. It is whether one independently completed child transaction can produce enough competition score, at low enough total cost, to justify the competitive risk.

## Live discovery snapshot used

The public unified Agent Bounties projection was re-fetched on 2026-08-30:

```text
GET https://api.agentbounties.app/v1/opportunities
  ?limit=300
  &network=base-mainnet
  &source_type=canonical_base
  &view=ready_to_earn
```

The snapshot reported 75 canonical Base opportunities and included three overlapping `forward-canonical-gmv-attribution-metric-v2` competitions that were in `participation_phase=scoring` when observed:

| Window | Competition | Solver prize | Provider configured external spend | Provider gross cash margin | Snapshot accepted entries |
| --- | --- | ---: | ---: | ---: | ---: |
| 2026-08-24 → 2026-08-31 | `0x2f1d2b24105596b153e473032256569fe544a44f` | 3.00 USDC | 0.11 USDC | 2.89 USDC | 0 |
| 2026-08-24 → 2026-09-07 | `0x6f635dfd07085aa48ec8b11767eeb48936969f5c` | 3.00 USDC | 0.11 USDC | 2.89 USDC | 0 |
| 2026-08-24 → 2026-09-21 | `0x8c990ddf5360c00ee0b2090000e3a3a6f90a6a9d` | 3.00 USDC | 0.11 USDC | 2.89 USDC | 0 |

`0 accepted entries` is a snapshot observation, not evidence that no competitor has already generated qualifying child GMV. A competitor can create qualifying GMV during the scoring window and prove its score later.

The provider's 2.89-USDC figure is **not profit**. It is the 3.00-USDC prize less the configured 0.11-USDC hosted proof/relay spend. It does not include the cost of creating/funding the child demand, worker/counterparty compensation, gas, a child verifier reward/bond, failed settlement, proof failure, or losing a best-score competition.

## Exact score mechanics from source

The checked-in `forward-canonical-gmv-attribution-metric-v2` program delegates to `competition-metric-core::execute_forward_canonical_gmv_program(...)`. Each competition freezes its own campaign epoch, start/end time, minimum score, excluded wallets/contracts, and deterministic attester set before scoring.

For each canonical settlement in the attested snapshot, the program requires the settlement timestamp to fall inside that campaign's scoring window and the settlement event to be inside the campaign's safe-block range. It orders settlements by block / transaction / log / bounty identity so the same settlement cannot be duplicated inside one snapshot.

For an otherwise eligible settlement, the entrant's score contribution is:

```text
attributed_gmv = settlement_gmv × entrant_canonical_funding / total_canonical_funding
```

If the entrant fully funds a qualifying child and there are no additional funders, its score contribution is therefore the child's canonical GMV. If other wallets co-fund it, attribution is proportional rather than the full settlement GMV.

The metric excludes, among other cases:

- settlements created by excluded operator/reserve wallets;
- settlements on excluded bounty/reward contracts;
- creator-as-solver settlements;
- settlements where the competition entrant is the solver;
- settlements with zero entrant funding;
- non-canonical or out-of-window settlement records.

This makes the independent solver requirement economically real: the entrant may fund the child, but the entrant wallet cannot also be its solver.

The autonomous child-bounty contract independently enforces `solver != creator`, requires positive solver and verifier rewards, and makes the solver post a claim bond equal to the verifier reward. Successful settlement returns that bond while paying the solver reward and verifier reward to their recipients. The base contract itself imposes no dollar-denominated minimum beyond positive atomic values, but hosted creation policy/tooling may impose a higher current minimum and must be checked immediately before any real child design.

## Overlapping-window eligibility stacking

The inspected source supports **eligibility stacking** of one canonical child settlement across these overlapping competitions:

1. each competition has its own immutable epoch/window and computes its own attested snapshot;
2. a snapshot is a vector of canonical settlement events that meet that competition's window/exclusion rules;
3. the metric prevents duplicate copies of one settlement *inside a single snapshot*, but contains no global consumed-settlement registry;
4. `OpenCompetitionBountyV2Beta3` is isolated per competition and binds each proof journal to that competition's own address and bounty id; its replay state is solver-nonce state local to that contract, not a cross-competition settlement-consumption registry.

Therefore, at the inspected source revision, a child settlement occurring during the shared Aug-24-to-Aug-31 overlap can be independently eligible for the weekly, fortnight, and monthly forward-GMV snapshots if all three campaigns' exclusions and entrant rules are satisfied.

This does **not** mean one child guarantees three prizes. Each contract is a separate `best_score` competition. We would still need a valid score/proof for each competition and would have to finish as the winning eligible entrant in each one. Live API/policy must be re-fetched before any consequential action in case campaign rules or operational surfaces changed.

## Cash model

Let:

- `C` = total irreversible cash cost of the canonical child transaction from our side, including its funded solver reward + verifier reward and any other child-specific cost that is not returned;
- `P = 3.00` USDC = each current competition's solver prize;
- `H = 0.11` USDC = current provider-configured hosted proof/relay spend **per competition**;
- `k` = number of these competitions actually won by the same qualifying child settlement;
- `O` = all additional costs not already included in `C` or `k × H` (gas, worker recruitment overhead, relays not included by the quote, etc.).

Then the simplified realized cash result is:

```text
profit(k) = 3.00k - C - 0.11k - O
          = 2.89k - C - O
```

If all attempted competitions are lost, the prize term is zero while the child and any already-paid proof costs remain costs.

Illustrative only — **not a current child recommendation**: if a valid useful child could be fully created and settled for exactly 1.00 USDC of irreversible cost and it won all three current competitions, the simplified result before `O` would be:

```text
9.00 prize
-1.00 child cost
-0.33 three proof/relay spends
= 7.67 USDC
```

If that same 1.00-USDC child won only one current competition, the corresponding simplified result would be `1.89 USDC` before `O`; if it won none, at least the child cost would be lost and any proof costs already incurred would add to that loss.

The current source does not justify assuming that a 1.00-USDC all-in child is available through the live hosted creation surface. Before any action, the exact child protocol, solver reward, verifier reward, bond, tooling minimum, gas path, and independent solver price must be established.

## Deadline pressure

The shortest observed scoring window closes at `2026-08-31T00:00:00Z`. At the 2026-08-30 13:20Z continuation point there were under eleven hours left in that window. A rushed child that fails canonical settlement before the weekly cutoff has zero weekly score even if it later settles in time for the longer windows.

The fortnight and monthly competitions preserve more execution time and should remain independently valuable if the weekly window becomes operationally unrealistic.

## Minimal useful child design criteria

A child used for GMV must be legitimate marketplace demand, not a synthetic payment loop. The exact work should satisfy all of the following before funding:

- useful, concrete deliverable that we actually want performed;
- acceptance criteria narrow enough for deterministic or reliably auditable settlement;
- solvable by a different eligible wallet/counterparty;
- no creator-as-solver or entrant-as-solver arrangement;
- reward high enough to attract a real solver but low enough to preserve competition economics;
- execution/verification window comfortably inside the target competition cutoff;
- canonical settlement path established before relying on its GMV;
- worker/counterparty terms frozen before they begin;
- total cost ceiling fixed before any signature or value movement.

GiveGigs can be used as a recruitment surface only if the selected solver can satisfy the upstream wallet/eligibility requirements under their own legitimate account/wallet. The GiveGigs application is not itself qualification, and a worker should not be recruited merely to perform work that the agent can do internally.

## Exact pre-action gate

A real execution decision should occur only after one final, fresh evidence pass that resolves all of these facts in one dossier revision:

```text
1. Re-fetch the three competition records and confirm scoring phase/window.
2. Re-fetch current entries/leader information if exposed; do not infer competitiveness from stale entry_count=0.
3. Select one useful child deliverable and exact canonical child protocol.
4. Establish child solver reward, verifier reward, claim bond, funding target, and all platform/tooling minimums.
5. Establish a real independent solver/counterparty and their compensation/eligibility requirements.
6. Confirm the child can canonically settle before the chosen scoring cutoff.
7. Quote each competition proof/relay path; do not assume the old 0.11-USDC figure remains current.
8. Calculate max downside and expected value for weekly / fortnight / monthly participation separately and jointly.
9. Prepare exact transaction destinations, chain, asset, amounts, calldata/intents, and failure/refund conditions.
10. Stop for explicit operator authorization before the first wallet signature, funding, claim, proof purchase, or other value movement.
```

## Current decision

**Prepare, do not execute.**

The source-level mechanics are commercially interesting enough to keep pursuing because a single legitimate child settlement can be eligible across multiple overlapping prize windows and the independent participant is genuinely required by the upstream task. The remaining unknowns are now transaction-specific economics and execution feasibility, not another generic orchestration gap.

No new execution infrastructure should be built until those live facts establish a positive, bounded opportunity.