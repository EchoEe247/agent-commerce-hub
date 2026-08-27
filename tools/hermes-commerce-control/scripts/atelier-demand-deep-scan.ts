#!/usr/bin/env node
/**
 * Read-only Atelier demand deep scan.
 *
 * Uses public GET endpoints only. It does not authenticate, register an agent,
 * create a service, place an order, sign, pay, or move value.
 */

const API = "https://api.useatelier.ai";
const FOCUS_CATEGORIES = new Set(["automation", "coding", "analytics", "consulting", "custom"]);
const MAX_AGENT_DETAIL_FETCHES = 40;

type JsonObject = Record<string, unknown>;

interface HttpResult {
  readonly status: number;
  readonly body: unknown;
  readonly url: string;
}

function asObject(value: unknown): JsonObject {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonObject)
    : {};
}

function dataOf(value: unknown): unknown {
  const obj = asObject(value);
  return obj.data ?? value;
}

function arrayOf(value: unknown): unknown[] {
  const data = dataOf(value);
  if (Array.isArray(data)) return data;
  const obj = asObject(data);
  for (const key of ["items", "services", "agents", "activity", "events", "results", "orders"]) {
    if (Array.isArray(obj[key])) return obj[key] as unknown[];
  }
  return [];
}

function text(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return null;
}

function finite(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function sanitize(value: unknown, depth = 0): unknown {
  if (depth > 6) return "[depth-limited]";
  if (Array.isArray(value)) return value.slice(0, 80).map((entry) => sanitize(entry, depth + 1));
  if (value !== null && typeof value === "object") {
    const out: JsonObject = {};
    for (const [key, child] of Object.entries(value as JsonObject)) {
      if (/api[_-]?key|secret|token|signature|private|mnemonic|seed|authorization/i.test(key)) continue;
      if (/brief|message|content|deliverable/i.test(key) && typeof child === "string") {
        out[key] = `[redacted-text:${child.length}]`;
        continue;
      }
      out[key] = sanitize(child, depth + 1);
    }
    return out;
  }
  if (typeof value === "string") return value.replace(/\s+/g, " ").slice(0, 1200);
  return value;
}

async function get(pathOrUrl: string): Promise<HttpResult> {
  const url = pathOrUrl.startsWith("http") ? pathOrUrl : `${API}${pathOrUrl}`;
  const response = await fetch(url, {
    method: "GET",
    redirect: "manual",
    headers: {
      Accept: "application/json,text/plain;q=0.9,*/*;q=0.8",
      "User-Agent": "agent-commerce-hub-readonly-atelier-demand-deep-scan/1.0",
    },
    signal: AbortSignal.timeout(20_000),
  });
  const raw = await response.text();
  let body: unknown = raw;
  if (raw.trim()) {
    try {
      body = JSON.parse(raw) as unknown;
    } catch {
      body = raw.slice(0, 30_000);
    }
  }
  return { status: response.status, body, url };
}

function idOf(obj: JsonObject): string | null {
  return text(obj.id ?? obj.service_id ?? obj.agent_id);
}

function agentIdOf(obj: JsonObject): string | null {
  return text(obj.agent_id ?? obj.agentId ?? asObject(obj.agent).id);
}

function categoryOf(obj: JsonObject): string {
  return (text(obj.category) ?? "unknown").toLowerCase();
}

function priceOf(obj: JsonObject): number | null {
  return finite(obj.price_usd ?? obj.priceUsd ?? obj.price);
}

function orderCountOf(obj: JsonObject): number {
  return finite(obj.total_orders ?? obj.totalOrders ?? obj.orders) ?? 0;
}

function completedCountOf(obj: JsonObject): number {
  return finite(obj.completed_orders ?? obj.completedOrders ?? obj.orders_completed) ?? 0;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid] ?? null;
  const a = sorted[mid - 1];
  const b = sorted[mid];
  return a === undefined || b === undefined ? null : (a + b) / 2;
}

function compactService(value: unknown): JsonObject {
  const obj = asObject(value);
  const out: JsonObject = {};
  for (const key of [
    "id", "service_id", "title", "category", "price_usd", "price_type", "turnaround_hours",
    "agent_id", "x402_enabled", "total_orders", "completed_orders", "created_at", "updated_at",
  ]) {
    if (obj[key] !== undefined) out[key] = sanitize(obj[key]);
  }
  return out;
}

function compactAgent(value: unknown): JsonObject {
  const obj = asObject(dataOf(value));
  const out: JsonObject = {};
  for (const key of [
    "id", "slug", "name", "marketable", "verified", "total_orders", "completed_orders",
    "rating", "created_at", "updated_at", "twitter_username", "payout_chain",
  ]) {
    if (obj[key] !== undefined) out[key] = sanitize(obj[key]);
  }
  return out;
}

function compactActivity(value: unknown): JsonObject {
  const obj = asObject(value);
  const out: JsonObject = {};
  for (const key of [
    "id", "type", "event", "action", "status", "category", "service_id", "agent_id", "order_id",
    "amount", "amount_usd", "price_usd", "volume_usd", "created_at", "timestamp", "title", "name",
  ]) {
    if (obj[key] !== undefined) out[key] = sanitize(obj[key]);
  }
  return out;
}

function activityKind(value: unknown): string {
  const obj = asObject(value);
  return [obj.type, obj.event, obj.action, obj.status]
    .map((entry) => text(entry)?.toLowerCase() ?? "")
    .filter(Boolean)
    .join(" ");
}

const endpointPairs = [
  ["metrics", "/api/metrics"],
  ["activity", "/api/metrics/activity"],
  ["services", "/api/services"],
  ["agents", "/api/agents?limit=100"],
  ["x402", "/api/x402/services"],
  ["trending", "/api/x402/trending"],
] as const;

const entries = await Promise.all(
  endpointPairs.map(async ([name, path]) => {
    try {
      return [name, await get(path)] as const;
    } catch (error) {
      return [name, { status: 0, body: `fetch error: ${String(error).slice(0, 500)}`, url: `${API}${path}` }] as const;
    }
  }),
);
const results = Object.fromEntries(entries) as Record<string, HttpResult>;

for (const [name, result] of entries) {
  console.log(`${name.toUpperCase()}_HTTP_STATUS=${result.status}`);
}

const services = arrayOf(results.services?.body);
const agents = arrayOf(results.agents?.body);
const activity = arrayOf(results.activity?.body);
const x402 = arrayOf(results.x402?.body);
const trending = arrayOf(results.trending?.body);

console.log(`METRICS_SANITIZED=${JSON.stringify(sanitize(results.metrics?.body)).slice(0, 12000)}`);
console.log(`ACTIVITY_COUNT=${activity.length}`);
console.log(`ACTIVITY_SAMPLE=${JSON.stringify(activity.slice(0, 30).map(compactActivity))}`);
console.log(`SERVICES_COUNT=${services.length}`);
console.log(`SERVICES_SAMPLE=${JSON.stringify(services.slice(0, 30).map(compactService))}`);
console.log(`AGENTS_COUNT=${agents.length}`);
console.log(`AGENTS_SAMPLE=${JSON.stringify(agents.slice(0, 30).map(compactAgent))}`);
console.log(`X402_COUNT=${x402.length}`);
console.log(`TRENDING_COUNT=${trending.length}`);
console.log(`TRENDING_SAMPLE=${JSON.stringify(trending.slice(0, 20).map(compactService))}`);

const categoryMap = new Map<string, { count: number; prices: number[]; x402: number; agentIds: Set<string> }>();
for (const service of services) {
  const obj = asObject(service);
  const category = categoryOf(obj);
  const row = categoryMap.get(category) ?? { count: 0, prices: [], x402: 0, agentIds: new Set<string>() };
  row.count += 1;
  const price = priceOf(obj);
  if (price !== null) row.prices.push(price);
  if (obj.x402_enabled === true || obj.x402Enabled === true) row.x402 += 1;
  const agentId = agentIdOf(obj);
  if (agentId) row.agentIds.add(agentId);
  categoryMap.set(category, row);
}
for (const service of x402) {
  const obj = asObject(service);
  const category = categoryOf(obj);
  const row = categoryMap.get(category) ?? { count: 0, prices: [], x402: 0, agentIds: new Set<string>() };
  row.x402 += 1;
  const agentId = agentIdOf(obj);
  if (agentId) row.agentIds.add(agentId);
  categoryMap.set(category, row);
}

const focusServices = services.filter((service) => FOCUS_CATEGORIES.has(categoryOf(asObject(service))));
const focusAgentIds = [...new Set(focusServices.map((service) => agentIdOf(asObject(service))).filter((id): id is string => Boolean(id)))].slice(0, MAX_AGENT_DETAIL_FETCHES);

const agentDetails: Array<{ id: string; status: number; body: unknown }> = [];
for (const id of focusAgentIds) {
  try {
    const result = await get(`/api/agents/${encodeURIComponent(id)}`);
    agentDetails.push({ id, status: result.status, body: result.body });
  } catch (error) {
    agentDetails.push({ id, status: 0, body: `fetch error: ${String(error).slice(0, 300)}` });
  }
}

const detailById = new Map<string, JsonObject>();
for (const detail of agentDetails) {
  if (detail.status !== 200) continue;
  const obj = asObject(dataOf(detail.body));
  const id = text(obj.id) ?? detail.id;
  detailById.set(id, obj);
}
for (const agent of agents) {
  const obj = asObject(agent);
  const id = text(obj.id);
  if (id && !detailById.has(id)) detailById.set(id, obj);
}

const categorySummary = [...categoryMap.entries()]
  .map(([category, row]) => {
    let agentOrderProxy = 0;
    let agentCompletedProxy = 0;
    let agentsWithOrderData = 0;
    for (const id of row.agentIds) {
      const agent = detailById.get(id);
      if (!agent) continue;
      agentsWithOrderData += 1;
      agentOrderProxy += orderCountOf(agent);
      agentCompletedProxy += completedCountOf(agent);
    }
    return {
      category,
      service_count: row.count,
      x402_service_count: row.x402,
      unique_agent_count: row.agentIds.size,
      agents_with_order_data: agentsWithOrderData,
      agent_total_orders_proxy: agentOrderProxy,
      agent_completed_orders_proxy: agentCompletedProxy,
      min_price_usd: row.prices.length ? Math.min(...row.prices) : null,
      median_price_usd: median(row.prices),
      max_price_usd: row.prices.length ? Math.max(...row.prices) : null,
    };
  })
  .sort((a, b) => b.agent_completed_orders_proxy - a.agent_completed_orders_proxy || b.service_count - a.service_count);

console.log(`CATEGORY_SUMMARY=${JSON.stringify(categorySummary)}`);
console.log(`FOCUS_SERVICE_COUNT=${focusServices.length}`);
console.log(`FOCUS_SERVICES=${JSON.stringify(focusServices.slice(0, 80).map(compactService))}`);
console.log(`FOCUS_AGENT_DETAIL_FETCH_COUNT=${agentDetails.length}`);
console.log(`FOCUS_AGENT_DETAILS=${JSON.stringify(agentDetails.map((entry) => ({ status: entry.status, ...compactAgent(entry.body) })).slice(0, 50))}`);

const orderEvents = activity.filter((entry) => /order|paid|deliver|complete|purchase|x402/.test(activityKind(entry)));
const completedEvents = activity.filter((entry) => /complete|completed|paid|settled/.test(activityKind(entry)));
const x402Events = activity.filter((entry) => /x402/.test(activityKind(entry)));
console.log(`RECENT_ORDER_LIKE_EVENT_COUNT=${orderEvents.length}`);
console.log(`RECENT_COMPLETION_LIKE_EVENT_COUNT=${completedEvents.length}`);
console.log(`RECENT_X402_EVENT_COUNT=${x402Events.length}`);
console.log(`RECENT_ORDER_LIKE_EVENTS=${JSON.stringify(orderEvents.slice(0, 50).map(compactActivity))}`);

const focusRanking = categorySummary.filter((row) => FOCUS_CATEGORIES.has(row.category));
console.log(`FOCUS_CATEGORY_RANKING=${JSON.stringify(focusRanking)}`);

console.log("DEMAND_PROXY_NOTE=agent_total_orders_proxy attributes an agent's public total order count to every category that agent currently serves; use it for directional ranking only, not exact per-service demand");
console.log("AUTHENTICATION_USED=no");
console.log("HTTP_METHODS_USED=GET_ONLY");
console.log("AGENT_REGISTRATION_EXECUTED=no");
console.log("SERVICE_LISTING_EXECUTED=no");
console.log("ORDER_ACTION_EXECUTED=no");
console.log("FINANCIAL_ACTION_EXECUTED=no");
console.log("BLOCKCHAIN_TX_EXECUTED=no");
console.log("WRITE_ACTION_EXECUTED=no");
