#!/usr/bin/env node
/**
 * Read-only Atelier service-contract forensics after a failed create attempt.
 * External methods: GET only. Uses broker API session only for authenticated GETs.
 */
import { homedir } from "node:os";
import { join } from "node:path";
import { existsSync, readFileSync } from "node:fs";
import { buildReadmeSetupServicePayload } from "../src/atelier/marketplace-contract.js";
import { getAtelierApiSession } from "../src/security/atelier-access-client.js";

const API = "https://api.useatelier.ai";
const AGENT_ID = "ext_1787846304418_aih6mxxec";

type JsonObject = Record<string, unknown>;
function asObject(value: unknown): JsonObject {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as JsonObject : {};
}
function arrayFrom(value: unknown): unknown[] {
  const root = asObject(value);
  const data = root.data ?? value;
  if (Array.isArray(data)) return data;
  const obj = asObject(data);
  for (const key of ["services", "items", "results"]) {
    if (Array.isArray(obj[key])) return obj[key] as unknown[];
  }
  return [];
}
function safeJson(value: unknown): string {
  try { return JSON.stringify(value); } catch { return "<unserializable>"; }
}
function keySet(value: unknown): string[] {
  return Object.keys(asObject(value)).sort();
}
async function getJson(url: string, apiKey?: string): Promise<{ status: number; body: unknown }> {
  const response = await fetch(url, {
    method: "GET",
    redirect: "manual",
    headers: {
      Accept: "application/json",
      ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
      "User-Agent": "agent-commerce-hub-atelier-service-contract-forensics/1.0",
    },
    signal: AbortSignal.timeout(20_000),
  });
  const raw = await response.text();
  let body: unknown = raw.slice(0, 500_000);
  if (raw.trim()) {
    try { body = JSON.parse(raw) as unknown; } catch {}
  }
  return { status: response.status, body };
}

const session = await getAtelierApiSession();
if (session.agentId !== AGENT_ID) throw new Error(`unexpected broker agent id ${session.agentId}`);

const payload = buildReadmeSetupServicePayload();
const root = join(homedir(), ".hermes", "commerce-control");
const receiptPath = join(root, "receipts", "atelier-service-create-attempt-1.json");
const statePath = join(root, "state", "atelier-readme-service.json");

const [me, ownServices, publicServices] = await Promise.all([
  getJson(`${API}/api/agents/me`, session.apiKey),
  getJson(`${API}/api/agents/${encodeURIComponent(AGENT_ID)}/services`, session.apiKey),
  getJson(`${API}/api/services?limit=500`),
]);

const services = arrayFrom(publicServices.body);
const own = arrayFrom(ownServices.body);
const requirementSamples = services
  .map((service) => asObject(service).requirement_fields)
  .filter((value) => value !== undefined && value !== null)
  .slice(0, 20);

const requirementShapeCounts = new Map<string, number>();
for (const value of requirementSamples) {
  const shape = Array.isArray(value)
    ? `array:${value.map((item) => keySet(item).join(",")).join("|")}`
    : `object:${keySet(value).join(",")}`;
  requirementShapeCounts.set(shape, (requirementShapeCounts.get(shape) ?? 0) + 1);
}

const serviceFieldShapeCounts = new Map<string, number>();
for (const service of services.slice(0, 100)) {
  const shape = keySet(service).join(",");
  serviceFieldShapeCounts.set(shape, (serviceFieldShapeCounts.get(shape) ?? 0) + 1);
}

const priceTypeCounts = new Map<string, number>();
for (const service of services.slice(0, 100)) {
  const value = asObject(service).price_usd;
  const label = `${typeof value}:${String(value)}`;
  priceTypeCounts.set(label, (priceTypeCounts.get(label) ?? 0) + 1);
}

console.log(`AGENT_ID=${AGENT_ID}`);
console.log(`BROKER_AGENT_ID=${session.agentId}`);
console.log(`AGENT_ME_HTTP_STATUS=${me.status}`);
console.log(`OWN_SERVICES_HTTP_STATUS=${ownServices.status}`);
console.log(`PUBLIC_SERVICES_HTTP_STATUS=${publicServices.status}`);
console.log(`OWN_SERVICE_COUNT=${own.length}`);
console.log(`PUBLIC_SERVICE_SAMPLE_COUNT=${services.length}`);
console.log(`SERVICE_RECEIPT_EXISTS=${existsSync(receiptPath) ? "yes" : "no"}`);
console.log(`SERVICE_STATE_EXISTS=${existsSync(statePath) ? "yes" : "no"}`);
console.log(`PLANNED_PAYLOAD=${safeJson(payload)}`);
console.log(`PLANNED_PAYLOAD_KEYS=${Object.keys(payload).sort().join(",")}`);
console.log(`PLANNED_REQUIREMENT_FIELDS_TYPE=${Array.isArray(payload.requirement_fields) ? "array" : typeof payload.requirement_fields}`);
console.log(`PLANNED_REQUIREMENT_FIELD_KEYS=${payload.requirement_fields.map((field) => Object.keys(field).sort().join(",")).join("|")}`);
console.log(`PUBLIC_REQUIREMENT_SAMPLE_COUNT=${requirementSamples.length}`);
console.log(`PUBLIC_REQUIREMENT_SHAPES=${safeJson(Object.fromEntries(requirementShapeCounts))}`);
console.log(`PUBLIC_SERVICE_FIELD_SHAPES=${safeJson(Object.fromEntries(serviceFieldShapeCounts))}`);
console.log(`PUBLIC_PRICE_TYPES=${safeJson(Object.fromEntries(priceTypeCounts))}`);

for (let i = 0; i < requirementSamples.length; i += 1) {
  const value = requirementSamples[i];
  console.log(`REQUIREMENT_SAMPLE_${i + 1}=${safeJson(value)}`);
}

for (let i = 0; i < Math.min(5, services.length); i += 1) {
  const service = asObject(services[i]);
  console.log(`SERVICE_SAMPLE_${i + 1}_ID=${String(service.id ?? service.service_id ?? "unknown")}`);
  console.log(`SERVICE_SAMPLE_${i + 1}_TITLE=${String(service.title ?? "unknown")}`);
  console.log(`SERVICE_SAMPLE_${i + 1}_PRICE_TYPE=${typeof service.price_usd}`);
  console.log(`SERVICE_SAMPLE_${i + 1}_DELIVERABLES=${safeJson(service.deliverables)}`);
}

if (existsSync(receiptPath)) {
  const receipt = JSON.parse(readFileSync(receiptPath, "utf8")) as unknown;
  console.log(`SERVICE_RECEIPT_METADATA=${safeJson(receipt)}`);
}

console.log("HTTP_METHODS_USED=GET_ONLY");
console.log("SERVICE_CREATE_POST_EXECUTED=no");
console.log("SERVICE_RECEIPT_MODIFIED=no");
console.log("SERVICE_STATE_MODIFIED=no");
console.log("FINANCIAL_ACTION_EXECUTED=no");
console.log("BLOCKCHAIN_TX_EXECUTED=no");
console.log("EXTERNAL_WRITE_ACTION_EXECUTED=no");
