import test from "node:test";
import assert from "node:assert/strict";
import { buildApp } from "../src/app.mjs";

function unpaidApp() {
  return buildApp({
    config: { serviceVersion: "0.1.0", x402CompanyDomainPrice: "$0.02" },
    paymentPlugin: async () => {},
  });
}

test("GET /llms.txt exposes the free company-research acquisition path without payment", async () => {
  const app = unpaidApp();
  const response = await app.inject({ method: "GET", url: "/llms.txt" });

  assert.equal(response.statusCode, 200);
  assert.match(response.headers["content-type"] ?? "", /^text\/plain/);
  assert.equal(response.headers["payment-required"], undefined);

  const body = response.body;
  assert.match(body, /research a company/i);
  assert.match(body, /enrich (?:a )?(?:company )?domain/i);
  assert.match(body, /qualif(?:y|ication).{0,20}(?:a )?lead/i);
  assert.match(body, /\/v1\/company-domain-intelligence\/preview/);
  assert.match(body, /\/v1\/company-domain-intelligence/);
  assert.match(body, /\$0\.02/);

  await app.close();
});
