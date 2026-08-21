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
      x402SecCompanyPrice: "$0.02",
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

test("manifest exposes all eleven POST tools including Product 11", async () => {
  const instance = app();
  const response = await instance.inject({ method: "GET", url: "/.well-known/x402" });
  assert.equal(response.statusCode, 200);
  const body = response.json();

  assert.equal(body.resources.length, 11);
  assert.equal(new Set(body.resources.map((resource) => resource.url)).size, 11);
  for (const resource of body.resources) {
    assert.equal(resource.method, "POST");
    assert.match(resource.url, new RegExp(`^${PUBLIC_ORIGIN.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/v1/`));
  }
  assert.equal(body.capabilities.tools, 11);
  const business = body.capabilities.categories.find((category) => category.key === "business-intelligence");
  assert.equal(business.tools, 3);
  assert.equal(business.priceRange, "$0.02-$0.03");

  const domainProduct = body.endpoints.find((endpoint) => endpoint.path === "/v1/company-domain-intelligence");
  assert.ok(domainProduct);
  assert.equal(domainProduct.method, "POST");
  assert.equal(domainProduct.price_usd, 0.02);
  assert.equal(domainProduct.network, "eip155:8453");
  assert.match(domainProduct.summary, /domain/i);
  assert.match(domainProduct.description, /DNS/i);
  assert.match(domainProduct.description, /RDAP/i);

  const secProduct = body.endpoints.find((endpoint) => endpoint.path === "/v1/sec-company-snapshot");
  assert.ok(secProduct);
  assert.equal(secProduct.method, "POST");
  assert.equal(secProduct.price_usd, 0.02);
  assert.equal(secProduct.network, "eip155:8453");
  assert.match(secProduct.summary, /SEC|EDGAR/i);
  assert.match(secProduct.description, /XBRL/i);

  await instance.close();
});