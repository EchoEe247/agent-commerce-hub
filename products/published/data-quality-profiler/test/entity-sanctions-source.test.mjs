import test from "node:test";
import assert from "node:assert/strict";
import { buildApp } from "../src/app.mjs";

const EARNING_WALLET = "0x2BD7c4e294B09E9a853168a58712498D03A45B01";

function config() {
  return {
    serviceVersion: "0.1.0",
    x402Network: "eip155:8453",
    x402PayTo: EARNING_WALLET,
    x402SanctionsScreenPrice: "$0.02",
  };
}

function unusableOfacFetch() {
  return async () => ({
    ok: true,
    status: 200,
    headers: { get: () => null },
    text: async () => "",
  });
}

test("fails closed when OFAC responds 200 but the SDN snapshot contains no usable records", async () => {
  const server = buildApp({
    config: config(),
    paymentPlugin: async () => {},
    ofacFetch: unusableOfacFetch(),
  });

  const response = await server.inject({
    method: "POST",
    url: "/v1/entity-sanctions-screen",
    payload: { name: "ACME SHIPPING LLC" },
  });

  try {
    assert.equal(response.statusCode, 503);
    assert.equal(response.json().error.code, "SANCTIONS_SOURCE_UNAVAILABLE");
  } finally {
    await server.close();
  }
});

test("rejects unsupported entity_type before contacting OFAC", async () => {
  let sourceCalls = 0;
  const server = buildApp({
    config: config(),
    paymentPlugin: async () => {},
    ofacFetch: async () => {
      sourceCalls += 1;
      throw new Error("OFAC should not be contacted for an invalid entity_type");
    },
  });

  const response = await server.inject({
    method: "POST",
    url: "/v1/entity-sanctions-screen",
    payload: { name: "ACME SHIPPING LLC", entity_type: "company" },
  });

  try {
    assert.equal(response.statusCode, 400);
    assert.equal(response.json().error.code, "INVALID_SANCTIONS_REQUEST");
    assert.equal(sourceCalls, 0);
  } finally {
    await server.close();
  }
});
