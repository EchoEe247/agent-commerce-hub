import test from "node:test";
import assert from "node:assert/strict";
import { buildApp } from "../src/app.mjs";

const ORIGIN = "https://hermes-counterparty-api.onrender.com";

test("Product 13 is published as the thirteenth OpenAPI paid operation", async () => {
  const app = buildApp({
    config: { serviceVersion: "0.1.0", x402PackageMaintenancePrice: "$0.015" },
    paymentPlugin: async () => {},
  });
  const response = await app.inject({ method: "GET", url: "/openapi.json" });
  assert.equal(response.statusCode, 200);
  const document = response.json();
  assert.equal(Object.keys(document.paths).length, 13);
  assert.match(document.info["x-guidance"], /thirteen POST operations/i);
  const operation = document.paths["/v1/package-maintenance-snapshot"]?.post;
  assert.ok(operation);
  assert.equal(operation.operationId, "packageMaintenanceSnapshot");
  assert.deepEqual(operation.tags, ["Developer Intelligence"]);
  assert.equal(operation.summary, "Package maintenance snapshot for an exact npm or PyPI version");
  assert.equal(operation["x-payment-info"].price.amount, "0.015000");
  const schema = operation.requestBody.content["application/json"].schema;
  assert.deepEqual(schema.required, ["ecosystem", "package", "version"]);
  assert.equal(schema.properties.ecosystem.type, "string");
  assert.equal(schema.properties.package.type, "string");
  assert.equal(schema.properties.version.type, "string");
  assert.equal(operation.responses["404"].description, "Package or exact version not found");
  assert.equal(operation.responses["503"].description, "Package registry source unavailable");
  await app.close();
});

test("Product 13 is published as the thirteenth Agent402 manifest tool", async () => {
  const app = buildApp({
    config: {
      serviceVersion: "0.1.0",
      x402Network: "eip155:8453",
      x402PayTo: "0x2BD7c4e294B09E9a853168a58712498D03A45B01",
      x402PackageMaintenancePrice: "$0.015",
    },
    paymentPlugin: async () => {},
  });
  const response = await app.inject({ method: "GET", url: "/.well-known/x402" });
  assert.equal(response.statusCode, 200);
  const body = response.json();
  assert.equal(body.resources.length, 13);
  assert.equal(body.capabilities.tools, 13);
  const category = body.capabilities.categories.find((item) => item.key === "developer-intelligence");
  assert.ok(category);
  assert.equal(category.tools, 1);
  assert.equal(category.priceRange, "$0.015");
  assert.ok(body.resources.some((resource) => resource.url === `${ORIGIN}/v1/package-maintenance-snapshot` && resource.method === "POST"));
  const endpoint = body.endpoints.find((candidate) => candidate.path === "/v1/package-maintenance-snapshot");
  assert.ok(endpoint);
  assert.equal(endpoint.name, "package-maintenance-snapshot-npm-pypi-release-metadata");
  assert.equal(endpoint.price_usd, 0.015);
  assert.equal(endpoint.network, "eip155:8453");
  assert.equal(endpoint.summary, "Package maintenance snapshot for an exact npm or PyPI version");
  assert.match(endpoint.description, /latest/i);
  assert.match(endpoint.description, /deprecat|yanked/i);
  assert.match(endpoint.description, /license/i);
  await app.close();
});
