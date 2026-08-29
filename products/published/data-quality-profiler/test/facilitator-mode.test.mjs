import test from "node:test";
import assert from "node:assert/strict";

const XPAY_URL = "https://facilitator.xpay.sh";
const CDP_URL = "https://api.cdp.coinbase.com/platform/v2/x402";

test("facilitator factory keeps XPay unauthenticated and enables Bazaar discovery client", async () => {
  const module = await import("../src/payments/x402-plugin.mjs");
  assert.equal(typeof module.buildFacilitatorConfig, "function");
  assert.equal(typeof module.buildFacilitatorClient, "function");

  const config = {
    x402FacilitatorMode: "xpay",
    x402FacilitatorUrl: XPAY_URL,
  };
  const facilitatorConfig = module.buildFacilitatorConfig(config);
  assert.equal(facilitatorConfig.url, XPAY_URL);
  assert.equal(facilitatorConfig.createAuthHeaders, undefined);

  const client = module.buildFacilitatorClient(config);
  assert.equal(typeof client.extensions?.bazaar?.listResources, "function");
});

test("facilitator factory builds authenticated Coinbase config in CDP mode and enables Bazaar discovery client", async () => {
  const module = await import("../src/payments/x402-plugin.mjs");
  assert.equal(typeof module.buildFacilitatorConfig, "function");
  assert.equal(typeof module.buildFacilitatorClient, "function");

  const config = {
    x402FacilitatorMode: "cdp",
    x402FacilitatorUrl: CDP_URL,
    cdpApiKeyId: "organizations/test/apiKeys/key",
    cdpApiKeySecret: "-----BEGIN EC PRIVATE KEY-----\nTEST\n-----END EC PRIVATE KEY-----",
  };
  const facilitatorConfig = module.buildFacilitatorConfig(config);
  assert.equal(facilitatorConfig.url, CDP_URL);
  assert.equal(typeof facilitatorConfig.createAuthHeaders, "function");

  const client = module.buildFacilitatorClient(config);
  assert.equal(typeof client.extensions?.bazaar?.listResources, "function");
});
