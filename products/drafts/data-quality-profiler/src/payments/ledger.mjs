// Focused, seller-local financial ledger utility.
//
// Scope for P1 Batch 2 ONLY:
//   - load a ledger (with strict network/asset/ceiling/wallet binding)
//   - validate schema/network/asset/budget
//   - atomic local save
//   - initialize an explicit empty ledger (first-run / allowed path only)
//   - stage an update (recalculates canonical totals and persists them)
//   - budget recalculation
//
// This module deliberately does NOT implement external authoritative
// reconciliation, concurrent-writer safety, CAS, or chain/facilitator
// reconciliation. Those remain deferred (see batch notes).
//
// Safety invariants enforced here:
//   - A malformed/existing ledger is FATAL. It must NEVER silently reset to a
//     default financial document. Only an explicit first-run/create path may
//     initialize an empty ledger at a path that does not yet exist.
//   - A process bound to one network MUST NOT open a ledger bound to another
//     network. mainnet cannot open testnet; testnet cannot open mainnet.
//   - A wrong budget ceiling, asset, or wallet binding is FATAL.
//   - Persisted totals (spentBudget/remainingBudget) are always recalculated
//     from purchases and written back; a stale existing ledger whose stored
//     totals disagree with purchases is FATAL (TOTALS_MISMATCH) — reading
//     financial state must not silently rewrite it.

import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

export const LEDGER_SCHEMA_VERSION = "1";

// Network binding strings are CAIP-2 chain IDs.
export const NETWORK_MAINNET = "eip155:8453";
export const NETWORK_TESTNET = "eip155:84532";

// This project's financial ledgers are USDC-specific.
export const LEDGER_ASSET = "USDC";

// Known-good budget IDs (kept here so both buyer and signer validate against
// the same canonical constants rather than embedding divergent defaults).
export const MAINNET_BUDGET_ID = "B2_COMMERCE_OPERATING_BUDGET_V1";
export const TESTNET_BUDGET_ID = "B2_COMMERCE_OPERATING_BUDGET_V1_TESTNET";

// Known-good authoritative wallets. Used to bind ledger files to the expected
// operator wallet so a wrong/empty ledger wallet is rejected.
export const MAINNET_WALLET = "0x2960a4b12A0cF133C738Bf8e768411152Ef8e5b5";
export const TESTNET_WALLET = "0xc6139957cf09F97718cA6b3c88fB3931aDC04ead";

// Default ceilings. These are ONLY used by `createEmptyLedger` for an explicit
// first-run path. They are NOT fallbacks for a corrupt existing file.
export const MAINNET_DEFAULT_CEILING_RAW = 2_380_000;
export const TESTNET_DEFAULT_CEILING_RAW = 2_000_000;

// Stages that consume from the budget. FAILED does NOT consume; PREPARED,
// SIGNED, AMBIGUOUS, SETTLED and REPLAY_REJECTED do (a settled/rejected
// attempt is a real drawn-down of the operating budget).
const BUDGET_CONSUMING_STAGES = new Set([
  "PREPARED",
  "SIGNED",
  "AMBIGUOUS",
  "SETTLED",
  "REPLAY_REJECTED",
]);

export class LedgerError extends Error {
  constructor(message, code) {
    super(message);
    this.name = "LedgerError";
    this.code = code ?? "LEDGER_ERROR";
  }
}

// Single canonical totals calculation path. Always derived from purchases and
// the authoritative initial budget. Returns safe-integer non-negative values.
export function recalculateBudget(ledger, authoritativeNetwork) {
  if (!ledger || typeof ledger !== "object") {
    throw new LedgerError("ledger root must be an object", "SCHEMA_MISMATCH");
  }
  const meta = expectedLedgerMeta(authoritativeNetwork);
  const initialBudget = meta.initialBudget;
  const purchases = ledger.purchases ?? {};

  let spent = 0;
  for (const purchase of Object.values(purchases)) {
    if (!purchase || typeof purchase !== "object") continue;
    if (BUDGET_CONSUMING_STAGES.has(purchase.stage) || purchase.transaction) {
      const amount = Number(purchase.amount ?? 0);
      if (!Number.isSafeInteger(amount) || amount < 0) {
        throw new LedgerError(`invalid purchase amount ${purchase.amount}`, "INVALID_AMOUNT");
      }
      if (!Number.isSafeInteger(spent)) {
        throw new LedgerError("accumulated spent overflowed safe integer", "OVERSPEND");
      }
      spent += amount;
    }
  }

  if (!Number.isSafeInteger(spent)) {
    throw new LedgerError("accumulated spent is not a safe integer", "OVERSPEND");
  }
  if (spent > initialBudget) {
    throw new LedgerError(
      `overspent ledger: spent ${spent} exceeds initial budget ${initialBudget}`,
      "OVERSPEND"
    );
  }

  const remainingBudget = initialBudget - spent;
  if (remainingBudget < 0) {
    throw new LedgerError(`negative remaining budget ${remainingBudget}`, "OVERSPEND");
  }

  return { spentBudget: spent, remainingBudget };
}

function assertBudgetShape(budget, where) {
  if (!budget || typeof budget !== "object") {
    throw new LedgerError(`${where}: budget must be an object`);
  }
  const initial = Number(budget.initialBudget);
  if (!Number.isSafeInteger(initial) || initial < 0) {
    throw new LedgerError(`${where}: invalid initialBudget ${budget.initialBudget}`, "INVALID_CEILING");
  }
  if (typeof budget.budgetId !== "string" || budget.budgetId.length === 0) {
    throw new LedgerError(`${where}: missing budgetId`, "INVALID_BUDGET_ID");
  }
  if (typeof budget.purchases !== "object" || budget.purchases === null || Array.isArray(budget.purchases)) {
    throw new LedgerError(`${where}: purchases must be an object`, "INVALID_PURCHASES");
  }
  if (typeof budget.wallet !== "string") {
    throw new LedgerError(`${where}: wallet must be a string`, "INVALID_WALLET");
  }
}

// Build the strict expected metadata for a given network. The caller passes
// the network it is authorized to operate on; the ledger must agree exactly.
export function expectedLedgerMeta(authoritativeNetwork) {
  if (authoritativeNetwork === NETWORK_MAINNET) {
    return {
      network: NETWORK_MAINNET,
      budgetId: MAINNET_BUDGET_ID,
      initialBudget: MAINNET_DEFAULT_CEILING_RAW,
    };
  }
  if (authoritativeNetwork === NETWORK_TESTNET) {
    return {
      network: NETWORK_TESTNET,
      budgetId: TESTNET_BUDGET_ID,
      initialBudget: TESTNET_DEFAULT_CEILING_RAW,
    };
  }
  throw new LedgerError(`unsupported authoritative network ${authoritativeNetwork}`, "UNSUPPORTED_NETWORK");
}

// Validate the on-disk ledger object against the network the caller is bound to.
// Throws LedgerError (fatal) on any mismatch. Returns the normalized budget.
//
// On LOAD we do NOT silently repair stale totals. If the stored spentBudget /
// remainingBudget disagree with a fresh recalculation from purchases, that is
// TOTALS_MISMATCH (fatal) — financial state must not be silently rewritten.
export function validateLedger(ledger, authoritativeNetwork, { expectedWallet = null, repairTotals = false } = {}) {
  if (!ledger || typeof ledger !== "object") {
    throw new LedgerError("ledger root must be an object", "SCHEMA_MISMATCH");
  }
  if (ledger.schemaVersion !== LEDGER_SCHEMA_VERSION) {
    throw new LedgerError(
      `ledger schemaVersion ${JSON.stringify(ledger.schemaVersion)} != ${LEDGER_SCHEMA_VERSION}`,
      "SCHEMA_MISMATCH"
    );
  }
  if (ledger.network !== authoritativeNetwork) {
    throw new LedgerError(
      `ledger network ${ledger.network} != required ${authoritativeNetwork}`,
      "NETWORK_MISMATCH"
    );
  }

  const meta = expectedLedgerMeta(authoritativeNetwork);
  if (ledger.budgetId !== meta.budgetId) {
    throw new LedgerError(
      `ledger budgetId ${ledger.budgetId} != ${meta.budgetId}`,
      "BUDGET_ID_MISMATCH"
    );
  }
  if (Number(ledger.initialBudget) !== meta.initialBudget) {
    throw new LedgerError(
      `ledger initialBudget ${ledger.initialBudget} != required ${meta.initialBudget}`,
      "CEILING_MISMATCH"
    );
  }
  // Strict asset binding: this project's ledgers are USDC-specific.
  if (ledger.asset !== LEDGER_ASSET) {
    throw new LedgerError(
      `ledger asset ${JSON.stringify(ledger.asset)} != required ${LEDGER_ASSET}`,
      "ASSET_MISMATCH"
    );
  }

  const budget = {
    budgetId: ledger.budgetId,
    wallet: ledger.wallet ?? "",
    initialBudget: ledger.initialBudget,
    spentBudget: Number(ledger.spentBudget ?? 0),
    remainingBudget: Number(ledger.remainingBudget ?? 0),
    purchases: ledger.purchases ?? {},
  };
  assertBudgetShape(budget, "validate");

  // Optional wallet binding check: if the process knows the authoritative
  // wallet for this network, the ledger must exactly match it (empty is NOT
  // acceptable when an expected wallet was supplied).
  if (expectedWallet) {
    if (!budget.wallet || budget.wallet.toLowerCase() !== expectedWallet.toLowerCase()) {
      throw new LedgerError(
        `ledger wallet ${budget.wallet || "(empty)"} != bound wallet ${expectedWallet}`,
        "WALLET_MISMATCH"
      );
    }
  }

  // Canonical totals from purchases.
  const { spentBudget, remainingBudget } = recalculateBudget(ledger, authoritativeNetwork);

  // Do not silently rewrite stale stored totals on load.
  if (budget.spentBudget !== spentBudget || budget.remainingBudget !== remainingBudget) {
    if (repairTotals) {
      ledger.spentBudget = spentBudget;
      ledger.remainingBudget = remainingBudget;
    } else {
      throw new LedgerError(
        `stored totals mismatch: stored spent=${budget.spentBudget} remaining=${budget.remainingBudget} but recomputed spent=${spentBudget} remaining=${remainingBudget}`,
        "TOTALS_MISMATCH"
      );
    }
  }

  return budget;
}

// Explicit first-run / allowed-path constructor. NEVER call this to "repair" an
// existing file. Use only when the path does not exist and an empty ledger is
// intentionally created.
export function createEmptyLedger(authoritativeNetwork, { wallet = "", asset = LEDGER_ASSET } = {}) {
  const meta = expectedLedgerMeta(authoritativeNetwork);
  return {
    schemaVersion: LEDGER_SCHEMA_VERSION,
    network: meta.network,
    budgetId: meta.budgetId,
    asset: LEDGER_ASSET,
    initialBudget: meta.initialBudget,
    spentBudget: 0,
    remainingBudget: meta.initialBudget,
    wallet,
    purchases: {},
  };
}

// Load a ledger from disk, strictly bound to the caller's network.
//   - missing file + allowCreate=false -> FATAL (do not invent financial state)
//   - missing file + allowCreate=true  -> create canonical empty ledger AND
//                                          persist it atomically
//   - unreadable/malformed JSON         -> FATAL (never reset to default)
//   - wrong network / ceiling / asset / wallet -> FATAL
//   - stale stored totals               -> FATAL (TOTALS_MISMATCH)
export function loadLedger(filePath, authoritativeNetwork, opts = {}) {
  const { allowCreate = false, expectedWallet = null } = opts;
  if (!fs.existsSync(filePath)) {
    if (!allowCreate) {
      throw new LedgerError(`ledger path does not exist: ${filePath}`, "LEDGER_MISSING");
    }
    // Construct the fresh ledger, then resolve and VALIDATE the wallet binding
    // BEFORE any persistence. Never write a brand-new ledger to disk and only
    // afterwards discover it violates the requested binding.
    const fresh = createEmptyLedger(authoritativeNetwork, {
      wallet: opts.defaultWallet ?? expectedWallet ?? "",
      asset: LEDGER_ASSET,
    });
    const budget = validateLedger(fresh, authoritativeNetwork, { expectedWallet });
    // Only after validation succeeds do we atomically persist.
    saveLedger(filePath, fresh);
    return { ledger: fresh, budget };
  }

  let raw;
  try {
    raw = fs.readFileSync(filePath, "utf8");
  } catch (error) {
    throw new LedgerError(`cannot read ledger ${filePath}: ${error.message}`, "LEDGER_UNREADABLE");
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    // Explicitly fatal: a corrupt financial file is never reset to a default.
    throw new LedgerError(`ledger ${filePath} is not valid JSON: ${error.message}`, "LEDGER_PARSE_ERROR");
  }

  const budget = validateLedger(parsed, authoritativeNetwork, { expectedWallet });
  return { ledger: parsed, budget };
}

// Atomic, durable-enough local write: write a temp file in the same directory,
// fsync, then rename over the target. This protects against torn writes from a
// crash mid-write, but does NOT provide multi-writer safety or a transactional
// external store. Documented limitation in batch notes.
export function saveLedger(filePath, ledger) {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
  const tmp = path.join(dir, `.ledger-${randomUUID()}.tmp`);
  const serialized = `${JSON.stringify(ledger, null, 2)}\n`;
  const handle = fs.openSync(tmp, "w");
  try {
    fs.writeSync(handle, serialized);
    fs.fsyncSync(handle);
  } finally {
    fs.closeSync(handle);
  }
  fs.renameSync(tmp, filePath);
}

// Stage an update: mutate purchases, recalculate the canonical totals, write
// them into the ROOT ledger, validate, then atomically persist. This is the
// single totals path; persisted spentBudget/remainingBudget are always
// consistent with purchases.
export function stageUpdate(filePath, authoritativeNetwork, purchaseId, stage, extra = {}, opts = {}) {
  const { ledger } = loadLedger(filePath, authoritativeNetwork, opts);
  ledger.purchases ??= {};
  const previous = ledger.purchases[purchaseId] ?? { purchaseId };
  ledger.purchases[purchaseId] = {
    ...previous,
    stage,
    updatedAt: new Date().toISOString(),
    ...extra,
  };

  // Single canonical totals path: recalc -> write root -> validate.
  const { spentBudget, remainingBudget } = recalculateBudget(ledger, authoritativeNetwork);
  ledger.spentBudget = spentBudget;
  ledger.remainingBudget = remainingBudget;

  validateLedger(ledger, authoritativeNetwork, opts);
  saveLedger(filePath, ledger);
  return ledger;
}
