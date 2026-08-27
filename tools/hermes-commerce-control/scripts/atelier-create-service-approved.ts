#!/usr/bin/env node
import { chmodSync, existsSync, mkdirSync, renameSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { AtelierApiClient } from "../src/atelier/api-client.js";
import { buildReadmeSetupServicePayload } from "../src/atelier/marketplace-contract.js";
import { getAtelierApiSession } from "../src/security/atelier-access-client.js";

if (process.env.ATELIER_SERVICE_LISTING_APPROVED !== "yes") {
  console.error("ERROR: explicit Atelier service-listing approval is required");
  process.exit(2);
}

type JsonObject = Record<string, unknown>;
function asObject(value: unknown): JsonObject {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? (value as JsonObject) : {};
}
function boundedBody(value: unknown): string {
  if (typeof value === "string") return value.replace(/\s+/g, " ").slice(0, 1200);
  try { return JSON.stringify(value).slice(0, 1200); } catch { return "unreadable response body"; }
}
function serviceIdFrom(body: unknown): string | null {
  const root = asObject(body);
  const data = asObject(root.data ?? body);
  const service = asObject(data.service ?? root.service);
  for (const value of [data.service_id, data.serviceId, data.id, service.id, root.service_id, root.serviceId]) {
    if (typeof value === "string" && /^[A-Za-z0-9_-]+$/.test(value.trim())) return value.trim();
  }
  return null;
}
function writeState(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  chmodSync(dirname(path), 0o700);
  const tmp = `${path}.tmp-${process.pid}-${Date.now()}`;
  writeFileSync(tmp, `${JSON.stringify(value, null, 2)}\n`, { encoding: "utf8", mode: 0o600, flag: "wx" });
  renameSync(tmp, path);
  chmodSync(path, 0o600);
}

const root = join(homedir(), ".hermes", "commerce-control");
const statePath = process.env.ATELIER_SERVICE_STATE_PATH?.trim() || join(root, "state", "atelier-readme-service.json");
const receiptPath = process.env.ATELIER_SERVICE_RECEIPT_PATH?.trim() || join(root, "receipts", "atelier-service-create-attempt-1.json");

let postAttempted = false;
try {
  if (existsSync(statePath)) throw new Error("Atelier service state already exists; refusing duplicate listing");
  if (existsSync(receiptPath)) throw new Error("Atelier service one-shot receipt already exists; refusing retry");
  const credentials = await getAtelierApiSession();
  const payload = buildReadmeSetupServicePayload();

  mkdirSync(dirname(receiptPath), { recursive: true, mode: 0o700 });
  chmodSync(dirname(receiptPath), 0o700);
  writeFileSync(receiptPath, `${JSON.stringify({ status: "armed", agentId: credentials.agentId, title: payload.title, createdAt: new Date().toISOString() }, null, 2)}\n`, {
    encoding: "utf8", mode: 0o600, flag: "wx",
  });

  console.log("ATELIER_SERVICE_LISTING_AUTHORIZATION_USED=yes");
  console.log("AUTH_SOURCE=atelier_access_broker");
  console.log("ONE_SHOT_RECEIPT_ARMED=yes");
  console.log(`AGENT_ID=${credentials.agentId}`);
  console.log(`SERVICE_TITLE=${payload.title}`);
  console.log(`SERVICE_PRICE_USD=${payload.price_usd}`);
  console.log("SERVICE_CREATE_POST_MAX=1");

  const client = new AtelierApiClient({ apiKey: credentials.apiKey });
  postAttempted = true;
  const response = await client.createService(credentials.agentId, payload);
  if (response.status < 200 || response.status >= 300) {
    console.error(`SERVICE_CREATE_ERROR_BODY=${boundedBody(response.body)}`);
    throw new Error(`Atelier service creation failed HTTP ${response.status}`);
  }
  const serviceId = serviceIdFrom(response.body);
  if (!serviceId) throw new Error("Atelier service creation succeeded but response service id is missing");
  writeState(statePath, {
    agentId: credentials.agentId,
    serviceId,
    title: payload.title,
    priceUsd: payload.price_usd,
    createdAt: new Date().toISOString(),
  });

  console.log("SERVICE_LISTING_EXECUTED=yes");
  console.log("SERVICE_LISTING_ACCEPTED=yes");
  console.log(`SERVICE_CREATE_HTTP_STATUS=${response.status}`);
  console.log(`SERVICE_ID=${serviceId}`);
  console.log(`SERVICE_STATE_PATH=${statePath}`);
  console.log("ORDER_ACTION_EXECUTED=no");
  console.log("FINANCIAL_ACTION_EXECUTED=no");
  console.log("BLOCKCHAIN_TX_EXECUTED=no");
  console.log("AUTOMATIC_RETRY_EXECUTED=no");
} catch (error) {
  console.error(`ATELIER_SERVICE_CREATE_FAILED=${error instanceof Error ? error.message : String(error)}`);
  console.error(`SERVICE_LISTING_EXECUTED=${postAttempted ? "attempted_once" : "no"}`);
  console.error("ORDER_ACTION_EXECUTED=no");
  console.error("FINANCIAL_ACTION_EXECUTED=no");
  console.error("BLOCKCHAIN_TX_EXECUTED=no");
  console.error("AUTOMATIC_RETRY_EXECUTED=no");
  process.exitCode = 1;
}
