import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";

import { buildApp } from "../src/app.mjs";
import { loadConfig } from "../src/config.mjs";

const API_KEY = "sk_test_provider";
const WEBHOOK_SECRET = "whsec_test_provider";

function configuredApp() {
  return buildApp({
    config: loadConfig({
      THE402_API_KEY: API_KEY,
      THE402_WEBHOOK_SECRET: WEBHOOK_SECRET,
    }),
  });
}

function signedHeaders(rawBody, timestamp = String(Math.floor(Date.now() / 1000))) {
  const signature = "sha256=" + createHmac("sha256", WEBHOOK_SECRET)
    .update(`${timestamp}.${rawBody}`)
    .digest("hex");
  return {
    "content-type": "application/json",
    "x-platform-secret": API_KEY,
    "x-webhook-timestamp": timestamp,
    "x-webhook-signature": signature,
  };
}

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

test("signed webhook verification uses the exact raw JSON bytes before parsing", async () => {
  const app = configuredApp();
  await app.ready();
  const rawBody = '{  "type" : "noop" , "value" : 1  }';

  try {
    const response = await app.inject({
      method: "POST",
      url: "/webhooks/the402",
      headers: signedHeaders(rawBody),
      payload: rawBody,
    });

    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.json(), { ok: true, accepted: false, type: "noop" });
  } finally {
    await app.close();
  }
});

test("webhook rejects a wrong platform API key before processing", async () => {
  const app = configuredApp();
  await app.ready();
  const rawBody = JSON.stringify({ type: "noop" });
  const headers = signedHeaders(rawBody);
  headers["x-platform-secret"] = "sk_forged";

  try {
    const response = await app.inject({ method: "POST", url: "/webhooks/the402", headers, payload: rawBody });
    assert.equal(response.statusCode, 401);
    assert.equal(response.json().error.code, "THE402_UNAUTHORIZED");
  } finally {
    await app.close();
  }
});

test("webhook rejects timestamps older than five minutes", async () => {
  const app = configuredApp();
  await app.ready();
  const rawBody = JSON.stringify({ type: "noop" });
  const timestamp = String(Math.floor(Date.now() / 1000) - 301);

  try {
    const response = await app.inject({
      method: "POST",
      url: "/webhooks/the402",
      headers: signedHeaders(rawBody, timestamp),
      payload: rawBody,
    });
    assert.equal(response.statusCode, 401);
    assert.equal(response.json().error.code, "THE402_STALE_SIGNATURE");
  } finally {
    await app.close();
  }
});

test("webhook rejects a payload changed after it was signed", async () => {
  const app = configuredApp();
  await app.ready();
  const signedBody = JSON.stringify({ type: "noop", value: 1 });
  const tamperedBody = JSON.stringify({ type: "noop", value: 2 });

  try {
    const response = await app.inject({
      method: "POST",
      url: "/webhooks/the402",
      headers: signedHeaders(signedBody),
      payload: tamperedBody,
    });
    assert.equal(response.statusCode, 401);
    assert.equal(response.json().error.code, "THE402_INVALID_SIGNATURE");
  } finally {
    await app.close();
  }
});
