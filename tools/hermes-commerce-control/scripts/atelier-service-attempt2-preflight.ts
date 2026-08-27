#!/usr/bin/env node
/**
 * Read-only preflight for a corrected second Atelier service-create attempt.
 * No POST/PATCH/DELETE and no receipt/state mutation.
 */
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { buildReadmeSetupServicePayload } from "../src/atelier/marketplace-contract.js";
import { getAtelierAccessHealth } from "../src/security/atelier-access-client.js";

const EXPECTED_AGENT_ID = "ext_1787846304418_aih6mxxec";
const root = join(homedir(), ".hermes", "commerce-control");
const attempt1ReceiptPath = join(root, "receipts", "atelier-service-create-attempt-1.json");
const attempt2ReceiptPath = join(root, "receipts", "atelier-service-create-attempt-2.json");
const serviceStatePath = join(root, "state", "atelier-readme-service.json");

function parseJsonArray(value: string): unknown[] {
  const parsed: unknown = JSON.parse(value);
  if (!Array.isArray(parsed)) throw new Error("expected JSON-encoded array");
  return parsed;
}

const health = await getAtelierAccessHealth();
const payload = buildReadmeSetupServicePayload();
const deliverables = parseJsonArray(payload.deliverables);
const requirements = parseJsonArray(payload.requirement_fields);
const attempt1Exists = existsSync(attempt1ReceiptPath);
const attempt2Exists = existsSync(attempt2ReceiptPath);
const serviceStateExists = existsSync(serviceStatePath);

let attempt1Status = "unknown";
let attempt1AgentId = "unknown";
if (attempt1Exists) {
  const receipt = JSON.parse(readFileSync(attempt1ReceiptPath, "utf8")) as Record<string, unknown>;
  attempt1Status = typeof receipt.status === "string" ? receipt.status : "unknown";
  attempt1AgentId = typeof receipt.agentId === "string" ? receipt.agentId : "unknown";
}

const requirementsValid = requirements.length === 2 && requirements.every((value) => {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const field = value as Record<string, unknown>;
  return typeof field.label === "string" &&
    typeof field.type === "string" &&
    typeof field.required === "boolean" &&
    !("key" in field) &&
    !("description" in field);
});

const correctedWireShape =
  typeof payload.price_usd === "string" &&
  typeof payload.deliverables === "string" &&
  typeof payload.requirement_fields === "string" &&
  deliverables.length > 0 &&
  requirementsValid;

const brokerReady = health.ok &&
  health.chain === "solana" &&
  health.purpose === "atelier-owner-payout" &&
  health.agentAuthLoaded &&
  health.agentId === EXPECTED_AGENT_ID &&
  !health.genericSigningEnabled;

const cleanAttempt2State = attempt1Exists && !attempt2Exists && !serviceStateExists;
const ready = brokerReady && cleanAttempt2State && correctedWireShape;

console.log(`BRANCH_EXPECTED_AGENT_ID=${EXPECTED_AGENT_ID}`);
console.log(`ATELIER_ACCESS_BROKER_AVAILABLE=${health.ok ? "yes" : "no"}`);
console.log(`WALLET_ADDRESS=${health.address}`);
console.log(`CHAIN=${health.chain}`);
console.log(`PURPOSE=${health.purpose}`);
console.log(`AGENT_AUTH_LOADED=${health.agentAuthLoaded ? "yes" : "no"}`);
console.log(`AGENT_ID=${health.agentId ?? "none"}`);
console.log(`GENERIC_SIGNING_ENABLED=${health.genericSigningEnabled ? "yes" : "no"}`);
console.log(`ATTEMPT1_RECEIPT_EXISTS=${attempt1Exists ? "yes" : "no"}`);
console.log(`ATTEMPT1_RECEIPT_STATUS=${attempt1Status}`);
console.log(`ATTEMPT1_RECEIPT_AGENT_ID=${attempt1AgentId}`);
console.log(`ATTEMPT2_RECEIPT_EXISTS=${attempt2Exists ? "yes" : "no"}`);
console.log(`SERVICE_STATE_EXISTS=${serviceStateExists ? "yes" : "no"}`);
console.log(`SERVICE_TITLE=${payload.title}`);
console.log(`SERVICE_PRICE_USD=${payload.price_usd}`);
console.log(`SERVICE_PRICE_TYPE=${payload.price_type}`);
console.log(`SERVICE_CATEGORY=${payload.category}`);
console.log(`SERVICE_TURNAROUND_HOURS=${payload.turnaround_hours}`);
console.log(`SERVICE_MAX_REVISIONS=${payload.max_revisions}`);
console.log(`DELIVERABLES_WIRE_TYPE=${typeof payload.deliverables}`);
console.log(`DELIVERABLES_DECODED=${JSON.stringify(deliverables)}`);
console.log(`REQUIREMENT_FIELDS_WIRE_TYPE=${typeof payload.requirement_fields}`);
console.log(`REQUIREMENT_FIELDS_DECODED=${JSON.stringify(requirements)}`);
console.log(`CORRECTED_WIRE_SHAPE=${correctedWireShape ? "yes" : "no"}`);
console.log(`BROKER_READY=${brokerReady ? "yes" : "no"}`);
console.log(`CLEAN_ATTEMPT2_STATE=${cleanAttempt2State ? "yes" : "no"}`);
console.log(`READY_FOR_SERVICE_ATTEMPT2_AUTHORIZATION=${ready ? "yes" : "no"}`);
console.log("HTTP_METHODS_USED=LOCAL_PLUS_BROKER_HEALTH_ONLY");
console.log("SERVICE_CREATE_POST_EXECUTED=no");
console.log("SERVICE_RECEIPT_MODIFIED=no");
console.log("SERVICE_STATE_MODIFIED=no");
console.log("ORDER_ACTION_EXECUTED=no");
console.log("FINANCIAL_ACTION_EXECUTED=no");
console.log("BLOCKCHAIN_TX_EXECUTED=no");
console.log("EXTERNAL_WRITE_ACTION_EXECUTED=no");
