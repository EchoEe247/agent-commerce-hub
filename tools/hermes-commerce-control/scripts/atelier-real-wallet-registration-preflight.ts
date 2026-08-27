#!/usr/bin/env node
/**
 * Read-only preflight for the real dedicated Atelier wallet.
 * Uses the local unlock-once broker for health only and public Atelier GETs.
 * It does not request a signature or perform any external write.
 */
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { ATELIER_AGENT_PROFILE, buildReadmeSetupServicePayload } from "../src/atelier/marketplace-contract.js";
import { getAtelierAccessHealth } from "../src/security/atelier-access-client.js";

const API = "https://api.useatelier.ai";

type JsonObject = Record<string, unknown>;
function asObject(value: unknown): JsonObject {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as JsonObject : {};
}
function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
function arrayOf(value: unknown): unknown[] {
  const root = asObject(value);
  const data = root.data ?? value;
  if (Array.isArray(data)) return data;
  const object = asObject(data);
  for (const key of ["agents", "services", "items", "results"]) {
    if (Array.isArray(object[key])) return object[key] as unknown[];
  }
  return [];
}
async function publicGet(url: string): Promise<{ status: number; body: unknown }> {
  const response = await fetch(url, {
    method: "GET",
    redirect: "manual",
    headers: {
      Accept: "application/json",
      "User-Agent": "agent-commerce-hub-readonly-atelier-real-wallet-preflight/1.0",
    },
    signal: AbortSignal.timeout(20_000),
  });
  const raw = await response.text();
  let body: unknown = raw.slice(0, 2_000_000);
  try { if (raw.trim()) body = JSON.parse(raw) as unknown; } catch {}
  return { status: response.status, body };
}

const root = join(homedir(), ".hermes", "commerce-control");
const walletPath = join(root, "secrets", "atelier-solana-wallet.keystore.json");
const authPath = join(root, "secrets", "atelier-agent-auth.keystore.json");
const registrationReceiptPath = join(root, "receipts", "atelier-registration-attempt-1.json");
const serviceStatePath = join(root, "state", "atelier-readme-service.json");
const service = buildReadmeSetupServicePayload();

let brokerHealth: Awaited<ReturnType<typeof getAtelierAccessHealth>> | null = null;
let brokerError: string | null = null;
try {
  brokerHealth = await getAtelierAccessHealth();
} catch (error) {
  brokerError = error instanceof Error ? error.message : String(error);
}

const [agentsResponse, servicesResponse] = await Promise.all([
  publicGet(`${API}/api/agents?limit=500`),
  publicGet(`${API}/api/services?limit=500`),
]);
const agents = arrayOf(agentsResponse.body);
const services = arrayOf(servicesResponse.body);
const nameMatches = agents.filter((entry) => text(asObject(entry).name)?.toLowerCase() === ATELIER_AGENT_PROFILE.name.toLowerCase());
const titleMatches = services.filter((entry) => text(asObject(entry).title)?.toLowerCase() === service.title.toLowerCase());

const walletExists = existsSync(walletPath);
const authExists = existsSync(authPath);
const receiptExists = existsSync(registrationReceiptPath);
const serviceStateExists = existsSync(serviceStatePath);
const brokerReady = brokerHealth !== null &&
  brokerHealth.ok &&
  brokerHealth.chain === "solana" &&
  brokerHealth.purpose === "atelier-owner-payout" &&
  brokerHealth.genericSigningEnabled === false;
const cleanRegistrationState = !authExists && !receiptExists && !serviceStateExists && brokerHealth?.agentAuthLoaded === false;
const noPublicCollision = nameMatches.length === 0 && titleMatches.length === 0;
const publicReadsHealthy = agentsResponse.status === 200 && servicesResponse.status === 200;
const ready = walletExists && brokerReady && cleanRegistrationState && noPublicCollision && publicReadsHealthy;

console.log(`ATELIER_ACCESS_BROKER_AVAILABLE=${brokerHealth ? "yes" : "no"}`);
console.log(`ATELIER_ACCESS_BROKER_ERROR=${brokerError ?? "none"}`);
console.log(`WALLET_ADDRESS=${brokerHealth?.address ?? "unknown"}`);
console.log(`BROKER_CHAIN=${brokerHealth?.chain ?? "unknown"}`);
console.log(`BROKER_PURPOSE=${brokerHealth?.purpose ?? "unknown"}`);
console.log(`BROKER_IDLE_TIMEOUT_MINUTES=${brokerHealth?.idleTimeoutMinutes ?? "unknown"}`);
console.log(`BROKER_GENERIC_SIGNING_ENABLED=${brokerHealth ? (brokerHealth.genericSigningEnabled ? "yes" : "no") : "unknown"}`);
console.log(`BROKER_AGENT_AUTH_LOADED=${brokerHealth ? (brokerHealth.agentAuthLoaded ? "yes" : "no") : "unknown"}`);
console.log(`BROKER_AGENT_ID=${brokerHealth?.agentId ?? "none"}`);
console.log(`REAL_WALLET_KEYSTORE_EXISTS=${walletExists ? "yes" : "no"}`);
console.log(`REAL_AGENT_AUTH_KEYSTORE_EXISTS=${authExists ? "yes" : "no"}`);
console.log(`REGISTRATION_ONE_SHOT_RECEIPT_EXISTS=${receiptExists ? "yes" : "no"}`);
console.log(`SERVICE_STATE_EXISTS=${serviceStateExists ? "yes" : "no"}`);
console.log(`AGENTS_HTTP_STATUS=${agentsResponse.status}`);
console.log(`SERVICES_HTTP_STATUS=${servicesResponse.status}`);
console.log(`PUBLIC_AGENT_SAMPLE_COUNT=${agents.length}`);
console.log(`PUBLIC_SERVICE_SAMPLE_COUNT=${services.length}`);
console.log(`CANDIDATE_AGENT_NAME=${ATELIER_AGENT_PROFILE.name}`);
console.log(`NAME_COLLISION_COUNT=${nameMatches.length}`);
console.log(`SERVICE_TITLE=${service.title}`);
console.log(`SERVICE_TITLE_COLLISION_COUNT=${titleMatches.length}`);
console.log(`SERVICE_PRICE_USD=${service.price_usd}`);
console.log("REGISTRATION_PATH=https://api.useatelier.ai/api/agents/register");
console.log("REGISTRATION_AUTH_SOURCE=atelier_access_broker");
console.log("REGISTRATION_SIGNATURE_REQUEST_EXECUTED=no");
console.log("WALLET_PASSPHRASE_REQUIRED_BY_HERMES=no_while_broker_is_unlocked");
console.log(`BROKER_READY=${brokerReady ? "yes" : "no"}`);
console.log(`CLEAN_REGISTRATION_STATE=${cleanRegistrationState ? "yes" : "no"}`);
console.log(`NO_PUBLIC_NAME_OR_SERVICE_COLLISION=${noPublicCollision ? "yes" : "no"}`);
console.log(`READY_FOR_REGISTRATION_AUTHORIZATION=${ready ? "yes" : "no"}`);
console.log("HTTP_METHODS_USED=GET_ONLY");
console.log("AUTHENTICATED_ATELIER_REQUEST_EXECUTED=no");
console.log("WALLET_SIGNATURE_CREATED=no");
console.log("AGENT_REGISTRATION_EXECUTED=no");
console.log("SERVICE_LISTING_EXECUTED=no");
console.log("FINANCIAL_ACTION_EXECUTED=no");
console.log("BLOCKCHAIN_TX_EXECUTED=no");
console.log("EXTERNAL_WRITE_ACTION_EXECUTED=no");
