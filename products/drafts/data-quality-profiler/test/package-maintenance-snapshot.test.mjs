import test from "node:test";
import assert from "node:assert/strict";
import { buildApp } from "../src/app.mjs";

// Product #13 route/service seam.
test("POST /v1/package-maintenance-snapshot delegates to the package maintenance service", async () => {
  const calls = [];
  const app = buildApp({
    config: { serviceVersion: "0.1.0" },
    paymentPlugin: async () => {},
    packageMaintenanceSnapshot: async (payload) => {
      calls.push(payload);
      return {
        schema_version: "1.0",
        query: { ecosystem: "npm", package: "fastify", version: "5.6.0" },
        package: {
          name: "fastify",
          requested_version: "5.6.0",
          latest_version: "5.6.0",
        },
        source: { provider: "npm registry" },
        warnings: [],
      };
    },
  });

  const response = await app.inject({
    method: "POST",
    url: "/v1/package-maintenance-snapshot",
    payload: { ecosystem: "npm", package: "fastify", version: "5.6.0" },
  });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(calls, [{ ecosystem: "npm", package: "fastify", version: "5.6.0" }]);
  assert.equal(response.json().package.latest_version, "5.6.0");
  await app.close();
});
