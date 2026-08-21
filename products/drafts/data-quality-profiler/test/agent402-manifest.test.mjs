import test from "node:test";
import assert from "node:assert/strict";
import { buildApp } from "../src/app.mjs";

const PUBLIC_ORIGIN = "https://hermes-counterparty-api.onrender.com";

function app() {
  return buildApp({
    config: {
      serviceVersion: "0.1.0",
      x402Price: "$0.02",
      x402LocalePrice: "$0.03",
      x402DuplicateAuditPrice: "$0.005",
      x402QualityGatePrice: "$0.01",
      x402SchemaDriftPrice: "$0.015",
      x402DataContractPrice: "$0.015",
      x402CleanNormalizePrice: "$0.02",
      x402RepairPlanPrice: "$0.02",
      x402Network: "eip155:8453",
      x402PayTo: "0x2BD7c4e294B09E9a853168a58712498D03A45B01",
    },
    paymentPlugin: async () => {},
  });
}

test("manifest resources declare POST explicitly so Agent402 does not synthesize GET duplicates", async () => {
  const instance = app();
  const response = await instance.inject({ method: "GET", url: "/.well-known/x402" });
  assert.equal(response.statusCode, 200);
  const body = response.json();

  assert.equal(body.resources.length, 8);
  assert.equal(new Set(body.resources.map((resource) => resource.url)).size, 8);
  for (const resource of body.resources) {
    assert.equal(resource.method, "POST");
    assert.match(resource.url, new RegExp(`^${PUBLIC_ORIGIN.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/v1/`));
  }

  await instance.close();
});
