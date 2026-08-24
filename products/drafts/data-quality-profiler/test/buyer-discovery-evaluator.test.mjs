import test from "node:test";
import assert from "node:assert/strict";
import { declareDiscoveryExtension } from "@x402/extensions/bazaar";
import { BUYER_INTENTS } from "../src/discovery/buyer-intents.mjs";
import { evaluateBuyerDiscovery } from "../src/discovery/buyer-discovery-evaluator.mjs";

const PREVIEW_PATH = "/v1/company-domain-intelligence/preview";
const PAID_PATH = "/v1/company-domain-intelligence";
const PAY_TO = "0x0000000000000000000000000000000000000001";

function makeBazaar() {
  return declareDiscoveryExtension({
    method: "POST",
    bodyType: "json",
    input: { domain: "stripe.com" },
    inputSchema: {
      type: "object",
      properties: { domain: { type: "string" } },
      required: ["domain"],
    },
    output: {
      example: {
        schema_version: "1.0",
        company: { display_name: "Stripe" },
      },
      schema: {
        type: "object",
        properties: {
          schema_version: { type: "string" },
          company: { type: "object" },
        },
        required: ["schema_version", "company"],
      },
    },
  }).bazaar;
}

function encodeChallenge(overrides = {}) {
  const challenge = {
    x402Version: 2,
    accepts: [{
      scheme: "exact",
      network: "eip155:84532",
      payTo: PAY_TO,
      amount: "20000",
    }],
    extensions: { bazaar: makeBazaar() },
    ...overrides,
  };
  return Buffer.from(JSON.stringify(challenge)).toString("base64");
}

function makeFixture() {
  const openapi = {
    openapi: "3.1.0",
    info: {
      title: "Hermes Agent Commerce API",
      "x-guidance": "Research a company, enrich a domain, investigate a business, qualify a lead, or inspect a company website.",
    },
    paths: {
      [PREVIEW_PATH]: {
        post: {
          operationId: "previewCompanyDomainIntelligence",
          summary: "Free company and domain intelligence preview",
          requestBody: {
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: { domain: { type: "string" } },
                  required: ["domain"],
                },
              },
            },
          },
          responses: { "200": { description: "preview" } },
        },
      },
      [PAID_PATH]: {
        post: {
          operationId: "companyDomainIntelligenceEnrichment",
          summary: "Research and enrich a company domain",
          "x-payment-info": {
            protocols: [{ x402: {} }],
            price: { mode: "fixed", currency: "USD", amount: "0.020000" },
          },
          requestBody: {
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: { domain: { type: "string" } },
                  required: ["domain"],
                },
              },
            },
          },
          responses: {
            "200": {
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: { company: { type: "object" } },
                  },
                },
              },
            },
            "402": { description: "Payment Required" },
          },
        },
      },
    },
  };

  return {
    intents: BUYER_INTENTS,
    openapi,
    llmsText: "Research a company. Enrich a domain. Investigate a business. Qualify a lead. Inspect a company website. Start with /v1/company-domain-intelligence/preview then use /v1/company-domain-intelligence.",
    previewObservation: {
      statusCode: 200,
      paymentRequiredHeader: null,
      body: {
        preview: true,
        upgrade: { path: PAID_PATH, price_usd: 0.02 },
      },
    },
    paidBoundaryObservation: {
      statusCode: 402,
      paymentRequiredHeader: encodeChallenge(),
    },
    target: "fixture",
  };
}

function byCode(report, code) {
  return report.checks.find((item) => item.code === code);
}

test("valid discovery funnel passes all five buyer intents and required checks", () => {
  const report = evaluateBuyerDiscovery(makeFixture());
  assert.equal(report.schema_version, "1.0");
  assert.equal(report.overall, "pass", JSON.stringify(report, null, 2));
  assert.equal(report.intent_results.length, 5);
  assert.equal(report.intent_results.every((item) => item.matched), true);
  assert.equal(report.summary.failed, 0);
});

test("missing qualify-lead vocabulary fails LLMS_INTENT_COVERAGE_MISSING without hiding other intent results", () => {
  const fixture = makeFixture();
  fixture.openapi.info["x-guidance"] = "Research a company, enrich a domain, investigate a business, or inspect a company website.";
  fixture.llmsText = "Research a company. Enrich a domain. Investigate a business. Inspect a company website.";
  const report = evaluateBuyerDiscovery(fixture);
  assert.equal(report.overall, "fail");
  assert.equal(byCode(report, "LLMS_INTENT_COVERAGE_MISSING")?.status, "fail");
  assert.equal(report.intent_results.find((item) => item.intent_id === "qualify_lead")?.matched, false);
  assert.equal(report.intent_results.filter((item) => item.matched).length, 4);
});

test("preview payment metadata fails PREVIEW_NOT_FREE", () => {
  const fixture = makeFixture();
  fixture.openapi.paths[PREVIEW_PATH].post["x-payment-info"] = {
    protocols: [{ x402: {} }],
    price: { mode: "fixed", currency: "USD", amount: "0.001000" },
  };
  const report = evaluateBuyerDiscovery(fixture);
  assert.equal(byCode(report, "PREVIEW_NOT_FREE")?.status, "fail");
});

test("wrong preview upgrade path fails PREVIEW_UPGRADE_MISMATCH", () => {
  const fixture = makeFixture();
  fixture.previewObservation.body.upgrade.path = "/v1/wrong";
  const report = evaluateBuyerDiscovery(fixture);
  assert.equal(byCode(report, "PREVIEW_UPGRADE_MISMATCH")?.status, "fail");
});

test("paid response other than 402 fails PAID_BOUNDARY_NOT_402", () => {
  const fixture = makeFixture();
  fixture.paidBoundaryObservation.statusCode = 200;
  const report = evaluateBuyerDiscovery(fixture);
  assert.equal(byCode(report, "PAID_BOUNDARY_NOT_402")?.status, "fail");
});

test("malformed payment-required header fails X402_CHALLENGE_INVALID", () => {
  const fixture = makeFixture();
  fixture.paidBoundaryObservation.paymentRequiredHeader = "not-base64-json";
  const report = evaluateBuyerDiscovery(fixture);
  assert.equal(byCode(report, "X402_CHALLENGE_INVALID")?.status, "fail");
});

test("invalid Bazaar metadata fails BAZAAR_METADATA_INVALID", () => {
  const fixture = makeFixture();
  fixture.paidBoundaryObservation.paymentRequiredHeader = encodeChallenge({ extensions: { bazaar: { bad: true } } });
  const report = evaluateBuyerDiscovery(fixture);
  assert.equal(byCode(report, "BAZAAR_METADATA_INVALID")?.status, "fail");
});
