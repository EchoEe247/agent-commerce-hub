import test from "node:test";
import assert from "node:assert/strict";
import { buildApp } from "../src/app.mjs";

const ORIGIN = "https://hermes-counterparty-api.onrender.com";

function paidOperationCount(document) {
  return Object.values(document.paths)
    .flatMap((pathItem) => Object.values(pathItem))
    .filter((operation) => operation?.["x-payment-info"]).length;
}

// Product #11 remains stable while the portfolio adds a free acquisition preview.
test("Product 11 remains published with thirteen paid OpenAPI operations", async () => {
  const app = buildApp({
    config: {
      serviceVersion: "0.1.0",
      x402SecCompanyPrice: "$0.02",
      x402PackageMaintenancePrice: "$0.015",
    },
    paymentPlugin: async () => {},
  });
  const response = await app.inject({ method: "GET", url: "/openapi.json" });
  assert.equal(response.statusCode, 200);
  const document = response.json();
  assert.equal(Object.keys(document.paths).length, 14);
  assert.equal(paidOperationCount(document), 13);
  assert.match(document.info["x-guidance"], /thirteen paid POST operations/i);
  const operation = document.paths["/v1/sec-company-snapshot"]?.post;
  assert.ok(operation);
  assert.equal(operation.operationId, "secCompanySnapshot");
  assert.deepEqual(operation.tags, ["Business Intelligence"]);
  assert.equal(operation["x-payment-info"].price.amount, "0.020000");
  const schema = operation.requestBody.content["application/json"].schema;
  assert.equal(schema.type, "object");
  assert.deepEqual(schema.oneOf.map((choice) => choice.required), [["ticker"], ["cik"]]);
  assert.equal(operation.responses["404"].description, "SEC company not found");
  assert.equal(operation.responses["503"].description, "Required SEC source unavailable");
  await app.close();
});

test("Product 11 remains published after Product 13 in the Agent402 manifest", async () => {
  const app = buildApp({
    config: {
      serviceVersion: "0.1.0",
      x402Network: "eip155:8453",
      x402PayTo: "0x2BD7c4e294B09E9a853168a58712498D03A45B01",
      x402SecCompanyPrice: "$0.02",
      x402PackageMaintenancePrice: "$0.015",
    },
    paymentPlugin: async () => {},
  });
  const response = await app.inject({ method: "GET", url: "/.well-known/x402" });
  assert.equal(response.statusCode, 200);
  const body = response.json();
  assert.equal(body.resources.length, 13);
  assert.equal(body.capabilities.tools, 13);
  assert.equal(body.capabilities.categories.find((category) => category.key === "business-intelligence").tools, 3);
  assert.ok(body.resources.some((resource) => resource.url === `${ORIGIN}/v1/sec-company-snapshot` && resource.method === "POST"));
  const endpoint = body.endpoints.find((candidate) => candidate.path === "/v1/sec-company-snapshot");
  assert.ok(endpoint);
  assert.equal(endpoint.name, "sec-company-snapshot-edgar-filings-xbrl");
  assert.equal(endpoint.price_usd, 0.02);
  assert.equal(endpoint.network, "eip155:8453");
  assert.match(endpoint.summary, /SEC|EDGAR/i);
  assert.match(endpoint.description, /10-K/i);
  assert.match(endpoint.description, /XBRL/i);
  await app.close();
});