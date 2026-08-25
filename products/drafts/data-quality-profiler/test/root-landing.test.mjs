import test from "node:test";
import assert from "node:assert/strict";
import { buildApp } from "../src/app.mjs";

function unpaidApp() {
  return buildApp({
    config: { serviceVersion: "0.1.0" },
    paymentPlugin: async () => {},
  });
}

test("GET / presents a human-readable commerce landing page", async () => {
  const app = unpaidApp();
  const response = await app.inject({ method: "GET", url: "/" });

  assert.equal(response.statusCode, 200);
  assert.match(response.headers["content-type"], /^text\/html/);
  assert.match(response.body, /Hermes Agent Commerce API/);
  assert.match(response.body, /13 paid x402 tools/);
  assert.match(response.body, /href="\/openapi\.json"/);
  assert.match(response.body, /href="\/llms\.txt"/);
  assert.match(response.body, /href="\/\.well-known\/x402"/);
  assert.match(response.body, /href="\/health"/);

  await app.close();
});
