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

// Load the testnet ledger strictly (bound to TESTNET_WALLET). Missing file ->
// first-run empty ledger (persisted). Malformed/existing -> fatal (no reset).
// Returns the in-memory ledger object.
export function loadTestnetLedger(ledgerPath = DEFAULT_LEDGER_PATH, allowCreate = true) {
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

// Used by tests to create a throwaway ledger file already bound to the expected
// testnet wallet without touching the canonical path.
export function makeTestnetLedger(ledgerPath) {
  const ledger = createEmptyLedger(NETWORK_TESTNET, { wallet: SIGNER_EXPECTED_WALLET });
  saveLedger(ledgerPath, ledger);
  return ledger;
}

export { recalculateBudget } from "../src/payments/ledger.mjs";
