import test from "node:test";
import assert from "node:assert/strict";
import { buildApp } from "../src/app.mjs";

const EARNING_WALLET = "0x2BD7c4e294B09E9a853168a58712498D03A45B01";
const PUBLIC_ORIGIN = "https://hermes-counterparty-api.onrender.com";
const INDEX402_VERIFICATION_HASH = "38c7d63638e26a694fdf51fd1b213221e26d73044847c5dac48bf4aa19756605";
const PROFILER_ROUTING_NAME = "validate-json-csv-data-quality-profile-missing-duplicate-types";
const PROFILER_ROUTING_SUMMARY = "Validate and profile JSON or CSV datasets before ETL, RAG, analytics, or AI agent use; find missing values, duplicates and duplicate rows, inconsistent data types and type conflicts, infer field types, and return a deterministic quality score plus schema fingerprint.";

const PORTFOLIO_ROUTES = [
  ["/v1/entity-sanctions-screen", "ofac-sdn-entity-sanctions-screen", 0.02, /OFAC|sanctions/i],
  ["/v1/duplicate-audit", "duplicate-row-audit-json-csv", 0.005, /duplicate rows/i],
  ["/v1/quality-gate", "data-quality-pass-fail-gate-etl-rag", 0.01, /quality.*gate|pass.*fail/i],
  ["/v1/schema-drift", "schema-drift-added-removed-type-changes", 0.015, /schema drift/i],
  ["/v1/data-contract-check", "data-contract-schema-compatibility-check", 0.015, /data contract/i],
  ["/v1/clean-normalize", "clean-normalize-json-csv-deduplicate-trim", 0.02, /clean.*normalize|deduplicate/i],
  ["/v1/repair-plan", "dataset-repair-plan-missing-duplicates-mixed-types", 0.02, /repair plan/i],
];

function unpaidApp(options = {}) {
  return buildApp({
    config: {
      serviceVersion: "0.1.0",
      x402Price: "$0.02",
      x402LocalePrice: "$0.03",
      x402SanctionsScreenPrice: "$0.02",
      x402DuplicateAuditPrice: "$0.005",
      x402QualityGatePrice: "$0.01",
      x402SchemaDriftPrice: "$0.015",
      x402DataContractPrice: "$0.015",
      x402CleanNormalizePrice: "$0.02",
      x402RepairPlanPrice: "$0.02",
      x402Network: "eip155:8453",
      x402PayTo: EARNING_WALLET,
    },
    paymentPlugin: async () => {},
    ...options,
  });
}

test("GET /.well-known/x402 publishes nine unique Agent402-compatible tools", async () => {
  const app = unpaidApp();
  const response = await app.inject({ method: "GET", url: "/.well-known/x402" });
  assert.equal(response.statusCode, 200);
  const body = response.json();

  assert.equal(body.spec, "agent402-service-manifest/1");
  assert.equal(body.version, 1);
  assert.equal(body.serviceVersion, "0.1.0");
  assert.equal(body.name, "Hermes Counterparty Availability");
  assert.equal(body.homepage, PUBLIC_ORIGIN);
  assert.equal(body.resources.length, 9);
  assert.equal(new Set(body.resources.map((resource) => resource.url)).size, 9);
  assert.deepEqual(body.resources, [
    { url: `${PUBLIC_ORIGIN}/v1/counterparty-availability`, method: "POST" },
    { url: `${PUBLIC_ORIGIN}/v1/entity-sanctions-screen`, method: "POST" },
    { url: `${PUBLIC_ORIGIN}/v1/profile`, method: "POST" },
    { url: `${PUBLIC_ORIGIN}/v1/duplicate-audit`, method: "POST" },
    { url: `${PUBLIC_ORIGIN}/v1/quality-gate`, method: "POST" },
    { url: `${PUBLIC_ORIGIN}/v1/schema-drift`, method: "POST" },
    { url: `${PUBLIC_ORIGIN}/v1/data-contract-check`, method: "POST" },
    { url: `${PUBLIC_ORIGIN}/v1/clean-normalize`, method: "POST" },
    { url: `${PUBLIC_ORIGIN}/v1/repair-plan`, method: "POST" },
  ]);

  assert.deepEqual(body.payment.x402.networks, ["eip155:8453"]);
  assert.equal(body.payment.x402.primaryNetwork, "eip155:8453");
  assert.equal(body.payment.x402.version, 2);
  assert.equal(body.payment.x402.currency, "USDC");
  assert.equal(body.payment.x402.priceRange, "$0.005-$0.03");
  assert.equal(body.payment.x402.payTo, EARNING_WALLET);
  assert.equal(body.payment.x402.nonCustodial, true);

  assert.equal(body.capabilities.tools, 9);
  assert.deepEqual(body.capabilities.categories.map((category) => category.key), ["business-intelligence", "compliance", "data-quality"]);
  assert.equal(body.capabilities.categories.find((category) => category.key === "business-intelligence").tools, 1);
  assert.equal(body.capabilities.categories.find((category) => category.key === "compliance").tools, 1);
  assert.equal(body.capabilities.categories.find((category) => category.key === "data-quality").tools, 7);

  const counterparty = body.endpoints.find((endpoint) => endpoint.path === "/v1/counterparty-availability");
  assert.equal(counterparty.method, "POST");
  assert.equal(counterparty.price_usd, 0.03);
  assert.equal(counterparty.network, "eip155:8453");

  const profiler = body.endpoints.find((endpoint) => endpoint.path === "/v1/profile");
  assert.equal(profiler.name, PROFILER_ROUTING_NAME);
  assert.equal(profiler.summary, PROFILER_ROUTING_SUMMARY);
  assert.equal(profiler.method, "POST");
  assert.equal(profiler.price_usd, 0.02);
  assert.equal(profiler.network, "eip155:8453");
  assert.match(profiler.summary, /JSON or CSV/);
  assert.match(profiler.summary, /ETL/);
  assert.match(profiler.summary, /AI agent/);
  assert.match(profiler.summary, /missing values/);
  assert.match(profiler.summary, /duplicate rows/);
  assert.match(profiler.summary, /type conflicts/);
  assert.match(profiler.description, /missing values/);
  assert.match(profiler.description, /schema fingerprint/);

  assert.equal(body.endpoints.length, 9);
  for (const [path, name, price, summaryPattern] of PORTFOLIO_ROUTES) {
    const endpoint = body.endpoints.find((candidate) => candidate.path === path);
    assert.ok(endpoint, `missing manifest endpoint ${path}`);
    assert.equal(endpoint.name, name);
    assert.equal(endpoint.method, "POST");
    assert.equal(endpoint.price_usd, price);
    assert.equal(endpoint.network, "eip155:8453");
    assert.match(endpoint.summary, summaryPattern);
    assert.equal(endpoint.url, `${PUBLIC_ORIGIN}${path}`);
  }

  const sanctions = body.endpoints.find((endpoint) => endpoint.path === "/v1/entity-sanctions-screen");
  assert.match(sanctions.description, /not a legal compliance determination/i);
  await app.close();
});

test("GET /.well-known/402index-verify.txt publishes the 402 Index verification hash", async () => {
  const app = unpaidApp();
  const response = await app.inject({ method: "GET", url: "/.well-known/402index-verify.txt" });
  assert.equal(response.statusCode, 200);
  assert.match(response.headers["content-type"], /^text\/plain/);
  assert.equal(response.body, INDEX402_VERIFICATION_HASH);
  await app.close();
});

test("forwarded HTTPS is preserved for payment resource URLs", async () => {
  const app = unpaidApp({
    paymentPlugin: (instance) => {
      instance.addHook("onRequest", async (request, reply) => {
        if (request.method === "POST" && request.url.split("?")[0] === "/v1/profile") {
          return reply.status(402).send({
            resource: {
              url: `${request.protocol}://${request.host}${request.url}`,
            },
          });
        }
      });
    },
  });
  const response = await app.inject({
    method: "POST",
    url: "/v1/profile",
    headers: {
      host: "hermes-counterparty-api.onrender.com",
      "x-forwarded-proto": "https",
    },
    payload: { format: "json", records: [{ id: 1 }] },
  });
  assert.equal(response.statusCode, 402);
  assert.equal(response.json().resource.url, `${PUBLIC_ORIGIN}/v1/profile`);
  await app.close();
});

test("POST /v1/counterparty-availability returns deterministic availability brief", async () => {
  const fixed = Date.parse("2026-08-20T13:00:00.000Z");
  const app = unpaidApp({ clock: { now: () => fixed } });
  const response = await app.inject({
    method: "POST",
    url: "/v1/counterparty-availability",
    payload: { country_code: "US", timezone: "America/Chicago" },
  });
  assert.equal(response.statusCode, 200);
  const body = response.json();
  assert.equal(body.country.code, "US");
  assert.equal(body.local.date, "2026-08-20");
  assert.equal(body.local.time, "08:00");
  assert.equal(body.business.business_days_remaining_this_week, 2);
  await app.close();
});

test("counterparty availability rejects unsupported country before work", async () => {
  const app = unpaidApp();
  const response = await app.inject({
    method: "POST",
    url: "/v1/counterparty-availability",
    payload: { country_code: "ZZ" },
  });
  assert.equal(response.statusCode, 400);
  assert.equal(response.json().error.code, "UNSUPPORTED_COUNTRY");
  await app.close();
});

test("counterparty availability rejects invalid timezone", async () => {
  const app = unpaidApp();
  const response = await app.inject({
    method: "POST",
    url: "/v1/counterparty-availability",
    payload: { country_code: "US", timezone: "Mars/Olympus" },
  });
  assert.equal(response.statusCode, 400);
  assert.equal(response.json().error.code, "INVALID_TIMEZONE");
  await app.close();
});
