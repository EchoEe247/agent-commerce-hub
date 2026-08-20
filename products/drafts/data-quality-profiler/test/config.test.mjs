import test from "node:test";
import assert from "node:assert/strict";
import { loadConfig } from "../src/config.mjs";

test("defaults to local unpaid development mode", () => {
  const cfg = loadConfig({});
  assert.equal(cfg.x402Enabled, false);
  assert.equal(cfg.x402Network, "eip155:84532");
  assert.equal(cfg.x402Price, "$0.02");
  assert.equal(cfg.x402LocalePrice, "$0.03");
  assert.equal(cfg.x402FacilitatorUrl, "https://x402.org/facilitator");
  assert.equal(cfg.allowMainnet, false);
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
