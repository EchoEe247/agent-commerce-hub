import test from "node:test";
import assert from "node:assert/strict";
import { buildApp } from "../src/app.mjs";
import { loadConfig } from "../src/config.mjs";

const PUBLIC_ORIGIN = "https://hermes-counterparty-api.onrender.com";

function app() {
  return buildApp({
    config: {
      ...loadConfig({ X402_PAYMENT_MODE: "local-unpaid" }),
      x402Network: "eip155:8453",
      x402PayTo: "0x2BD7c4e294B09E9a853168a58712498D03A45B01",
    },
    paymentPlugin: async () => {},
  });
}

test("manifest exposes all thirteen POST tools including Product 13", async () => {
  const instance = app();
  const response = await instance.inject({ method: "GET", url: "/.well-known/x402" });
  assert.equal(response.statusCode, 200);
  const body = response.json();

  // Seller identity is portfolio-level; it must not inherit the original single-tool product name.
  assert.equal(body.name, "Hermes Agent Commerce API");
  assert.notEqual(body.name, "Hermes Counterparty Availability");
  assert.match(body.summary, /company\/domain intelligence/i);
  assert.match(body.summary, /data quality/i);

  assert.equal(body.resources.length, 13);
  assert.equal(new Set(body.resources.map((resource) => resource.url)).size, 13);
  for (const resource of body.resources) {
    assert.equal(resource.method, "POST");
    assert.match(resource.url, new RegExp(`^${PUBLIC_ORIGIN.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/v1/`));
  }
  assert.equal(body.capabilities.tools, 13);
  const business = body.capabilities.categories.find((category) => category.key === "business-intelligence");
  assert.equal(business.tools, 3);
  assert.equal(business.priceRange, "$0.02-$0.03");

  const developer = body.capabilities.categories.find((category) => category.key === "developer-intelligence");
  assert.ok(developer);
  assert.equal(developer.tools, 1);
  assert.equal(developer.priceRange, "$0.005");

  const domainProduct = body.endpoints.find((endpoint) => endpoint.path === "/v1/company-domain-intelligence");
  assert.ok(domainProduct);
  assert.equal(domainProduct.method, "POST");
  assert.equal(domainProduct.price_usd, 0.02);
  assert.equal(domainProduct.network, "eip155:8453");
  assert.equal(
    domainProduct.summary,
    "Company domain intelligence: research and enrich a business domain with public web and infrastructure signals"
  );
  assert.match(domainProduct.description, /research a company/i);
  assert.match(domainProduct.description, /enrich a business/i);
  assert.match(domainProduct.description, /free preview/i);
  assert.match(domainProduct.description, /DNS/i);
  assert.match(domainProduct.description, /RDAP/i);

  const sanctionsProduct = body.endpoints.find((endpoint) => endpoint.path === "/v1/entity-sanctions-screen");
  assert.ok(sanctionsProduct);
  assert.equal(sanctionsProduct.summary, "OFAC sanctions screening for a person or organization");

  const secProduct = body.endpoints.find((endpoint) => endpoint.path === "/v1/sec-company-snapshot");
  assert.ok(secProduct);
  assert.equal(secProduct.method, "POST");
  assert.equal(secProduct.price_usd, 0.02);
  assert.equal(secProduct.network, "eip155:8453");
  assert.equal(secProduct.summary, "SEC company snapshot by ticker or CIK with filings and financial facts");
  assert.match(secProduct.description, /XBRL/i);

  const dependencyProduct = body.endpoints.find((endpoint) => endpoint.path === "/v1/dependency-vulnerability-check");
  assert.ok(dependencyProduct);
  assert.equal(dependencyProduct.price_usd, 0.005);

  const packageProduct = body.endpoints.find((endpoint) => endpoint.path === "/v1/package-maintenance-snapshot");
  assert.ok(packageProduct);
  assert.equal(packageProduct.method, "POST");
  assert.equal(packageProduct.price_usd, 0.005);
  assert.equal(packageProduct.network, "eip155:8453");
  assert.match(packageProduct.summary, /package maintenance/i);
  assert.match(packageProduct.description, /npm/i);
  assert.match(packageProduct.description, /PyPI/i);

  await instance.close();
});