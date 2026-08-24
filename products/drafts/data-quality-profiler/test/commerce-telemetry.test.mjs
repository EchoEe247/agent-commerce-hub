import test from "node:test";
import assert from "node:assert/strict";
import { buildApp } from "../src/app.mjs";

const EARNING_WALLET = "0x2BD7c4e294B09E9a853168a58712498D03A45B01";

function config() {
  return {
    serviceVersion: "0.1.0",
    x402Network: "eip155:8453",
    x402PayTo: EARNING_WALLET,
    x402CompanyDomainPrice: "$0.02",
  };
}

function companyResult(payload) {
  return {
    schema_version: "1.0",
    query: { domain: payload.domain, normalized_domain: "example.com" },
    company: { display_name: "Example Inc", confidence: "high" },
    website: { reachable: true, https: true, status_code: 200, title: "Example Inc", description: "Example" },
    mail: { has_mx: true, spf_present: true, dmarc_present: true },
    security: { hsts: true, content_security_policy: true },
    warnings: [],
  };
}

test("commerce telemetry classifies Agent402 discovery traffic as a marketplace probe", async () => {
  const entries = [];
  const server = buildApp({
    config: config(),
    paymentPlugin: async () => {},
    logger: { log: (line) => entries.push(JSON.parse(line)) },
    companyDomainIntelligence: async (payload) => companyResult(payload),
  });

  const response = await server.inject({
    method: "POST",
    url: "/v1/company-domain-intelligence/preview",
    headers: { "user-agent": "Agent402-Indexer/2.0" },
    payload: { domain: "example.com" },
  });

  try {
    assert.equal(response.statusCode, 200);
    const event = entries.find((entry) => entry.event === "commerce_request");
    assert.ok(event);
    assert.equal(event.traffic_class, "marketplace_probe");
    assert.equal(event.source, "agent402");
  } finally {
    await server.close();
  }
});
