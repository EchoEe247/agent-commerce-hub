#!/usr/bin/env node
import { homedir } from "node:os";
import { join } from "node:path";
import { createAtelierWalletKeystore } from "../src/atelier/wallet-store.js";

if (process.env.ATELIER_WALLET_CREATION_APPROVED !== "yes") {
  console.error("ERROR: explicit Atelier wallet-creation approval is required");
  process.exit(2);
}

async function readPassphrase(): Promise<string> {
  let raw = "";
  for await (const chunk of process.stdin) raw += String(chunk);
  const passphrase = raw.replace(/[\r\n]+$/, "");
  if (passphrase.length < 16) throw new Error("keystore passphrase must be at least 16 characters");
  return passphrase;
}

const path = process.env.ATELIER_WALLET_KEYSTORE_PATH?.trim() ||
  join(homedir(), ".hermes", "commerce-control", "secrets", "atelier-solana-wallet.keystore.json");

try {
  const passphrase = await readPassphrase();
  const created = createAtelierWalletKeystore(path, passphrase);
  console.log("ATELIER_WALLET_CREATION_AUTHORIZATION_USED=yes");
  console.log("WALLET_CREATED=yes");
  console.log(`WALLET_ADDRESS=${created.address}`);
  console.log(`KEYSTORE_PATH=${created.path}`);
  console.log("KEYSTORE_ENCRYPTED=yes");
  console.log("PRIVATE_KEY_PRINTED=no");
  console.log("SEED_PHRASE_CREATED=no");
  console.log("WALLET_SIGNATURE_CREATED=no");
  console.log("AGENT_REGISTRATION_EXECUTED=no");
  console.log("FINANCIAL_ACTION_EXECUTED=no");
  console.log("BLOCKCHAIN_TX_EXECUTED=no");
} catch (error) {
  console.error(`ATELIER_WALLET_CREATE_FAILED=${error instanceof Error ? error.message : String(error)}`);
  console.error("AGENT_REGISTRATION_EXECUTED=no");
  console.error("FINANCIAL_ACTION_EXECUTED=no");
  console.error("BLOCKCHAIN_TX_EXECUTED=no");
  process.exitCode = 1;
}
