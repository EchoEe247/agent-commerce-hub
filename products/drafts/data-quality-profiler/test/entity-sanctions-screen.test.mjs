import test from "node:test";
import assert from "node:assert/strict";
import { buildApp } from "../src/app.mjs";

const EARNING_WALLET = "0x2BD7c4e294B09E9a853168a58712498D03A45B01";

function appWithScreen(screen) {
  return buildApp({
    config: {
      serviceVersion: "0.1.0",
      x402Network: "eip155:8453",
      x402PayTo: EARNING_WALLET,
      x402SanctionsScreenPrice: "$0.02",
    },
    paymentPlugin: async () => {},
    entitySanctionsScreen: screen,
  });
}

test("POST /v1/entity-sanctions-screen delegates to the screening service and returns its result", async () => {
  let received;
  const server = appWithScreen(async (payload) => {
    received = payload;
    return {
      schema_version: "1.0",
      query: { name: payload.name, normalized_name: "acme shipping" },
      matches_found: false,
      candidates: [],
      source: { provider: "OFAC", list: "SDN" },
      warnings: ["Screening result is informational and is not a legal compliance determination."],
    };
  });

  const response = await server.inject({
    method: "POST",
    url: "/v1/entity-sanctions-screen",
    payload: { name: "Acme Shipping" },
  });

  try {
    assert.equal(response.statusCode, 200);
    assert.deepEqual(received, { name: "Acme Shipping" });
    const body = response.json();
    assert.equal(body.schema_version, "1.0");
    assert.equal(body.query.name, "Acme Shipping");
    assert.equal(body.matches_found, false);
    assert.deepEqual(body.candidates, []);
  } finally {
    await server.close();
  }
});
