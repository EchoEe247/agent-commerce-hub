import test from "node:test";
import assert from "node:assert/strict";
import { buildApp } from "../src/app.mjs";

const EARNING_WALLET = "0x2BD7c4e294B09E9a853168a58712498D03A45B01";

function baseConfig() {
  return {
    serviceVersion: "0.1.0",
    x402Network: "eip155:8453",
    x402PayTo: EARNING_WALLET,
    x402CompanyDomainPrice: "$0.02",
  };
}

test("POST /v1/company-domain-intelligence delegates to the company domain service", async () => {
  let received;
  const server = buildApp({
    config: baseConfig(),
    paymentPlugin: async () => {},
    companyDomainIntelligence: async (payload) => {
      received = payload;
      return {
        schema_version: "1.0",
        query: { domain: payload.domain, normalized_domain: "example.com" },
        company: { display_name: "Example", source: "website_title", confidence: "high" },
        website: { reachable: true, https: true, final_url: "https://example.com/" },
        dns: { has_a: true, has_aaaa: false, addresses: ["93.184.216.34"] },
        mail: { has_mx: true, mx: [{ exchange: "mail.example.com", priority: 10 }] },
        security: { hsts: true, content_security_policy: false },
        sources: { website: "https://example.com/", dns: "system-resolver" },
        warnings: [],
      };
    },
  });

  const response = await server.inject({
    method: "POST",
    url: "/v1/company-domain-intelligence",
    payload: { domain: "Example.com" },
  });

  try {
    assert.equal(response.statusCode, 200);
    assert.deepEqual(received, { domain: "Example.com" });
    const body = response.json();
    assert.equal(body.query.normalized_domain, "example.com");
    assert.equal(body.website.reachable, true);
  } finally {
    await server.close();
  }
});
