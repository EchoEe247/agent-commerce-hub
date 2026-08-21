import test from "node:test";
import assert from "node:assert/strict";

import { buildApp } from "../src/app.mjs";
import { loadConfig } from "../src/config.mjs";

test("POST /webhooks/the402 fails closed when provider credentials are not configured", async () => {
  const app = buildApp({ config: loadConfig({}) });
  await app.ready();

  try {
    const response = await app.inject({
      method: "POST",
      url: "/webhooks/the402",
      headers: { "content-type": "application/json" },
      payload: JSON.stringify({ type: "job_dispatch", job_id: "job_test" }),
    });

    assert.equal(response.statusCode, 503);
    assert.deepEqual(response.json(), {
      error: {
        code: "THE402_NOT_CONFIGURED",
        message: "the402 provider webhook is not configured",
      },
    });
  } finally {
    await app.close();
  }
});
