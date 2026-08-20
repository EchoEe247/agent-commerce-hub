import test from "node:test";
import assert from "node:assert/strict";
import { buildApp } from "../src/app.mjs";

function unpaidApp(options = {}) {
  return buildApp({ config: { serviceVersion: "0.1.0" }, paymentPlugin: async () => {}, ...options });
}

test("POST /v1/counterparty-availability returns deterministic availability brief", async () => {
  const fixed = Date.parse("2026-08-20T13:00:00.000Z");
  const app = unpaidApp({ clock: { now: () => fixed } });
  const response = await app.inject({
    method: "POST",
    url: "/v1/counterparty-availability",
    payload: { country_code: "US", timezone: "America/Chicago" },
  });
  assert.equal(response.statusCode, 200);
  const body = response.json();
  assert.equal(body.country.code, "US");
  assert.equal(body.local.date, "2026-08-20");
  assert.equal(body.local.time, "08:00");
  assert.equal(body.business.business_days_remaining_this_week, 2);
  await app.close();
});

test("counterparty availability rejects unsupported country before work", async () => {
  const app = unpaidApp();
  const response = await app.inject({
    method: "POST",
    url: "/v1/counterparty-availability",
    payload: { country_code: "ZZ" },
  });
  assert.equal(response.statusCode, 400);
  assert.equal(response.json().error.code, "UNSUPPORTED_COUNTRY");
  await app.close();
});

test("counterparty availability rejects invalid timezone", async () => {
  const app = unpaidApp();
  const response = await app.inject({
    method: "POST",
    url: "/v1/counterparty-availability",
    payload: { country_code: "US", timezone: "Mars/Olympus" },
  });
  assert.equal(response.statusCode, 400);
  assert.equal(response.json().error.code, "INVALID_TIMEZONE");
  await app.close();
});
