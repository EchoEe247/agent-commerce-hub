#!/usr/bin/env node
/**
 * Public, GET-only Atelier registration/service preflight.
 * No authentication, wallet signing, registration, service creation, or value movement.
 */
import {
  ATELIER_AGENT_PROFILE,
  buildReadmeSetupServicePayload,
} from "../src/atelier/marketplace-contract.js";

const API = "https://api.useatelier.ai";
const DOCS = "https://useatelier.ai";

type JsonObject = Record<string, unknown>;

function asObject(value: unknown): JsonObject {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonObject)
    : {};
}

function arrayOf(value: unknown): unknown[] {
  const body = asObject(value);
  const data = body.data ?? value;
  if (Array.isArray(data)) return data;
  const object = asObject(data);
  for (const key of ["agents", "services", "items", "results"]) {
    if (Array.isArray(object[key])) return object[key] as unknown[];
  }
  return [];
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

async function get(url: string): Promise<{ status: number; body: unknown }> {
  const response = await fetch(url, {
    method: "GET",
    redirect: "manual",
    headers: {
      Accept: "application/json,text/plain,text/html;q=0.8,*/*;q=0.5",
      "User-Agent": "agent-commerce-hub-readonly-atelier-registration-preflight/1.0",
    },
    signal: AbortSignal.timeout(20_000),
  });
  const raw = await response.text();
  let body: unknown = raw.slice(0, 2_000_000);
  if (raw.trim()) {
    try {
      body = JSON.parse(raw) as unknown;
    } catch {
      // Keep bounded text.
    }
  }
  return { status: response.status, body };
}

const service = buildReadmeSetupServicePayload();
const [agentsResponse, servicesResponse, statsResponse, registerDocs, authDocs, fulfillDocs] = await Promise.all([
  get(`${API}/api/agents?limit=500`),
  get(`${API}/api/services?limit=500`),
  get(`${API}/api/platform-stats`),
  get(`${DOCS}/docs/guides/register-an-agent`),
  get(`${DOCS}/docs/reference/authentication`),
  get(`${DOCS}/docs/guides/fulfill-orders`),
]);

const agents = arrayOf(agentsResponse.body);
const services = arrayOf(servicesResponse.body);
const nameMatches = agents.filter((entry) => {
  const object = asObject(entry);
  return text(object.name)?.toLowerCase() === ATELIER_AGENT_PROFILE.name.toLowerCase();
});
const titleMatches = services.filter((entry) => {
  const object = asObject(entry);
  return text(object.title)?.toLowerCase() === service.title.toLowerCase();
});

const docsText = [registerDocs.body, authDocs.body, fulfillDocs.body]
  .filter((value): value is string => typeof value === "string")
  .join("\n");
const registrationPathDocumented = docsText.includes("/api/agents/register");
const signatureFieldsDocumented = ["owner_wallet", "wallet_sig", "wallet_sig_ts"].every((field) => docsText.includes(field));
const pollingDocumented = docsText.includes("/orders?status=paid,in_progress") || docsText.includes("status=paid,in_progress");
const deliveryDocumented = docsText.includes("/deliver") && docsText.includes("deliverable_url");
const uploadMentioned = docsText.includes("/api/upload");

console.log(`AGENTS_HTTP_STATUS=${agentsResponse.status}`);
console.log(`SERVICES_HTTP_STATUS=${servicesResponse.status}`);
console.log(`PLATFORM_STATS_HTTP_STATUS=${statsResponse.status}`);
console.log(`REGISTER_DOCS_HTTP_STATUS=${registerDocs.status}`);
console.log(`AUTH_DOCS_HTTP_STATUS=${authDocs.status}`);
console.log(`FULFILL_DOCS_HTTP_STATUS=${fulfillDocs.status}`);
console.log(`PUBLIC_AGENT_SAMPLE_COUNT=${agents.length}`);
console.log(`PUBLIC_SERVICE_SAMPLE_COUNT=${services.length}`);
console.log(`CANDIDATE_AGENT_NAME=${ATELIER_AGENT_PROFILE.name}`);
console.log(`NAME_COLLISION_COUNT_IN_PUBLIC_SAMPLE=${nameMatches.length}`);
console.log(`NAME_COLLISION_FOUND=${nameMatches.length > 0 ? "yes" : "no_in_public_sample"}`);
console.log(`SERVICE_TITLE=${service.title}`);
console.log(`SERVICE_TITLE_COLLISION_COUNT_IN_PUBLIC_SAMPLE=${titleMatches.length}`);
console.log(`PLANNED_SERVICE_PAYLOAD=${JSON.stringify(service)}`);
console.log(`REGISTRATION_PATH=/api/agents/register`);
console.log(`REGISTRATION_PATH_DOCUMENTED=${registrationPathDocumented ? "yes" : "no"}`);
console.log(`REGISTRATION_OWNERSHIP_PATH=solana_wallet_signature`);
console.log(`REGISTRATION_SIGNATURE_FIELDS_DOCUMENTED=${signatureFieldsDocumented ? "yes" : "no"}`);
console.log(`REGISTRATION_COST_USD=0`);
console.log(`PLANNED_MARKETABLE=yes`);
console.log(`ENDPOINT_URL_PLANNED=none_polling`);
console.log(`SERVICE_CREATE_PATH=/api/agents/<agent_id>/services`);
console.log(`POLL_PATH=/api/agents/<agent_id>/orders?status=paid,in_progress,revision_requested`);
console.log(`POLLING_DOCUMENTED=${pollingDocumented ? "yes" : "no"}`);
console.log(`POLL_INTERVAL_SECONDS=120`);
console.log(`DELIVERY_PATH=/api/orders/<order_id>/deliver`);
console.log(`DELIVERY_DOCUMENTED=${deliveryDocumented ? "yes" : "no"}`);
console.log(`UPLOAD_ENDPOINT_MENTIONED=${uploadMentioned ? "yes" : "no"}`);
console.log("UPLOAD_SCHEMA_CONFIRMED=no");
console.log("WALLET_AUTH_MESSAGE_CONFIRMED=no");
console.log("LIVE_DELIVERY_READY=no_until_upload_schema_or_other_https_delivery_host");
console.log("AUTHENTICATION_USED=no");
console.log("HTTP_METHODS_USED=GET_ONLY");
console.log("WALLET_CREATED=no");
console.log("WALLET_SIGNATURE_CREATED=no");
console.log("AGENT_REGISTRATION_EXECUTED=no");
console.log("SERVICE_LISTING_EXECUTED=no");
console.log("FINANCIAL_ACTION_EXECUTED=no");
console.log("BLOCKCHAIN_TX_EXECUTED=no");
console.log("WRITE_ACTION_EXECUTED=no");
