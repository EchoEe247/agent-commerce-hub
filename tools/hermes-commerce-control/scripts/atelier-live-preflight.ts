#!/usr/bin/env node
/**
 * Read-only Atelier marketplace preflight.
 *
 * Purpose: validate live public marketplace/demand surfaces before any agent
 * registration or wallet-authenticated write. GET requests only; no auth,
 * signing, registration, order placement, payment, or value movement.
 */

const API = "https://api.useatelier.ai";

type JsonObject = Record<string, unknown>;

interface Result {
  readonly url: string;
  readonly status: number;
  readonly body: unknown;
}

function asObject(value: unknown): JsonObject {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonObject)
    : {};
}

function finite(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function text(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return null;
}

function sanitize(value: unknown, depth = 0): unknown {
  if (depth > 5) return "[depth-limited]";
  if (Array.isArray(value)) return value.slice(0, 30).map((x) => sanitize(x, depth + 1));
  if (value !== null && typeof value === "object") {
    const out: JsonObject = {};
    for (const [key, child] of Object.entries(value as JsonObject)) {
      if (/api[_-]?key|secret|token|signature|private|mnemonic|seed/i.test(key)) continue;
      out[key] = sanitize(child, depth + 1);
    }
    return out;
  }
  if (typeof value === "string") return value.replace(/\s+/g, " ").slice(0, 1200);
  return value;
}

async function get(url: string): Promise<Result> {
  const response = await fetch(url, {
    method: "GET",
    redirect: "manual",
    headers: {
      Accept: "application/json,text/plain;q=0.9,*/*;q=0.8",
      "User-Agent": "agent-commerce-hub-readonly-atelier-preflight/1.0",
    },
    signal: AbortSignal.timeout(20_000),
  });
  const raw = await response.text();
  let body: unknown = raw;
  if (raw.trim()) {
    try {
      body = JSON.parse(raw) as unknown;
    } catch {
      body = raw.slice(0, 20_000);
    }
  }
  return { url, status: response.status, body };
}

function dataOf(body: unknown): unknown {
  const obj = asObject(body);
  return obj.data ?? body;
}

function arrayOf(body: unknown): unknown[] {
  const data = dataOf(body);
  if (Array.isArray(data)) return data;
  const obj = asObject(data);
  for (const key of ["items", "agents", "services", "bounties", "results"]) {
    if (Array.isArray(obj[key])) return obj[key] as unknown[];
  }
  return [];
}

function summarizeEntries(entries: unknown[], limit = 20): unknown[] {
  return entries.slice(0, limit).map((entry) => {
    const obj = asObject(entry);
    const keys = [
      "id", "slug", "name", "title", "category", "status", "price", "price_usd",
      "price_type", "budget", "budget_usdc", "reward", "reward_usd", "currency",
      "total_orders", "completed_orders", "rating", "agent_id", "service_id",
      "created_at", "updated_at", "deadline", "marketable", "x402_enabled",
    ];
    const out: JsonObject = {};
    for (const key of keys) if (obj[key] !== undefined) out[key] = sanitize(obj[key]);
    return out;
  });
}

function stat(body: unknown, ...keys: string[]): number | null {
  const root = asObject(dataOf(body));
  for (const key of keys) {
    const n = finite(root[key]);
    if (n !== null) return n;
  }
  return null;
}

const endpoints = {
  platformStats: `${API}/api/platform-stats`,
  agents: `${API}/api/agents`,
  x402Services: `${API}/api/x402/services`,
  x402Trending: `${API}/api/x402/trending`,
  bounties: `${API}/api/bounties`,
  openBounties: `${API}/api/bounties?status=open`,
  openapi: `${API}/openapi.json`,
  manifest: `${API}/.well-known/x402`,
} as const;

const results = await Promise.all(
  Object.entries(endpoints).map(async ([name, url]) => {
    try {
      return [name, await get(url)] as const;
    } catch (error) {
      return [name, { url, status: 0, body: `fetch error: ${String(error).slice(0, 500)}` }] as const;
    }
  }),
);

const byName = Object.fromEntries(results) as Record<string, Result>;
for (const [name, result] of results) {
  console.log(`${name.toUpperCase()}_HTTP_STATUS=${result.status}`);
}

const stats = byName.platformStats?.body;
console.log(`PLATFORM_STATS_SANITIZED=${JSON.stringify(sanitize(stats)).slice(0, 10000)}`);
console.log(`PLATFORM_TOTAL_AGENTS=${stat(stats, "total_agents", "agents", "agent_count") ?? "unknown"}`);
console.log(`PLATFORM_TOTAL_SERVICES=${stat(stats, "total_services", "services", "service_count") ?? "unknown"}`);
console.log(`PLATFORM_TOTAL_ORDERS=${stat(stats, "total_orders", "orders", "order_count") ?? "unknown"}`);
console.log(`PLATFORM_COMPLETED_ORDERS=${stat(stats, "completed_orders", "orders_completed", "settled_orders") ?? "unknown"}`);
console.log(`PLATFORM_X402_PAYMENTS=${stat(stats, "x402_payments", "x402_count", "total_x402_payments") ?? "unknown"}`);

const agents = arrayOf(byName.agents?.body);
const services = arrayOf(byName.x402Services?.body);
const trending = arrayOf(byName.x402Trending?.body);
const bounties = arrayOf(byName.bounties?.body);
const openBounties = arrayOf(byName.openBounties?.body);

console.log(`PUBLIC_AGENT_COUNT=${agents.length}`);
console.log(`PUBLIC_AGENT_SAMPLE=${JSON.stringify(summarizeEntries(agents, 10))}`);
console.log(`X402_SERVICE_COUNT=${services.length}`);
console.log(`X402_SERVICE_SAMPLE=${JSON.stringify(summarizeEntries(services, 20))}`);
console.log(`X402_TRENDING_COUNT=${trending.length}`);
console.log(`X402_TRENDING_SAMPLE=${JSON.stringify(summarizeEntries(trending, 20))}`);
console.log(`BOUNTY_COUNT=${bounties.length}`);
console.log(`BOUNTY_SAMPLE=${JSON.stringify(summarizeEntries(bounties, 20))}`);
console.log(`OPEN_BOUNTY_COUNT=${openBounties.length}`);
console.log(`OPEN_BOUNTY_SAMPLE=${JSON.stringify(summarizeEntries(openBounties, 20))}`);

const openapi = asObject(byName.openapi?.body);
const paths = asObject(openapi.paths);
const registrationPath = paths["/api/agents/register"];
const bountiesPath = paths["/api/bounties"];
console.log(`OPENAPI_PATH_COUNT=${Object.keys(paths).length}`);
console.log(`OPENAPI_REGISTER_PATH_PRESENT=${registrationPath ? "yes" : "no"}`);
console.log(`OPENAPI_BOUNTIES_PATH_PRESENT=${bountiesPath ? "yes" : "no"}`);
console.log(`OPENAPI_RELEVANT_PATHS=${JSON.stringify(Object.keys(paths).filter((p) => /agents\/register|services|orders|bount|x402/i.test(p)).slice(0, 100))}`);

console.log(`X402_MANIFEST_SANITIZED=${JSON.stringify(sanitize(byName.manifest?.body)).slice(0, 10000)}`);
console.log("AUTHENTICATION_USED=no");
console.log("HTTP_METHODS_USED=GET_ONLY");
console.log("AGENT_REGISTRATION_EXECUTED=no");
console.log("SERVICE_LISTING_EXECUTED=no");
console.log("ORDER_ACTION_EXECUTED=no");
console.log("BOUNTY_ACTION_EXECUTED=no");
console.log("FINANCIAL_ACTION_EXECUTED=no");
console.log("BLOCKCHAIN_TX_EXECUTED=no");
