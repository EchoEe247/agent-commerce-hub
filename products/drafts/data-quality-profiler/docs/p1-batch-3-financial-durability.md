# P1 Batch 3 — Financial Durability and Reconciliation

## Runtime authority

Batch 3 moves financial execution authority from tracked JSON ledger files to a local SQLite store using Node's built-in `node:sqlite`.

- Mainnet runtime DB: `state/commerce-control/financial/mainnet-budget.sqlite`
- Testnet runtime DB: `state/commerce-control/financial/testnet-budget.sqlite`
- `*.sqlite`, WAL, and SHM files are ignored by Git.
- `state/commerce-control/ledgers/*.json` remain versioned audit/import/export snapshots only.

The production buyer never creates a missing authoritative DB. Missing state is fatal. Initial migration is explicit:

```bash
cd products/drafts/data-quality-profiler
npm run financial:init:mainnet
npm run financial:audit:mainnet
```

Do not run `financial:init:mainnet` over an existing DB; the initializer refuses to replace it.

## Concurrency and budget safety

Budget reservation uses `BEGIN IMMEDIATE`, so the remaining-budget check and PREPARED insert are serialized in one SQLite transaction. Each purchase also has a monotonic revision. Every later stage transition requires the expected revision (CAS) and fails with `CAS_CONFLICT` if another writer already advanced the purchase.

PREPARED, SIGNED, AMBIGUOUS, SETTLED, and historical REPLAY_REJECTED records consume/reserve budget. FAILED releases it. A transaction hash always keeps the amount budget-consuming even if historical stage data is inconsistent.

## Payment/persistence crash model

The production buyer now records:

1. `PREPARED` plus amount, payee, asset, resource, idempotency key, and a chain reconciliation anchor block.
2. `SIGNED` plus nonce, expiry, payment payload, and payment requirements.
3. Only then sends the paid request.

If HTTP outcome is lost or a post-payment SQLite write fails, the durable SIGNED/AMBIGUOUS reservation remains. The buyer does **not** create another signature. Reconciliation resolves the existing authorization.

## Reconciliation

Run:

```bash
npm run financial:reconcile:mainnet
```

The reconciler uses Base RPC chain evidence and, when available, x402 facilitator `/verify` evidence.

- Exact on-chain USDC transfer -> `SETTLED`.
- Confirmed reverted transaction -> `FAILED`.
- Stale unsigned PREPARED reservation -> `FAILED` after its reservation deadline.
- Expired SIGNED/AMBIGUOUS authorization -> released only when a complete chain scan finds no matching transfer; incomplete/failed evidence keeps the reservation held.
- Multiple matching transfers remain unresolved for operator review.
- Positive chain evidence may recover an earlier conservative FAILED classification to SETTLED.

## JSON audit snapshots and divergence

Export is explicit:

```bash
npm run financial:export:mainnet
```

Before replacing an existing tracked snapshot, export checks that its historical purchases are compatible with the authoritative DB. A divergent purchase amount/identity/history produces `LEDGER_DIVERGENCE`; the file is not overwritten.

The testnet GitHub signer workflow uses a temporary SQLite authority for each validation run, then exports the validated testnet JSON snapshot and commits that audit snapshot. Git is transport/history for testnet CI, not the transaction engine during signing.

## Deliberately not included

Wallet rotation remains outside this batch. Batch 3 also does not add a remote HA database or broader commerce-control architecture changes; the current deployment model is a single local/runtime financial authority with SQLite concurrency and crash recovery.
