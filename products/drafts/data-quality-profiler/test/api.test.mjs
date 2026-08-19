import test from "node:test";
import assert from "node:assert/strict";
import { buildApp } from "../src/app.mjs";

test("GET /health returns service identity without payment", async () => {
  const app = buildApp({
    config: { serviceVersion: "0.1.0" },
    paymentPlugin: async () => {},
  });
  const response = await app.inject({ method: "GET", url: "/health" });
  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), {
    ok: true,
    service: "data-quality-profiler",
    version: "0.1.0",
  });
  await app.close();
});
