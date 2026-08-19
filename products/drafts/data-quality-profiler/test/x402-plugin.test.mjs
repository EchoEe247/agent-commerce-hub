import test from "node:test";
import assert from "node:assert/strict";
import Fastify from "fastify";
import { buildApp } from "../src/app.mjs";
import { buildPaymentPlugin } from "../src/payments/x402-plugin.mjs";
import { validateDiscoveryExtension } from "@x402/extensions/bazaar";

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

test("Bazaar extension passes official validateDiscoveryExtension with zero errors", async () => {
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
  const decoded = JSON.parse(Buffer.from(paymentHeader, "base64").toString("utf8"));

  // Official Bazaar validation must pass with zero errors
  const bazaar = decoded.extensions.bazaar;
  assert.ok(bazaar, "bazaar extension must be present");
  const result = validateDiscoveryExtension(bazaar);
  assert.equal(result.valid, true, `Bazaar extension must pass official validation: ${JSON.stringify(result.errors)}`);

  await app.close();
  await fac.close();
});

test("402 Bazaar metadata: POST method, bodyType json, oneOf JSON+CSV, no nested bazaar.bazaar", async () => {
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
  const decoded = JSON.parse(Buffer.from(paymentHeader, "base64").toString("utf8"));

  // x402 v2 core unchanged
  assert.equal(decoded.x402Version, 2);
  const first = decoded.accepts[0];
  assert.equal(first.scheme, "exact");
  assert.equal(first.network, "eip155:84532");
  assert.equal(first.payTo, PAY_TO);
  assert.equal(first.amount, "20000");

  // Bazaar extension
  assert.ok(decoded.extensions, "decoded header must have extensions");
  assert.ok(decoded.extensions.bazaar, "extensions must contain bazaar");
  const bazaar = decoded.extensions.bazaar;

  assert.equal(bazaar.info.input.type, "http");
  assert.equal(bazaar.info.input.method, "POST");
  assert.equal(bazaar.info.input.bodyType, "json");

  // oneOf schema: JSON alternative
  const bodySchema = bazaar.schema.properties.input.properties.body;
  assert.ok(bodySchema.oneOf, "body schema must use oneOf");
  assert.equal(bodySchema.oneOf.length, 2);

  const jsonAlt = bodySchema.oneOf.find((a) => a.properties?.format?.const === "json");
  assert.ok(jsonAlt, "must have JSON alternative");
  assert.deepEqual(jsonAlt.required, ["format", "records"]);

  const csvAlt = bodySchema.oneOf.find((a) => a.properties?.format?.const === "csv");
  assert.ok(csvAlt, "must have CSV alternative");
  assert.equal(csvAlt.properties.data?.type, "string");
  assert.deepEqual(csvAlt.required, ["format", "data"]);

  // No nested bazaar.bazaar
  assert.ok(!bazaar.bazaar, "must not contain nested bazaar.bazaar");

  // Output example present
  assert.ok(bazaar.info.output?.example?.schema_version);
  assert.ok(bazaar.info.output?.example?.scoring_version);

  await app.close();
  await fac.close();
});
