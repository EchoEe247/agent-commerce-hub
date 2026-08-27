import test from "node:test";
import assert from "node:assert/strict";
import {
  buildSignedAtelierRegistrationPayload,
  parseAtelierRegistrationCredentials,
  registerAtelierAgent,
} from "../src/atelier/registration-client.js";
import { generateAtelierSolanaWalletMaterial } from "../src/atelier/solana-auth.js";

test("signed registration payload uses one Solana address and millisecond timestamp", () => {
  const wallet = generateAtelierSolanaWalletMaterial();
  try {
    const timestamp = 1_787_834_985_999;
    const payload = buildSignedAtelierRegistrationPayload({
      privateKeyPkcs8: wallet.privateKeyPkcs8,
      address: wallet.address,
      timestamp,
    });
    assert.equal(payload.owner_wallet, wallet.address);
    assert.equal(payload.wallet, wallet.address);
    assert.equal(payload.wallet_sig_ts, timestamp);
    assert.ok(payload.wallet_sig.length > 60);
    assert.equal(payload.name, "SetupPatch");
  } finally {
    wallet.privateKeyPkcs8.fill(0);
  }
});

test("registration performs exactly one unauthenticated POST and captures one-time credentials", async () => {
  const requests: Array<{ url: string; method: string; authorization: string | null }> = [];
  const fetchImpl = (async (input: URL | RequestInfo, init?: RequestInit): Promise<Response> => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    const headers = new Headers(init?.headers);
    requests.push({ url, method: init?.method ?? "GET", authorization: headers.get("authorization") });
    return new Response(JSON.stringify({
      success: true,
      data: {
        agent: { id: "ext_setup_patch" },
        api_key: "atelier_onceonlykey",
        webhook_secret: "whsec_example",
      },
    }), { status: 201 });
  }) as typeof fetch;

  const wallet = generateAtelierSolanaWalletMaterial();
  try {
    const payload = buildSignedAtelierRegistrationPayload({
      privateKeyPkcs8: wallet.privateKeyPkcs8,
      address: wallet.address,
      timestamp: 1_787_834_986_000,
    });
    const result = await registerAtelierAgent(payload, { fetchImpl, baseUrl: "https://api.test" });
    assert.equal(requests.length, 1);
    assert.equal(requests[0]?.url, "https://api.test/api/agents/register");
    assert.equal(requests[0]?.method, "POST");
    assert.equal(requests[0]?.authorization, null);
    assert.deepEqual(result.credentials, {
      agentId: "ext_setup_patch",
      apiKey: "atelier_onceonlykey",
      webhookSecret: "whsec_example",
    });
  } finally {
    wallet.privateKeyPkcs8.fill(0);
  }
});

test("registration credential parser rejects missing API key", () => {
  assert.throws(
    () => parseAtelierRegistrationCredentials({ success: true, data: { agent_id: "ext_1" } }),
    /missing a valid API key/,
  );
});
