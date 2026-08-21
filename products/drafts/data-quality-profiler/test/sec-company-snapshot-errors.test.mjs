import test from "node:test";
import assert from "node:assert/strict";
import { buildApp } from "../src/app.mjs";

test("SEC snapshot rejects malformed selector requests with stable 400 errors before network work", async () => {
  let calls = 0;
  const app = buildApp({
    config: { serviceVersion: "0.1.0" },
    paymentPlugin: async () => {},
    secFetch: async () => { calls += 1; throw new Error("should not fetch"); },
  });

  for (const payload of [{}, { ticker: "AAPL", cik: "320193" }, { ticker: "bad ticker!" }, { cik: "abc" }]) {
    const response = await app.inject({ method: "POST", url: "/v1/sec-company-snapshot", payload });
    assert.equal(response.statusCode, 400);
    assert.equal(response.json().error.code, "INVALID_SEC_REQUEST");
  }
  assert.equal(calls, 0);
  await app.close();
});

test("SEC snapshot returns 404 for a ticker absent from the official SEC ticker map", async () => {
  const app = buildApp({
    config: { serviceVersion: "0.1.0" },
    paymentPlugin: async () => {},
    secFetch: async () => fakeResponse(200, {
      fields: ["cik", "name", "ticker", "exchange"],
      data: [[320193, "Apple Inc.", "AAPL", "Nasdaq"]],
    }),
  });

  const response = await app.inject({ method: "POST", url: "/v1/sec-company-snapshot", payload: { ticker: "ZZZZZZ" } });
  assert.equal(response.statusCode, 404);
  assert.equal(response.json().error.code, "SEC_COMPANY_NOT_FOUND");
  await app.close();
});

test("SEC snapshot returns 503 when a required SEC source is unavailable", async () => {
  const app = buildApp({
    config: { serviceVersion: "0.1.0" },
    paymentPlugin: async () => {},
    secFetch: async () => fakeResponse(503, { error: "temporary" }),
  });

  const response = await app.inject({ method: "POST", url: "/v1/sec-company-snapshot", payload: { cik: "320193" } });
  assert.equal(response.statusCode, 503);
  assert.equal(response.json().error.code, "SEC_SOURCE_UNAVAILABLE");
  await app.close();
});

function fakeResponse(status, body) {
  return {
    status,
    ok: status >= 200 && status < 300,
    async json() { return body; },
  };
}
