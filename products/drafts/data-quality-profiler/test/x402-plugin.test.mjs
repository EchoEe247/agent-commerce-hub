import test from "node:test";
import assert from "node:assert/strict";
import Fastify from "fastify";
import { buildApp } from "../src/app.mjs";
import { buildPaymentPlugin } from "../src/payments/x402-plugin.mjs";

// ── Fake facilitator ──────────────────────────────────────────────
async function createFakeFacilitator() {
  const app = Fastify({ logger: false });

  app.get("/supported", async () => ({
    kinds: [
      { x402Version: 2, scheme: "exact", network: "eip155:84532", extra: {} },
    ],
    extensions: [],
    signers: {},
  }));

  app.post("/verify", async () => ({
    isValid: true,
  }));

  app.post("/settle", async () => ({
    success: true,
    transaction: "0x" + "00".repeat(32),
    network: "eip155:84532",
  }));

  await app.listen({ port: 0, host: "127.0.0.1" });
  const { port } = app.server.address();
  return { app, port, url: `http://127.0.0.1:${port}` };
}

const PAY_TO = "0x0000000000000000000000000000000000000001";

function makePluginConfig(facUrl) {
  return {
    x402Enabled: true,
    x402Network: "eip155:84532",
    x402PayTo: PAY_TO,
    x402Price: "$0.02",
    x402FacilitatorUrl: facUrl,
  };
}

// ── Tests ─────────────────────────────────────────────────────────

test("GET /health is payment-free (no plugin)", async () => {
  const app = buildApp({ config: { serviceVersion: "0.1.0" } });
  const response = await app.inject({ method: "GET", url: "/health" });
  assert.equal(response.statusCode, 200);
  await app.close();
});

test("unpaid POST /v1/profile returns HTTP 402 with PAYMENT-REQUIRED response header", async () => {
  const { app: fac, url: facUrl } = await createFakeFacilitator();
  const plugin = buildPaymentPlugin(makePluginConfig(facUrl));
  const app = buildApp({ config: { serviceVersion: "0.1.0" }, paymentPlugin: plugin });
  const response = await app.inject({
    method: "POST",
    url: "/v1/profile",
    payload: { format: "json", records: [{ id: 1 }] },
  });
  assert.equal(response.statusCode, 402);

  const paymentHeader = response.headers["payment-required"];
  assert.ok(paymentHeader, "PAYMENT-REQUIRED response header must be present");
  const decoded = JSON.parse(Buffer.from(paymentHeader, "base64").toString("utf8"));

  assert.ok(decoded.x402Version === 2 || decoded.accepts, "decoded header must have x402 v2 structure");
  assert.ok(decoded.accepts && decoded.accepts.length > 0, "accepts array must be non-empty");

  const first = decoded.accepts[0];
  assert.equal(first.scheme, "exact");
  assert.equal(first.network, "eip155:84532");
  assert.equal(first.payTo, PAY_TO);
  assert.equal(first.amount, "20000");

  const body = response.json();
  assert.ok(!body.dataset, "profiler dataset must not be returned in 402 response");

  await app.close();
  await fac.close();
});

test("disabled plugin leaves /v1/profile reachable without payment", async () => {
  const { app: fac, url: facUrl } = await createFakeFacilitator();
  const plugin = buildPaymentPlugin({
    ...makePluginConfig(facUrl),
    x402Enabled: false,
  });
  const app = buildApp({ config: { serviceVersion: "0.1.0" }, paymentPlugin: plugin });
  const response = await app.inject({
    method: "POST",
    url: "/v1/profile",
    payload: { format: "json", records: [{ id: 1 }] },
  });
  assert.equal(response.statusCode, 200);
  await app.close();
  await fac.close();
});

test("402 PAYMENT-REQUIRED contains Bazaar metadata: method POST, bodyType json, oneOf schema, output example", async () => {
  const { app: fac, url: facUrl } = await createFakeFacilitator();
  const plugin = buildPaymentPlugin(makePluginConfig(facUrl));
  const app = buildApp({ config: { serviceVersion: "0.1.0" }, paymentPlugin: plugin });
  const response = await app.inject({
    method: "POST",
    url: "/v1/profile",
    payload: { format: "json", records: [{ id: 1 }] },
  });
  assert.equal(response.statusCode, 402);

  const paymentHeader = response.headers["payment-required"];
  assert.ok(paymentHeader, "PAYMENT-REQUIRED response header must be present");
  const decoded = JSON.parse(Buffer.from(paymentHeader, "base64").toString("utf8"));

  // x402 v2 core requirements unchanged
  assert.equal(decoded.x402Version, 2);
  assert.ok(decoded.accepts && decoded.accepts.length > 0);
  const first = decoded.accepts[0];
  assert.equal(first.scheme, "exact");
  assert.equal(first.network, "eip155:84532");
  assert.equal(first.payTo, PAY_TO);
  assert.equal(first.amount, "20000");

  // Bazaar discovery extension at top-level extensions
  assert.ok(decoded.extensions, "decoded header must have extensions");
  assert.ok(decoded.extensions.bazaar, "extensions must contain bazaar");

  const bazaar = decoded.extensions.bazaar;
  assert.ok(bazaar.info, "bazaar extension must have info");
  assert.ok(bazaar.info.input, "bazaar.info must have input");
  assert.equal(bazaar.info.input.type, "http", "input type must be http");
  assert.equal(bazaar.info.input.method, "POST", "input method must be POST (inferred from route key)");
  assert.equal(bazaar.info.input.bodyType, "json", "bodyType must be json");

  // Schema must contain oneOf with JSON and CSV alternatives
  assert.ok(bazaar.schema, "bazaar must have schema");
  const bodySchema = bazaar.schema.properties?.input?.properties?.body;
  assert.ok(bodySchema, "schema must have input.properties.body");
  assert.ok(bodySchema.oneOf, "body schema must use oneOf for JSON/CSV alternatives");
  assert.equal(bodySchema.oneOf.length, 2, "oneOf must have exactly 2 alternatives");

  // JSON alternative: format const "json", records array, required [format, records]
  const jsonAlt = bodySchema.oneOf.find((alt) =>
    alt.properties?.format?.const === "json"
  );
  assert.ok(jsonAlt, "oneOf must have a JSON alternative with format const json");
  assert.ok(jsonAlt.properties.records, "JSON alternative must have records property");
  assert.deepEqual(jsonAlt.required, ["format", "records"], "JSON alternative must require format and records");

  // CSV alternative: format const "csv", data string, required [format, data]
  const csvAlt = bodySchema.oneOf.find((alt) =>
    alt.properties?.format?.const === "csv"
  );
  assert.ok(csvAlt, "oneOf must have a CSV alternative with format const csv");
  assert.equal(csvAlt.properties.data?.type, "string", "CSV data must be string type");
  assert.deepEqual(csvAlt.required, ["format", "data"], "CSV alternative must require format and data");

  // No nested bazaar.bazaar
  assert.ok(!bazaar.bazaar, "bazaar must not contain nested bazaar.bazaar");

  // Output example present
  assert.ok(bazaar.info.output, "bazaar must have output info");
  assert.ok(bazaar.info.output.example, "bazaar must have output example");
  const ex = bazaar.info.output.example;
  assert.equal(typeof ex.schema_version, "string", "output example must have schema_version");
  assert.equal(typeof ex.scoring_version, "string", "output example must have scoring_version");
  assert.equal(typeof ex.quality_score, "number", "output example must have quality_score");

  await app.close();
  await fac.close();
});
