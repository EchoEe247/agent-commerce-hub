// Testnet-signer initialization & network-binding helpers.
//
// P1 Batch 3 keeps the strict Batch 2 JSON helpers for migration/tests, while
// live signer mutations use the authoritative SQLite financial store. The
// signer remains STRICTLY Base Sepolia (eip155:84532).

import path from "node:path";
import { fileURLToPath } from "node:url";
import { privateKeyToAccount } from "viem/accounts";
import {
  loadLedger,
  stageUpdate,
  NETWORK_TESTNET,
  TESTNET_WALLET,
  LedgerError,
  createEmptyLedger,
  saveLedger,
} from "../src/payments/ledger.mjs";
import {
  initializeFinancialStoreFromLedger,
  openFinancialStore,
  exportFinancialStoreToLedger,
} from "../src/payments/financial-store.mjs";

export const SIGNER_NETWORK = NETWORK_TESTNET;
export const SIGNER_EXPECTED_WALLET = TESTNET_WALLET;

export const DEFAULT_LEDGER_PATH = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../../state/commerce-control/ledgers/testnet-budget-ledger.json"
);

export const DEFAULT_FINANCIAL_DB_PATH = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../../state/commerce-control/financial/testnet-budget.sqlite"
);

export function resolveSignerNetwork(networkInput) {
  if (networkInput && networkInput !== SIGNER_NETWORK) {
    throw new Error(
      `TESTNET_SIGNER_MAINNET_REFUSED: signer is testnet-only (${SIGNER_NETWORK}); refused network ${networkInput}`
    );
  }
  return SIGNER_NETWORK;
}

export function verifyTestnetWallet(privateKey, expectedWallet = SIGNER_EXPECTED_WALLET) {
  if (!privateKey) {
    throw new Error("HERMES_COMMERCE_SPEND_TEST_PRIVATE_KEY environment variable is not set");
  }
  const account = privateKeyToAccount(
    privateKey.startsWith("0x") ? privateKey : `0x${privateKey}`
  );
  if (account.address.toLowerCase() !== expectedWallet.toLowerCase()) {
    throw new Error(
      `TESTNET_WALLET_BINDING_FAILED: derived account ${account.address} != expected test wallet ${expectedWallet}`
    );
  }
  return account;
}

// ---------------------------------------------------------------------------
// Legacy JSON snapshot helpers (migration / audit only after Batch 3).

let runtimeFinancialStore = null;
let runtimeFinancialDbPath = null;

function configuredRuntimeFinancialStore() {
  const dbPath = process.env.HERMES_FINANCIAL_DB_PATH;
  if (!dbPath) {
    runtimeFinancialStore?.close();
    runtimeFinancialStore = null;
    runtimeFinancialDbPath = null;
    return null;
  }
  if (runtimeFinancialStore && runtimeFinancialDbPath === dbPath) return runtimeFinancialStore;
  runtimeFinancialStore?.close();
  runtimeFinancialStore = openTestnetFinancialStore(dbPath);
  runtimeFinancialDbPath = dbPath;
  return runtimeFinancialStore;
}

export function loadTestnetLedger(ledgerPath = DEFAULT_LEDGER_PATH, allowCreate = false) {
  // The live Batch 3 workflow sets HERMES_FINANCIAL_DB_PATH. In that mode the
  // tracked JSON path is an audit snapshot only and all reads come from SQLite.
  const store = configuredRuntimeFinancialStore();
  if (store) return store.snapshot();

  try {
    const { ledger } = loadLedger(ledgerPath, NETWORK_TESTNET, {
      allowCreate,
      expectedWallet: SIGNER_EXPECTED_WALLET,
    });
    return ledger;
  } catch (error) {
    if (error instanceof LedgerError) {
      throw new Error(`TESTNET_LEDGER_FATAL: ${error.message} (code=${error.code})`);
    }
    throw error;
  }
}

export function stageTestnetUpdate(ledgerPath, purchaseId, stage, extra = {}) {
  const store = configuredRuntimeFinancialStore();
  if (store) {
    // Compatibility adapter for the existing live test harness. Normal purchase
    // flow records PREPARED before signing. Two subordinate validation cases
    // historically begin at SIGNED; make the budget reservation atomically as
    // the first durable write, then advance it. Production execution does not
    // use this compatibility path.
    let current = store.getPurchase(purchaseId);
    if (!current && stage === "SIGNED") {
      current = store.reservePurchase({
        purchaseId,
        amount: Number(extra.amount),
        payTo: extra.payTo ?? "",
      }, { source: "testnet-signer-compat" });
    }
    if (!current) {
      if (stage !== "PREPARED") {
        throw new Error(`TESTNET_FINANCIAL_STAGE_INVALID: first stage for ${purchaseId} must reserve budget, got ${stage}`);
      }
      store.reservePurchase({ purchaseId, ...extra, amount: Number(extra.amount) }, { source: "testnet-signer" });
      return store.snapshot();
    }
    if (current.stage === "SETTLED" && stage === "REPLAY_REJECTED") {
      store.recordEvent(purchaseId, "REPLAY_REJECTED", extra, { source: "testnet-signer" });
      return store.snapshot();
    }
    if (stage === "UNKNOWN") {
      // Unknown is not a releasable financial state. Preserve AMBIGUOUS so its
      // reservation remains until authoritative reconciliation resolves it.
      store.recordEvent(purchaseId, "RECONCILIATION_STILL_UNKNOWN", extra, { source: "testnet-signer" });
      return store.snapshot();
    }
    store.transitionPurchase(purchaseId, stage, extra, {
      expectedRevision: current.revision,
      source: "testnet-signer",
    });
    return store.snapshot();
  }

  // Batch 2 compatibility / explicit fixture path when no authoritative DB is
  // configured. This remains for tests and one-time migration tooling only.
  return stageUpdate(ledgerPath, NETWORK_TESTNET, purchaseId, stage, extra, {
    expectedWallet: SIGNER_EXPECTED_WALLET,
  });
}

export function initializeTestnetLedger(ledgerPath) {
  const ledger = createEmptyLedger(NETWORK_TESTNET, { wallet: SIGNER_EXPECTED_WALLET });
  saveLedger(ledgerPath, ledger);
  return ledger;
}

export function makeTestnetLedger(ledgerPath) {
  const ledger = createEmptyLedger(NETWORK_TESTNET, { wallet: SIGNER_EXPECTED_WALLET });
  saveLedger(ledgerPath, ledger);
  return ledger;
}

// ---------------------------------------------------------------------------
// Batch 3 authoritative SQLite helpers.

export function initializeTestnetFinancialStore(
  dbPath = DEFAULT_FINANCIAL_DB_PATH,
  ledgerPath = DEFAULT_LEDGER_PATH
) {
  return initializeFinancialStoreFromLedger(
    dbPath,
    ledgerPath,
    NETWORK_TESTNET,
    { expectedWallet: SIGNER_EXPECTED_WALLET }
  );
}

export function openTestnetFinancialStore(dbPath = DEFAULT_FINANCIAL_DB_PATH) {
  return openFinancialStore(dbPath, NETWORK_TESTNET, {
    expectedWallet: SIGNER_EXPECTED_WALLET,
  });
}

export function stageTestnetFinancialUpdate(store, purchaseId, stage, extra = {}) {
  const current = store.getPurchase(purchaseId);
  if (!current) {
    if (stage !== "PREPARED") {
      throw new Error(`TESTNET_FINANCIAL_STAGE_INVALID: first stage for ${purchaseId} must be PREPARED, got ${stage}`);
    }
    return store.reservePurchase({
      purchaseId,
      ...extra,
      amount: Number(extra.amount),
    }, { source: "testnet-signer" });
  }
  return store.transitionPurchase(
    purchaseId,
    stage,
    extra,
    {
      expectedRevision: current.revision,
      source: "testnet-signer",
    }
  );
}

export function recordTestnetFinancialEvent(store, purchaseId, eventType, detail = {}) {
  store.recordEvent(purchaseId, eventType, detail, { source: "testnet-signer" });
}

export function exportTestnetFinancialLedger(
  store,
  ledgerPath = DEFAULT_LEDGER_PATH
) {
  return exportFinancialStoreToLedger(store, ledgerPath, {
    requireCompatibleHistory: true,
  });
}

export { recalculateBudget } from "../src/payments/ledger.mjs";

export const TEST_WALLET = TESTNET_WALLET;
export const BASE_SEPOLIA = NETWORK_TESTNET;
