import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { buildOpenApiDocument } from "../src/openapi-base.mjs";
import { buildLlmsDiscovery } from "../src/llms-discovery.mjs";
import { evaluateDistributionReadiness } from "../src/distribution-readiness.mjs";

function fixture(overrides = {}) {
  const openapi = buildOpenApiDocument({
    x402Price: "$0.02",
    x402LocalePrice: "$0.03",
    x402SanctionsScreenPrice: "$0.02",
    x402CompanyDomainPrice: "$0.02",
    x402SecCompanyPrice: "$0.02",
    x402DependencyVulnerabilityPrice: "$0.005",
    x402PackageMaintenancePrice: "$0.005",
    x402DuplicateAuditPrice: "$0.005",
    x402QualityGatePrice: "$0.01",
    x402SchemaDriftPrice: "$0.015",
    x402DataContractPrice: "$0.015",
    x402CleanNormalizePrice: "$0.02",
    x402RepairPlanPrice: "$0.02",
  });
  return {
    openapi,
    llmsText: buildLlmsDiscovery(openapi),
    facilitatorUrl: "https://facilitator.xpay.sh",
    ...overrides,
  };
}

function check(report, id) {
  return report.checks.find((item) => item.id === id);
}

test("current discovery branch is technically ready while publication remains explicit", () => {
  const report = evaluateDistributionReadiness(fixture());

  assert.equal(report.schema_version, "1.0");
  assert.equal(report.technical_status, "ready");
  assert.equal(report.paid_operation_count, 13);
  assert.equal(report.channels.x402scan.technical_status, "ready");
  assert.equal(report.channels.x402scan.publication_status, "registration_required");
  assert.equal(report.channels.x402scan.requires_explicit_approval, true);
  assert.equal(report.channels.agentcash.technical_status, "ready");
  assert.equal(report.channels.coinbase_bazaar.listing_status, "not_proven");
  assert.equal(report.channels.coinbase_bazaar.catalog_path, "not_available_via_current_facilitator");
  assert.equal(report.channels.index_402.publication_status, "direct_registration_recommended");
  assert.equal(report.channels.index_402.requires_explicit_approval, true);
  assert.equal(report.channels.index_402.registration_payloads.length, 13);
});

test("402 Index payloads are generated from OpenAPI examples rather than invented bodies", () => {
  const report = evaluateDistributionReadiness(fixture());
  const payload = report.channels.index_402.registration_payloads.find(
    (item) => item.url.endsWith("/v1/company-domain-intelligence"),
  );

  assert.deepEqual(payload, {
    url: "https://hermes-counterparty-api.onrender.com/v1/company-domain-intelligence",
    name: "Enrich a company domain with public DNS, mail, RDAP, and website signals",
    protocol: "x402",
    http_method: "POST",
    probe_body: JSON.stringify({ domain: "stripe.com" }),
  });
});

test("missing OpenAPI guidance blocks x402scan and AgentCash technical readiness", () => {
  const input = fixture();
  delete input.openapi.info["x-guidance"];
  const report = evaluateDistributionReadiness(input);

  assert.equal(report.technical_status, "not_ready");
  assert.equal(check(report, "openapi.guidance")?.status, "fail");
  assert.equal(report.channels.x402scan.technical_status, "not_ready");
  assert.equal(report.channels.agentcash.technical_status, "not_ready");
});

test("every paid operation must declare a 402 response and invocable input and output schemas", () => {
  const input = fixture();
  const company = input.openapi.paths["/v1/company-domain-intelligence"].post;
  delete company.responses["402"];
  delete company.requestBody.content["application/json"].schema;
  delete company.responses["200"].content["application/json"].schema;

  const report = evaluateDistributionReadiness(input);

  assert.equal(check(report, "openapi.paid_402")?.status, "fail");
  assert.equal(check(report, "openapi.input_schemas")?.status, "fail");
  assert.equal(check(report, "openapi.output_schemas")?.status, "fail");
});

test("llms catalog drift is reported without pretending the OpenAPI contract disappeared", () => {
  const input = fixture();
  input.llmsText = input.llmsText.replace(
    /- POST \/v1\/company-domain-intelligence[^\n]*\n/,
    "",
  );
  const report = evaluateDistributionReadiness(input);

  assert.equal(check(report, "llms.paid_catalog_coverage")?.status, "fail");
  assert.equal(check(report, "openapi.payment_metadata")?.status, "pass");
  assert.equal(report.technical_status, "not_ready");
});

test("CDP facilitator is classified only as a compatible Bazaar catalog path, never as proof of listing", () => {
  const report = evaluateDistributionReadiness(fixture({
    facilitatorUrl: "https://api.cdp.coinbase.com/platform/v2/x402",
  }));

  assert.equal(report.channels.coinbase_bazaar.catalog_path, "compatible_catalog_path");
  assert.equal(report.channels.coinbase_bazaar.listing_status, "not_proven");
});

test("missing public contact email is a recommendation, not a discovery failure", () => {
  const report = evaluateDistributionReadiness(fixture());

  assert.equal(check(report, "openapi.contact_email")?.status, "warn");
  assert.equal(report.technical_status, "ready");
});

test("distribution readiness CLI emits production-profile JSON without publishing anything", () => {
  const result = spawnSync(process.execPath, ["scripts/distribution-readiness-check.mjs"], {
    cwd: new URL("..", import.meta.url),
    env: {
      ...process.env,
      X402_FACILITATOR_URL: "https://facilitator.xpay.sh",
    },
    encoding: "utf8",
  });

  assert.equal(result.status, 0, result.stderr);
  const report = JSON.parse(result.stdout);
  assert.equal(report.technical_status, "ready");
  assert.equal(report.paid_operation_count, 13);
  assert.equal(report.facilitator.classification, "xpay");
  assert.equal(report.channels.index_402.registration_payloads.length, 13);
  assert.equal(report.publication_actions.every((item) => item.status !== "published"), true);
});

test("package exposes a repeatable distribution readiness command", () => {
  const packageJson = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
  assert.equal(packageJson.scripts["check:distribution-readiness"], "node scripts/distribution-readiness-check.mjs");
});
