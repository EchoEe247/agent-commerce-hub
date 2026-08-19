import test from "node:test";
import assert from "node:assert/strict";
import { loadConfig } from "../src/config.mjs";

test("defaults to local unpaid development mode", () => {
  const cfg = loadConfig({});
  assert.equal(cfg.x402Enabled, false);
  assert.equal(cfg.x402Network, "eip155:84532");
  assert.equal(cfg.x402Price, "$0.02");
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
