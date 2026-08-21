import test from "node:test";
import assert from "node:assert/strict";
import { buildApp } from "../src/app.mjs";

const PUBLIC_ORIGIN = "https://hermes-counterparty-api.onrender.com";
const EARNING_WALLET = "0x2BD7c4e294B09E9a853168a58712498D03A45B01";

const ROUTES = [
  ["/v1/counterparty-availability", "counterpartyAvailability", "0.030000"],
  ["/v1/entity-sanctions-screen", "entitySanctionsScreen", "0.020000"],
  ["/v1/company-domain-intelligence", "companyDomainIntelligence", "0.020000"],
  ["/v1/sec-company-snapshot", "secCompanySnapshot", "0.020000"],
  ["/v1/profile", "profileDataset", "0.020000"],
  ["/v1/duplicate-audit", "duplicateAudit", "0.005000"],
  ["/v1/quality-gate", "qualityGate", "0.010000"],
  ["/v1/schema-drift", "schemaDrift", "0.015000"],
  ["/v1/data-contract-check", "dataContractCheck", "0.015000"],
  ["/v1/clean-normalize", "cleanNormalize", "0.020000"],
  ["/v1/repair-plan", "repairPlan", "0.020000"],
];

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
      x402PayTo: EARNING_WALLET,
    },
    paymentPlugin: async () => {},
  });
}

test("GET /openapi.json publishes eleven AgentCash-compatible x402 operations", async () => {
  const server = app();
  const response = await server.inject({ method: "GET", url: "/openapi.json" });

  try {
    assert.equal(response.statusCode, 200);
    assert.match(response.headers["content-type"], /^application\/json/);
    const document = response.json();

    assert.equal(document.openapi, "3.1.0");
    assert.equal(document.info.title, "Hermes Agent Commerce API");
    assert.equal(document.info.version, "0.1.0");
    assert.match(document.info["x-guidance"], /x402/i);
    assert.match(document.info["x-guidance"], /eleven POST operations/i);
    assert.deepEqual(document.servers, [{ url: PUBLIC_ORIGIN }]);
    assert.deepEqual(Object.keys(document.paths).sort(), ROUTES.map(([path]) => path).sort());

    for (const [path, operationId, amount] of ROUTES) {
      const operation = document.paths[path]?.post;
      assert.ok(operation, `missing POST operation ${path}`);
      assert.equal(operation.operationId, operationId);
      assert.deepEqual(operation["x-payment-info"].protocols, [{ x402: {} }]);
      assert.deepEqual(operation["x-payment-info"].price, {
        mode: "fixed",
        currency: "USD",
        amount,
      });
      assert.equal(JSON.stringify(operation["x-payment-info"]).includes("mpp"), false);
      assert.equal(operation.requestBody.required, true);
      const inputSchema = operation.requestBody.content["application/json"].schema;
      assert.equal(inputSchema.type, "object");
      assert.ok(Object.keys(inputSchema.properties ?? {}).length > 0, `${path} input schema needs properties`);
      assert.ok(operation.requestBody.content["application/json"].example, `${path} needs a probe-safe example`);
      assert.equal(operation.responses["402"].description, "Payment Required");
      const outputSchema = operation.responses["200"].content["application/json"].schema;
      assert.equal(outputSchema.type, "object");
    }

    const sanctions = document.paths["/v1/entity-sanctions-screen"].post;
    const sanctionsSchema = sanctions.requestBody.content["application/json"].schema;
    assert.ok(sanctionsSchema.required.includes("name"));
    assert.equal(sanctionsSchema.properties.name.type, "string");
    assert.match(sanctions.description, /OFAC/i);
    assert.match(sanctions.description, /not a legal compliance determination/i);
    assert.equal(sanctions.responses["503"].description, "Authoritative OFAC source unavailable");

    const companyDomain = document.paths["/v1/company-domain-intelligence"].post;
    const companySchema = companyDomain.requestBody.content["application/json"].schema;
    assert.deepEqual(companySchema.required, ["domain"]);
    assert.equal(companySchema.properties.domain.type, "string");
    assert.match(companyDomain.description, /DNS/i);
    assert.match(companyDomain.description, /RDAP/i);
    assert.match(companyDomain.description, /website/i);
    assert.deepEqual(companyDomain.tags, ["Business Intelligence"]);
  } finally {
    await server.close();
  }
});
