#!/usr/bin/env node
import { chmodSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { writeAtelierAgentAuthKeystore } from "../src/atelier/agent-auth-store.js";
import {
  buildSignedAtelierRegistrationPayload,
  registerAtelierAgent,
} from "../src/atelier/registration-client.js";
import { loadAtelierWalletKeystore } from "../src/atelier/wallet-store.js";

if (process.env.ATELIER_REGISTRATION_APPROVED !== "yes") {
  console.error("ERROR: explicit Atelier registration approval is required");
  process.exit(2);
}

async function readPassphrase(): Promise<string> {
  let raw = "";
  for await (const chunk of process.stdin) raw += String(chunk);
  const passphrase = raw.replace(/[\r\n]+$/, "");
  if (passphrase.length < 16) throw new Error("keystore passphrase must be at least 16 characters");
  return passphrase;
}

const root = join(homedir(), ".hermes", "commerce-control");
const secretRoot = join(root, "secrets");
const walletPath = process.env.ATELIER_WALLET_KEYSTORE_PATH?.trim() || join(secretRoot, "atelier-solana-wallet.keystore.json");
const authPath = process.env.ATELIER_AGENT_AUTH_KEYSTORE_PATH?.trim() || join(secretRoot, "atelier-agent-auth.keystore.json");
const receiptPath = process.env.ATELIER_REGISTRATION_RECEIPT_PATH?.trim() || join(root, "receipts", "atelier-registration-attempt-1.json");

let registrationAttempted = false;
try {
  if (existsSync(authPath)) throw new Error("Atelier agent auth keystore already exists; refusing a second registration");
  if (existsSync(receiptPath)) throw new Error("Atelier registration one-shot receipt already exists; refusing retry");
  const passphrase = await readPassphrase();
  const wallet = loadAtelierWalletKeystore(walletPath, passphrase);
  try {
    const timestamp = Date.now();
    const payload = buildSignedAtelierRegistrationPayload({ privateKeyPkcs8: wallet.privateKeyPkcs8, address: wallet.address, timestamp });

    mkdirSync(dirname(receiptPath), { recursive: true, mode: 0o700 });
    chmodSync(dirname(receiptPath), 0o700);
    writeFileSync(receiptPath, `${JSON.stringify({ status: "armed", address: wallet.address, timestamp, createdAt: new Date().toISOString() }, null, 2)}\n`, {
      encoding: "utf8",
      mode: 0o600,
      flag: "wx",
    });

    console.log("ATELIER_REGISTRATION_AUTHORIZATION_USED=yes");
    console.log("ONE_SHOT_RECEIPT_ARMED=yes");
    console.log(`ONE_SHOT_RECEIPT_PATH=${receiptPath}`);
    console.log(`WALLET_ADDRESS=${wallet.address}`);
    console.log(`WALLET_SIG_TIMESTAMP=${timestamp}`);
    console.log("WALLET_AUTH_MESSAGE_TEMPLATE=atelier:${address}:${timestamp}");
    console.log("WALLET_SIGNATURE_CREATED=yes");
    console.log("REGISTRATION_PATH=https://api.useatelier.ai/api/agents/register");
    console.log("REGISTRATION_POST_MAX=1");

    registrationAttempted = true;
    const result = await registerAtelierAgent(payload);
    writeAtelierAgentAuthKeystore(authPath, passphrase, result.credentials);

    console.log("AGENT_REGISTRATION_EXECUTED=yes");
    console.log("AGENT_REGISTRATION_ACCEPTED=yes");
    console.log(`REGISTRATION_HTTP_STATUS=${result.status}`);
    console.log(`AGENT_ID=${result.credentials.agentId}`);
    console.log("API_KEY_CAPTURED=yes");
    console.log("API_KEY_PRINTED=no");
    console.log(`WEBHOOK_SECRET_CAPTURED=${result.credentials.webhookSecret ? "yes" : "no"}`);
    console.log("WEBHOOK_SECRET_PRINTED=no");
    console.log(`AGENT_AUTH_KEYSTORE_PATH=${authPath}`);
    console.log("AGENT_AUTH_KEYSTORE_ENCRYPTED=yes");
    console.log("SERVICE_LISTING_EXECUTED=no");
    console.log("FINANCIAL_ACTION_EXECUTED=no");
    console.log("BLOCKCHAIN_TX_EXECUTED=no");
    console.log("AUTOMATIC_RETRY_EXECUTED=no");
  } finally {
    wallet.privateKeyPkcs8.fill(0);
  }
} catch (error) {
  console.error(`ATELIER_REGISTRATION_FAILED=${error instanceof Error ? error.message : String(error)}`);
  console.error(`AGENT_REGISTRATION_EXECUTED=${registrationAttempted ? "attempted_once" : "no"}`);
  console.error("SERVICE_LISTING_EXECUTED=no");
  console.error("FINANCIAL_ACTION_EXECUTED=no");
  console.error("BLOCKCHAIN_TX_EXECUTED=no");
  console.error("AUTOMATIC_RETRY_EXECUTED=no");
  process.exitCode = 1;
}
