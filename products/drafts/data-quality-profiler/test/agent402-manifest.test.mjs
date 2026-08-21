import test from "node:test";
import assert from "node:assert/strict";
import { buildApp } from "../src/app.mjs";

const PUBLIC_ORIGIN = "https://hermes-counterparty-api.onrender.com";

function app() {
  return buildApp({
    config: {
      serviceVersion: "0.1.0",
      x402Price: "$0.02",
      x402LocalePrice: "$0.03",
      x402SanctionsScreenPrice: "$0.02",
      x402CompanyDomainPrice: "$0.02",
      x402DuplicateAuditPrice: "$0.005",
      x402QualityGatePrice: "$0.01",
      x402SchemaDriftPrice: "$0.015",
      x402DataContractPrice: "$0.015",
      x402CleanNormalizePrice: "$0.02",
      x402RepairPlanPrice: "$0.02",
      x402Network: "eip155:8453",
      x402PayTo: "0x2BD7c4e294B09E9a853168a58712498D03A45B01",
    },
    paymentPlugin: async () => {},
  });
}

test("manifest exposes all ten POST tools including Product 10", async () => {
  const instance = app();
  const response = await instance.inject({ method: "GET", url: "/.well-known/x402" });
  assert.equal(response.statusCode, 200);
  const body = response.json();

  assert.equal(body.resources.length, 10);
  assert.equal(new Set(body.resources.map((resource) => resource.url)).size, 10);
  for (const resource of body.resources) {
    assert.equal(resource.method, "POST");
    assert.match(resource.url, new RegExp(`^${PUBLIC_ORIGIN.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/v1/`));
  }
  assert.equal(body.capabilities.tools, 10);
  const business = body.capabilities.categories.find((category) => category.key === "business-intelligence");
  assert.equal(business.tools, 2);
  assert.equal(business.priceRange, "$0.02-$0.03");
  const product = body.endpoints.find((endpoint) => endpoint.path === "/v1/company-domain-intelligence");
  assert.ok(product);
  assert.equal(product.method, "POST");
  assert.equal(product.price_usd, 0.02);
  assert.equal(product.network, "eip155:8453");
  assert.match(product.summary, /domain/i);
  assert.match(product.description, /DNS/i);
  assert.match(product.description, /RDAP/i);

  await instance.close();
});
