import test from "node:test";
import assert from "node:assert/strict";
import { buildApp } from "../src/app.mjs";
import { registerRootLanding } from "../src/root-landing.mjs";

function appWithRootLanding() {
  const app = buildApp({
    config: { serviceVersion: "0.1.0" },
    paymentPlugin: async () => {},
  });
  registerRootLanding(app);
  return app;
}

test("GET / presents a bounded human-readable API discovery page", async () => {
  const app = appWithRootLanding();
  const response = await app.inject({ method: "GET", url: "/" });

  assert.equal(response.statusCode, 200);
  assert.match(response.headers["content-type"], /^text\/html/);
  assert.equal(response.headers["cache-control"], "public, max-age=300");
  assert.equal(response.headers["x-content-type-options"], "nosniff");
  assert.match(response.headers["content-security-policy"], /default-src 'none'/);
  assert.match(response.body, /Hermes Agent Commerce API/);
  assert.match(response.body, /13 API tools/);
  assert.match(response.body, /href="\/openapi\.json"/);
  assert.match(response.body, /href="\/llms\.txt"/);
  assert.match(response.body, /href="\/\.well-known\/x402"/);
  assert.match(response.body, /href="\/health"/);
  assert.ok(Buffer.byteLength(response.body, "utf8") < 16 * 1024);

  await app.close();
});
