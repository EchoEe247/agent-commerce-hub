import test from "node:test";
import assert from "node:assert/strict";
import { buildApp } from "../src/app.mjs";

test("POST /v1/sec-company-snapshot delegates to the SEC snapshot service", async () => {
  const calls = [];
  const app = buildApp({
    config: { serviceVersion: "0.1.0" },
    paymentPlugin: async () => {},
    secCompanySnapshot: async (payload) => {
      calls.push(payload);
      return {
        schema_version: "1.0",
        query: { ticker: "AAPL", cik: null },
        company: { cik: "0000320193", name: "Apple Inc." },
        filings: {},
        facts: {},
        source: { provider: "SEC EDGAR" },
        warnings: [],
      };
    },
  });

  const response = await app.inject({
    method: "POST",
    url: "/v1/sec-company-snapshot",
    payload: { ticker: "AAPL" },
  });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(calls, [{ ticker: "AAPL" }]);
  assert.equal(response.json().company.cik, "0000320193");
  await app.close();
});
