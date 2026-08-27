#!/usr/bin/env node
import { chmodSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { buildSolanaRegistrationPayload } from "../src/atelier/marketplace-contract.js";
import { registerAtelierAgent } from "../src/atelier/registration-client.js";
import {
  getAtelierAccessHealth,
  getAtelierRegistrationSignature,
  storeAtelierAgentAuth,
} from "../src/security/atelier-access-client.js";

if (process.env.ATELIER_REGISTRATION_APPROVED !== "yes") {
  console.error("ERROR: explicit Atelier registration approval is required");
  process.exit(2);
}

const root = join(homedir(), ".hermes", "commerce-control");
const authPath = process.env.ATELIER_AGENT_AUTH_KEYSTORE_PATH?.trim() || join(root, "secrets", "atelier-agent-auth.keystore.json");
const receiptPath = process.env.ATELIER_REGISTRATION_RECEIPT_PATH?.trim() || join(root, "receipts", "atelier-registration-attempt-1.json");

let registrationAttempted = false;
try {
  if (existsSync(authPath)) throw new Error("Atelier agent auth keystore already exists; refusing a second registration");
  if (existsSync(receiptPath)) throw new Error("Atelier registration one-shot receipt already exists; refusing retry");

  const health = await getAtelierAccessHealth();
  if (!health.ok || health.chain !== "solana" || health.purpose !== "atelier-owner-payout") {
    throw new Error("Atelier access broker is not serving the dedicated Solana owner/payout wallet");
  }
  if (health.genericSigningEnabled) throw new Error("Atelier access broker unexpectedly exposes generic signing");
  if (health.agentAuthLoaded) throw new Error("Atelier access broker already has agent auth; refusing another registration");

  const signature = await getAtelierRegistrationSignature();
  if (signature.address !== health.address) throw new Error("Atelier broker signature address mismatch");
  if (signature.messageTemplate !== "atelier:${address}:${timestamp}") throw new Error("Atelier broker returned an unexpected signing template");

  const payload = buildSolanaRegistrationPayload({
    ownerWallet: signature.address,
    walletSignature: signature.signatureBase58,
    walletSignatureTimestamp: signature.timestamp,
  });

  mkdirSync(dirname(receiptPath), { recursive: true, mode: 0o700 });
  chmodSync(dirname(receiptPath), 0o700);
  writeFileSync(receiptPath, `${JSON.stringify({ status: "armed", address: signature.address, timestamp: signature.timestamp, createdAt: new Date().toISOString() }, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
    flag: "wx",
  });

  console.log("ATELIER_REGISTRATION_AUTHORIZATION_USED=yes");
  console.log("AUTH_SOURCE=atelier_access_broker");
  console.log("ONE_SHOT_RECEIPT_ARMED=yes");
  console.log(`ONE_SHOT_RECEIPT_PATH=${receiptPath}`);
  console.log(`WALLET_ADDRESS=${signature.address}`);
  console.log(`WALLET_SIG_TIMESTAMP=${signature.timestamp}`);
  console.log("WALLET_AUTH_MESSAGE_TEMPLATE=atelier:${address}:${timestamp}");
  console.log("WALLET_SIGNATURE_CREATED=yes");
  console.log("REGISTRATION_PATH=https://api.useatelier.ai/api/agents/register");
  console.log("REGISTRATION_POST_MAX=1");

  registrationAttempted = true;
  const result = await registerAtelierAgent(payload);

  let authStored = false;
  try {
    const stored = await storeAtelierAgentAuth(result.credentials);
    authStored = stored.agentId === result.credentials.agentId;
  } catch (error) {
    const after = await getAtelierAccessHealth().catch(() => null);
    if (after?.agentAuthLoaded && after.agentId === result.credentials.agentId) {
      authStored = true;
    } else {
      throw error;
    }
  }
  if (!authStored) throw new Error("Atelier registration succeeded but agent auth persistence could not be confirmed");

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
} catch (error) {
  console.error(`ATELIER_REGISTRATION_FAILED=${error instanceof Error ? error.message : String(error)}`);
  console.error(`AGENT_REGISTRATION_EXECUTED=${registrationAttempted ? "attempted_once" : "no"}`);
  console.error("SERVICE_LISTING_EXECUTED=no");
  console.error("FINANCIAL_ACTION_EXECUTED=no");
  console.error("BLOCKCHAIN_TX_EXECUTED=no");
  console.error("AUTOMATIC_RETRY_EXECUTED=no");
  process.exitCode = 1;
}
