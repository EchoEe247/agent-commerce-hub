import test from "node:test";
import assert from "node:assert/strict";
import { buildApp } from "../src/app.mjs";
import { buildPaymentPlugin } from "../src/payments/x402-plugin.mjs";

test("GET /health is payment-free", async () => {
  const app = buildApp({ config: { serviceVersion: "0.1.0" }, paymentPlugin: buildPaymentPlugin({ x402Enabled: true, x402Network: "eip155:84532", x402PayTo: "0x0000000000000000000000000000000000000001", x402Price: "$0.02" }) });
  const response = await app.inject({ method: "GET", url: "/health" });
  assert.equal(response.statusCode, 200);
  await app.close();
});

test("paid endpoints require x402 header when enabled", async () => {
  const app = buildApp({ config: { serviceVersion: "0.1.0" }, paymentPlugin: buildPaymentPlugin({ x402Enabled: true, x402Network: "eip155:84532", x402PayTo: "0x0000000000000000000000000000000000000001", x402Price: "$0.02" }) });
  const response = await app.inject({ method: "POST", url: "/v1/profile", payload: {} });
  assert.equal(response.statusCode, 402);
  await app.close();
});

test("paid endpoints accept valid x402 header", async () => {
  const plugin = buildPaymentPlugin({ x402Enabled: true, x402Network: "eip155:84532", x402PayTo: "0x0000000000000000000000000000000000000001", x402Price: "$0.02" });
  const app = buildApp({ config: { serviceVersion: "0.1.0" }, paymentPlugin: plugin });
  const response = await app.inject({
    method: "POST",
    url: "/v1/profile",
    headers: { "x402": JSON.stringify({ scheme: "exact", network: "eip155:84532", payload: { signature: "0xabc", authorization: { from: "0xbuyer", to: "0x0000000000000000000000000000000000000001", amount: "10000" } } }) },
    payload: { format: "json", records: [{ id: 1 }] },
  });
  assert.equal(response.statusCode, 200);
  await app.close();
});

test("disabled plugin leaves /v1/profile reachable without payment", async () => {
  const plugin = buildPaymentPlugin({ x402Enabled: false, x402Network: "eip155:84532", x402PayTo: "0x0000000000000000000000000000000000000001", x402Price: "$0.02" });
  const app = buildApp({ config: { serviceVersion: "0.1.0" }, paymentPlugin: plugin });
  const response = await app.inject({
    method: "POST",
    url: "/v1/profile",
    payload: { format: "json", records: [{ id: 1 }] },
  });
  assert.equal(response.statusCode, 200);
  await app.close();
});
