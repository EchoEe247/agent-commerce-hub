import test from "node:test";
import assert from "node:assert/strict";
import Fastify from "fastify";
import { buildApp } from "../src/app.mjs";
import { buildPaymentPlugin } from "../src/payments/x402-plugin.mjs";
import { validateDiscoveryExtension } from "@x402/extensions/bazaar";

const PAY_TO = "0x0000000000000000000000000000000000000001";

async function createFakeFacilitator() {
  const app = Fastify({ logger: false });
  app.get("/supported", async () => ({
    kinds: [{ x402Version: 2, scheme: "exact", network: "eip155:84532", extra: {} }],
    extensions: [],
    signers: {},
  }));
  app.post("/verify", async () => ({ isValid: true }));
  app.post("/settle", async () => ({ success: true, transaction: "0x" + "00".repeat(32), network: "eip155:84532" }));
  await app.listen({ port: 0, host: "127.0.0.1" });
  const { port } = app.server.address();
  return { app, url: `http://127.0.0.1:${port}` };
}

function decodePaymentRequired(response) {
  const header = response.headers["payment-required"];
  assert.ok(header, "PAYMENT-REQUIRED response header must be present");
  return JSON.parse(Buffer.from(header, "base64").toString("utf8"));
}

test("Product 13 unpaid request advertises exact $0.005 x402 payment and valid package Bazaar metadata", async () => {
  const { app: facilitator, url } = await createFakeFacilitator();
  const plugin = buildPaymentPlugin({
    x402Enabled: true,
    x402Network: "eip155:84532",
    x402PayTo: PAY_TO,
    x402PackageMaintenancePrice: "$0.005",
    x402FacilitatorUrl: url,
  });
  const app = buildApp({
    config: { serviceVersion: "0.1.0" },
    paymentPlugin: plugin,
    packageMaintenanceSnapshot: async () => ({ schema_version: "1.0" }),
  });

  try {
    const response = await app.inject({
      method: "POST",
      url: "/v1/package-maintenance-snapshot",
      payload: { ecosystem: "npm", package: "fastify", version: "5.6.0" },
    });
    assert.equal(response.statusCode, 402);
    const decoded = decodePaymentRequired(response);
    assert.equal(decoded.x402Version, 2);
    const quote = decoded.accepts?.[0];
    assert.ok(quote);
    assert.equal(quote.scheme, "exact");
    assert.equal(quote.network, "eip155:84532");
    assert.equal(quote.payTo, PAY_TO);
    assert.equal(quote.amount, "5000");

    const bazaar = decoded.extensions?.bazaar;
    assert.ok(bazaar, "Product 13 must advertise Bazaar discovery metadata");
    const validation = validateDiscoveryExtension(bazaar);
    assert.equal(validation.valid, true, JSON.stringify(validation.errors));
    assert.equal(bazaar.info.input.method, "POST");
    assert.equal(bazaar.info.input.bodyType, "json");
    const bodySchema = bazaar.schema.properties.input.properties.body;
    assert.deepEqual(bodySchema.required, ["ecosystem", "package", "version"]);
    assert.equal(bazaar.info.output.example.schema_version, "1.0");
    assert.equal(bazaar.info.output.example.query.ecosystem, "npm");
    assert.equal(bazaar.info.output.example.package.requested_version, "5.6.0");
  } finally {
    await app.close();
    await facilitator.close();
  }
});
