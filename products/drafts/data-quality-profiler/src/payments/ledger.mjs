// Focused, seller-local financial ledger utility.
//
// Scope for P1 Batch 2 ONLY:
//   - load a ledger (with strict network/ceiling/wallet binding)
//   - validate schema/network/budget
//   - atomic local save
//   - initialize an explicit empty ledger (first-run / allowed path only)
//   - stage an in-memory update (caller persists)
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
//   - A wrong budget ceiling or wrong wallet/network binding is FATAL.

import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

export const LEDGER_SCHEMA_VERSION = "1";

// Network binding strings are CAIP-2 chain IDs.
export const NETWORK_MAINNET = "eip155:8453";
export const NETWORK_TESTNET = "eip155:84532";

// Known-good budget IDs (kept here so both buyer and signer validate against
// the same canonical constants rather than embedding divergent defaults).
export const MAINNET_BUDGET_ID = "B2_COMMERCE_OPERATING_BUDGET_V1";
export const TESTNET_BUDGET_ID = "B2_COMMERCE_OPERATING_BUDGET_V1_TESTNET";

// Default ceilings. These are ONLY used by `createEmptyLedger` for an explicit
// first-run path. They are NOT fallbacks for a corrupt existing file.
export const MAINNET_DEFAULT_CEILING_RAW = 2_380_000;
export const TESTNET_DEFAULT_CEILING_RAW = 2_000_000;

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

export function recalculateBudgetRecord(budget) {
  assertBudgetShape(budget, "recalculate");
  let spent = 0;
  for (const purchase of Object.values(budget.purchases ?? {})) {
    if (!purchase || typeof purchase !== "object") continue;
    if (BUDGET_CONSUMING_STAGES.has(purchase.stage) || purchase.transaction) {
      const amount = Number(purchase.amount ?? 0);
      if (!Number.isSafeInteger(amount) || amount < 0) {
        throw new LedgerError(`invalid purchase amount ${purchase.amount}`, "INVALID_AMOUNT");
      }
      spent += amount;
    }
  }
  budget.spentBudget = spent;
  budget.remainingBudget = budget.initialBudget - spent;
  return budget;
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
export function validateLedger(ledger, authoritativeNetwork, { expectedWallet = null } = {}) {
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
  if (typeof ledger.asset !== "string" || ledger.asset.length === 0) {
    throw new LedgerError("ledger asset is missing", "ASSET_MISMATCH");
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
  // wallet for this network, the ledger must not disagree.
  if (expectedWallet && budget.wallet && budget.wallet.toLowerCase() !== expectedWallet.toLowerCase()) {
    throw new LedgerError(
      `ledger wallet ${budget.wallet} != bound wallet ${expectedWallet}`,
      "WALLET_MISMATCH"
    );
  }

  recalculateBudgetRecord(budget);
  return budget;
}

// Explicit first-run / allowed-path constructor. NEVER call this to "repair" an
// existing file. Use only when the path does not exist and an empty ledger is
// intentionally created.
export function createEmptyLedger(authoritativeNetwork, { wallet = "", asset = "USDC" } = {}) {
  const meta = expectedLedgerMeta(authoritativeNetwork);
  return {
    schemaVersion: LEDGER_SCHEMA_VERSION,
    network: meta.network,
    budgetId: meta.budgetId,
    asset,
    initialBudget: meta.initialBudget,
    spentBudget: 0,
    remainingBudget: meta.initialBudget,
    wallet,
    purchases: {},
  };
}

// Load a ledger from disk, strictly bound to the caller's network.
//   - missing file + allowCreate=true  -> createEmptyLedger (first-run)
//   - missing file + allowCreate=false -> FATAL (do not invent financial state)
//   - unreadable/malformed JSON         -> FATAL (never reset to default)
//   - wrong network / ceiling / wallet  -> FATAL
export function loadLedger(filePath, authoritativeNetwork, opts = {}) {
  const { allowCreate = false, expectedWallet = null } = opts;
  if (!fs.existsSync(filePath)) {
    if (!allowCreate) {
      throw new LedgerError(`ledger path does not exist: ${filePath}`, "LEDGER_MISSING");
    }
    const fresh = createEmptyLedger(authoritativeNetwork, { wallet: opts.defaultWallet ?? "", asset: opts.asset ?? "USDC" });
    return { ledger: fresh, budget: validateLedger(fresh, authoritativeNetwork, { expectedWallet }) };
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

// Stage an update in memory and persist. Returns the updated budget record.
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
  validateLedger(ledger, authoritativeNetwork, opts);
  saveLedger(filePath, ledger);
  return ledger;
}
