import test from "node:test";
import assert from "node:assert/strict";
import { loadConfig } from "../src/config.mjs";

test("defaults to local unpaid development mode", () => {
  const cfg = loadConfig({});
  assert.equal(cfg.x402Enabled, false);
  assert.equal(cfg.x402Network, "eip155:84532");
  assert.equal(cfg.x402Price, "$0.02");
  assert.equal(cfg.x402LocalePrice, "$0.03");
  assert.equal(cfg.x402SanctionsScreenPrice, "$0.02");
  assert.equal(cfg.x402CompanyDomainPrice, "$0.02");
  assert.equal(cfg.x402DuplicateAuditPrice, "$0.005");
  assert.equal(cfg.x402QualityGatePrice, "$0.01");
  assert.equal(cfg.x402SchemaDriftPrice, "$0.015");
  assert.equal(cfg.x402DataContractPrice, "$0.015");
  assert.equal(cfg.x402CleanNormalizePrice, "$0.02");
  assert.equal(cfg.x402RepairPlanPrice, "$0.02");
  assert.equal(cfg.x402FacilitatorUrl, "https://x402.org/facilitator");
  assert.equal(cfg.allowMainnet, false);
});

test("allows route-specific price overrides", () => {
  const cfg = loadConfig({
    X402_SANCTIONS_SCREEN_PRICE: "$0.025",
    X402_COMPANY_DOMAIN_PRICE: "$0.026",
    X402_DUPLICATE_AUDIT_PRICE: "$0.006",
    X402_QUALITY_GATE_PRICE: "$0.011",
    X402_SCHEMA_DRIFT_PRICE: "$0.016",
    X402_DATA_CONTRACT_PRICE: "$0.017",
    X402_CLEAN_NORMALIZE_PRICE: "$0.021",
    X402_REPAIR_PLAN_PRICE: "$0.022",
  });
  assert.equal(cfg.x402SanctionsScreenPrice, "$0.025");
  assert.equal(cfg.x402CompanyDomainPrice, "$0.026");
  assert.equal(cfg.x402DuplicateAuditPrice, "$0.006");
  assert.equal(cfg.x402QualityGatePrice, "$0.011");
  assert.equal(cfg.x402SchemaDriftPrice, "$0.016");
  assert.equal(cfg.x402DataContractPrice, "$0.017");
  assert.equal(cfg.x402CleanNormalizePrice, "$0.021");
  assert.equal(cfg.x402RepairPlanPrice, "$0.022");
});

test("requires a receiving address when x402 is enabled", () => {
  assert.throws(
    () => loadConfig({ X402_ENABLED: "true" }),
    /X402_PAY_TO is required/
  );
});

test("refuses Base mainnet unless explicitly unlocked", () => {
  assert.throws(
    () => loadConfig({
      X402_ENABLED: "true",
      X402_PAY_TO: "0x0000000000000000000000000000000000000001",
      X402_NETWORK: "eip155:8453",
    }),
    /mainnet is disabled/
  );
});

test("allows Base mainnet only when explicitly unlocked", () => {
  const cfg = loadConfig({
    X402_ENABLED: "true",
    X402_PAY_TO: "0x0000000000000000000000000000000000000001",
    X402_NETWORK: "eip155:8453",
    ALLOW_MAINNET: "true",
  });
  assert.equal(cfg.x402Network, "eip155:8453");
  assert.equal(cfg.x402LocalePrice, "$0.03");
  assert.equal(cfg.x402SanctionsScreenPrice, "$0.02");
  assert.equal(cfg.x402CompanyDomainPrice, "$0.02");
});

test("rejects arbitrary non-Sepolia, non-Base networks (fail-closed)", () => {
  assert.throws(
    () => loadConfig({
      X402_ENABLED: "true",
      X402_PAY_TO: "0x0000000000000000000000000000000000000001",
      X402_NETWORK: "eip155:1",
    }),
    /not an allowed network/
  );
  assert.throws(
    () => loadConfig({
      X402_ENABLED: "true",
      X402_PAY_TO: "0x0000000000000000000000000000000000000001",
      X402_NETWORK: "eip155:137",
    }),
    /not an allowed network/
  );
});

test("allows Base Sepolia (eip155:84532)", () => {
  assert.doesNotThrow(() =>
    loadConfig({
      X402_ENABLED: "true",
      X402_PAY_TO: "0x0000000000000000000000000000000000000001",
      X402_NETWORK: "eip155:84532",
    })
  );
});
