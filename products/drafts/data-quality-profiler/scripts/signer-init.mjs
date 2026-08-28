// Testnet-signer initialization & network-binding helpers.
//
// Extracted from github-actions-signer.mjs so the network-binding and wallet-
// binding logic can be behaviorally tested WITHOUT contacting testnet or
// performing any signing. The signer is STRICTLY testnet (Base Sepolia,
// eip155:84532) and must refuse any mainnet input before a private key is used.

import fs from "node:fs";
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
  recalculateBudget,
} from "../src/payments/ledger.mjs";

// The only acceptable network input for this signer.
export const SIGNER_NETWORK = NETWORK_TESTNET;
export const SIGNER_EXPECTED_WALLET = TESTNET_WALLET;

export const DEFAULT_LEDGER_PATH = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../../state/commerce-control/ledgers/testnet-budget-ledger.json"
);

// Resolve and validate the requested network input. Anything other than the
// testnet chain is refused BEFORE any key material is touched.
export function resolveSignerNetwork(networkInput) {
  if (networkInput && networkInput !== SIGNER_NETWORK) {
    throw new Error(
      `TESTNET_SIGNER_MAINNET_REFUSED: signer is testnet-only (${SIGNER_NETWORK}); refused network ${networkInput}`
    );
  }
  return SIGNER_NETWORK;
}

// Derive the wallet from the private key and verify it matches the expected
// testnet wallet BEFORE any signing/payment operation.
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

// Load the testnet ledger strictly (bound to TESTNET_WALLET). The canonical
// testnet ledger is tracked financial history, so the OPERATIONAL loader must
// NOT silently bootstrap a replacement if it disappears. Therefore the default
// is allowCreate=false: a missing canonical ledger is LEDGER_MISSING / fatal.
// Use initializeTestnetLedger() for an explicit first-run / admin bootstrap.
export function loadTestnetLedger(ledgerPath = DEFAULT_LEDGER_PATH, allowCreate = false) {
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

// Every testnet stage write goes through this wallet-bound helper. The caller
// never chooses network or wallet parameters for ledger writes — they are
// pinned here to NETWORK_TESTNET + { expectedWallet: TESTNET_WALLET } so a
// stage mutation can never land on the wrong network or an unbound ledger.
export function stageTestnetUpdate(ledgerPath, purchaseId, stage, extra = {}) {
  return stageUpdate(ledgerPath, NETWORK_TESTNET, purchaseId, stage, extra, {
    expectedWallet: SIGNER_EXPECTED_WALLET,
  });
}

// Explicit first-run / admin bootstrap ONLY. Creates a fresh canonical empty
// ledger bound to the expected testnet wallet: network eip155:84532, asset
// USDC, wallet = TESTNET_WALLET, correct budget ID / ceiling, zero purchases
// and zero totals. Used by tests and admin tooling — NEVER by the operational
// runtime path (which must treat a missing ledger as fatal).
export function initializeTestnetLedger(ledgerPath) {
  const ledger = createEmptyLedger(NETWORK_TESTNET, { wallet: SIGNER_EXPECTED_WALLET });
  saveLedger(ledgerPath, ledger);
  return ledger;
}

// Used by tests to create a throwaway ledger file already bound to the expected
// testnet wallet without touching the canonical path.
export function makeTestnetLedger(ledgerPath) {
  const ledger = createEmptyLedger(NETWORK_TESTNET, { wallet: SIGNER_EXPECTED_WALLET });
  saveLedger(ledgerPath, ledger);
  return ledger;
}

export { recalculateBudget } from "../src/payments/ledger.mjs";

// Canonical aliases so historical testnet validation scripts and the signer do
// not re-declare divergent TEST_WALLET / BASE_SEPOLIA constants that can drift.
export const TEST_WALLET = TESTNET_WALLET;
export const BASE_SEPOLIA = NETWORK_TESTNET;
