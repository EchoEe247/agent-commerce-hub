# AGENTS.md

This file is the operating handoff for fresh ChatGPT or agent sessions working in `agent-commerce-hub`.

## Read current authority first

Before using old chat context, handoffs, receipts, plans, or research snapshots, read:

1. `docs/CURRENT_STATE.md`
2. `state/CURRENT.json`
3. `docs/REVENUE_OPERATING_PRINCIPLES.md`
4. the subsystem documentation relevant to the task

Current repository/production evidence outranks stale session context. A file called `latest` is not automatically authority, and `Unknown/Archived/` is historical evidence only.

## Angel wording integration

For Angel-owned project communication, use `EchoEe247/Chatgpt-Angel-wording-refinement` as the wording/refinement authority.

Keep the boundary clear:

- `agent-commerce-hub` defines **what the system is, its commercial mission, current state, production boundary, financial/security constraints, and subsystem contracts**;
- `Chatgpt-Angel-wording-refinement` defines **how Angel-owned communication about the system should be refined and expressed**.

For routine wording work, load that repository's `prompts/SESSION_BOOTSTRAP.md`. For important or ambiguous technical, commercial, security, production, handoff, or public wording, also load the full system spec, relevant context profile, and meaning-preservation rules.

Default to Angel-refined. Use Angel-professional for serious technical, commercial-policy, production, financial-boundary, or security documentation.

Project truth always outranks style.

## Standing mission

The project is revenue-first:

`opportunity discovery → qualification → pricing → execution → quality gate → delivery → payment → follow-up/repeat business → revenue measurement`

Prefer work that improves real commercial execution, repeatability, margin, conversion, time-to-revenue, or reduces routine operator babysitting.

Do not add architecture, tooling, verification, observability, or agent complexity merely because it is technically interesting. It should solve a demonstrated commercial/autonomy/reliability problem.

## Authorization boundaries

Do not confuse a positive repository state with authorization.

A funded, ready, approved, qualified, or attractive opportunity does not itself authorize:

- wallet signatures;
- funding or spending;
- bounty claims;
- proof purchases;
- worker payments;
- withdrawals;
- production mutation;
- credential exposure;
- other irreversible value movement.

Use the explicit operator/runtime boundary required by the current project rules.

Likewise, a merge to `main` is not a production deployment. Follow the protected production-promotion path in `docs/CURRENT_STATE.md`.

## Engineering behavior

Prefer coherent implementation followed by the meaningful gate. Fix concrete failures rather than repeatedly re-planning settled architecture.

Do not reopen completed hardening or reliability work without new failure evidence.

Use Hermes/local execution when the claim depends on real credentials, device/runtime state, package publication, production deployment, wallet/runtime behavior, or another external boundary that repository inspection cannot establish.

## Evidence behavior

- Preserve verified/observed facts separately from inference.
- Historical raw evidence stays historical and is not silently overwritten.
- `docs/CURRENT_STATE.md` and `state/CURRENT.json` should be reconciled when mutable current state changes.
- Never commit secrets, private paid results, local SQLite/WAL/SHM files, generated `node_modules`, wallet material, or reusable financial authorization.

The objective is not to make the system look busy. It is to keep moving toward real, repeatable paid execution with less operator work while respecting the boundaries around money, production, secrets, and irreversible actions.