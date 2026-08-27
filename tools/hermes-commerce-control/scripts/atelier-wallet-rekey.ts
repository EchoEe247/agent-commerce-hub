#!/usr/bin/env node
import { homedir } from "node:os";
import { join } from "node:path";
import { rekeyAtelierWalletKeystore } from "../src/atelier/wallet-store.js";

async function readLines(): Promise<readonly [string, string]> {
  let raw = "";
  for await (const chunk of process.stdin) raw += String(chunk);
  const lines = raw.replace(/\r/g, "").split("\n");
  const oldPassphrase = lines[0] ?? "";
  const newPassphrase = lines[1] ?? "";
  raw = "";
  if (oldPassphrase.length < 16 || newPassphrase.length < 16) {
    throw new Error("both old and new passphrases must be at least 16 characters");
  }
  return [oldPassphrase, newPassphrase] as const;
}

const path = process.env.ATELIER_WALLET_KEYSTORE_PATH?.trim() ||
  join(homedir(), ".hermes", "commerce-control", "secrets", "atelier-solana-wallet.keystore.json");

try {
  const [oldPassphrase, newPassphrase] = await readLines();
  const result = rekeyAtelierWalletKeystore(path, oldPassphrase, newPassphrase);
  console.log("ATELIER_WALLET_REKEYED=yes");
  console.log(`WALLET_ADDRESS=${result.address}`);
  console.log(`KEYSTORE_PATH=${result.path}`);
  console.log("WALLET_ADDRESS_CHANGED=no");
  console.log("PRIVATE_KEY_PRINTED=no");
  console.log("NETWORK_ACTION_EXECUTED=no");
  console.log("BLOCKCHAIN_TX_EXECUTED=no");
} catch (error) {
  console.error(`ATELIER_WALLET_REKEY_FAILED=${error instanceof Error ? error.message : String(error)}`);
  console.error("NETWORK_ACTION_EXECUTED=no");
  console.error("BLOCKCHAIN_TX_EXECUTED=no");
  process.exitCode = 1;
}
