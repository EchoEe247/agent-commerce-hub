import test from "node:test";
import assert from "node:assert/strict";
import Fastify from "fastify";
import { validateDiscoveryExtension } from "@x402/extensions/bazaar";
import { buildApp } from "../src/app.mjs";
import { buildPaymentPlugin } from "../src/payments/x402-plugin.mjs";

const PAY_TO = "0x0000000000000000000000000000000000000001";

async function createFakeFacilitator() {
  const app = Fastify({ logger: false });
  app.get("/supported", async () => ({
    kinds: [{ x402Version: 2, scheme: "exact", network: "eip155:84532", extra: {} }],
    extensions: [],
    signers: {},
  }));
  app.post("/verify", async () => ({ isValid: true }));
  app.post("/settle", async () => ({
    success: true,
    transaction: "0x" + "00".repeat(32),
    network: "eip155:84532",
  }));
  await app.listen({ port: 0, host: "127.0.0.1" });
  const { port } = app.server.address();
  return { app, url: `http://127.0.0.1:${port}` };
}

function config(facilitatorUrl) {
  return {
    serviceVersion: "0.1.0",
    x402Enabled: true,
    x402Network: "eip155:84532",
    x402PayTo: PAY_TO,
    x402Price: "$0.02",
    x402LocalePrice: "$0.03",
    x402SanctionsScreenPrice: "$0.02",
    x402DuplicateAuditPrice: "$0.005",
    x402QualityGatePrice: "$0.01",
    x402SchemaDriftPrice: "$0.015",
    x402DataContractPrice: "$0.015",
    x402CleanNormalizePrice: "$0.02",
    x402RepairPlanPrice: "$0.02",
    x402FacilitatorUrl: facilitatorUrl,
  };
}

function decodePaymentRequired(response) {
  const header = response.headers["payment-required"];
  assert.ok(header, "PAYMENT-REQUIRED response header must be present");
  return JSON.parse(Buffer.from(header, "base64").toString("utf8"));
}

test("entity sanctions screen is x402 protected at $0.02 with valid Bazaar metadata", async () => {
  const { app: facilitator, url } = await createFakeFacilitator();
  const cfg = config(url);
  const seller = buildApp({
    config: cfg,
    paymentPlugin: buildPaymentPlugin(cfg),
    entitySanctionsScreen: async () => ({
      schema_version: "1.0",
      query: { name: "ACME SHIPPING LLC", normalized_name: "acme shipping llc" },
      matches_found: false,
      candidates: [],
      source: { provider: "OFAC", list: "SDN" },
      warnings: ["Screening result is informational and is not a legal compliance determination."],
    }),
  });

  try {
    const response = await seller.inject({
      method: "POST",
      url: "/v1/entity-sanctions-screen",
      payload: { name: "ACME SHIPPING LLC" },
    });

    assert.equal(response.statusCode, 402);
    const decoded = decodePaymentRequired(response);
    assert.equal(decoded.x402Version, 2);
    assert.ok(decoded.accepts?.length > 0);
    const first = decoded.accepts[0];
    assert.equal(first.scheme, "exact");
    assert.equal(first.network, "eip155:84532");
    assert.equal(first.payTo, PAY_TO);
    assert.equal(first.amount, "20000");

    const bazaar = decoded.extensions?.bazaar;
    assert.ok(bazaar, "sanctions screen must publish Bazaar discovery metadata");
    const validation = validateDiscoveryExtension(bazaar);
    assert.equal(validation.valid, true, `Bazaar metadata must validate: ${JSON.stringify(validation.errors)}`);
    assert.equal(bazaar.info.input.type, "http");
    assert.equal(bazaar.info.input.method, "POST");
    assert.equal(bazaar.info.input.bodyType, "json");
    const bodySchema = bazaar.schema.properties.input.properties.body;
    assert.ok(bodySchema.required?.includes("name"));
    assert.equal(bodySchema.properties.name.type, "string");
    assert.equal(bazaar.info.output.example.matches_found, false);
    assert.ok(bazaar.info.output.example.warnings.some((warning) => /not a legal compliance determination/i.test(warning)));
  } finally {
    await seller.close();
    await facilitator.close();
  }
});
