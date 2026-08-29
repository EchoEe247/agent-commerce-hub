import test from "node:test";
import assert from "node:assert/strict";
import { buildApp } from "../src/app.mjs";

function fakeResponse(status, body) {
  return { status, ok: status >= 200 && status < 300, headers: new Headers({ "content-type": "application/json" }), async text() { return typeof body === "string" ? body : JSON.stringify(body); } };
}

function appWith(packageRegistryFetch) {
  return buildApp({ config: { serviceVersion: "0.1.0" }, paymentPlugin: async () => {}, packageRegistryFetch });
}

test("package maintenance rejects malformed selector with 400 before registry work", async () => {
  let calls = 0;
  const app = appWith(async () => { calls += 1; return fakeResponse(200, {}); });
  const response = await app.inject({ method: "POST", url: "/v1/package-maintenance-snapshot", payload: { ecosystem: "npm", package: "fastify" } });
  assert.equal(response.statusCode, 400);
  assert.equal(response.json().error.code, "INVALID_PACKAGE_REQUEST");
  assert.equal(calls, 0);
  await app.close();
});

test("package maintenance rejects unsupported ecosystem with 400", async () => {
  const app = appWith(async () => fakeResponse(200, {}));
  const response = await app.inject({ method: "POST", url: "/v1/package-maintenance-snapshot", payload: { ecosystem: "Maven", package: "x", version: "1.0.0" } });
  assert.equal(response.statusCode, 400);
  assert.equal(response.json().error.code, "INVALID_PACKAGE_REQUEST");
  await app.close();
});

test("package maintenance maps missing package and version to stable 404", async () => {
  const missingPackage = appWith(async () => fakeResponse(404, {}));
  const packageResponse = await missingPackage.inject({ method: "POST", url: "/v1/package-maintenance-snapshot", payload: { ecosystem: "npm", package: "does-not-exist", version: "1.0.0" } });
  assert.equal(packageResponse.statusCode, 404);
  assert.equal(packageResponse.json().error.code, "PACKAGE_NOT_FOUND");
  await missingPackage.close();

  const missingVersion = appWith(async () => fakeResponse(200, { name: "demo", "dist-tags": { latest: "2.0.0" }, versions: { "2.0.0": { name: "demo", version: "2.0.0" } }, time: { "2.0.0": "2026-01-01T00:00:00Z" } }));
  const versionResponse = await missingVersion.inject({ method: "POST", url: "/v1/package-maintenance-snapshot", payload: { ecosystem: "npm", package: "demo", version: "1.0.0" } });
  assert.equal(versionResponse.statusCode, 404);
  assert.equal(versionResponse.json().error.code, "PACKAGE_VERSION_NOT_FOUND");
  await missingVersion.close();
});

test("package maintenance maps registry outage and malformed JSON to stable 503", async () => {
  const outage = appWith(async () => fakeResponse(503, { error: "unavailable" }));
  const outageResponse = await outage.inject({ method: "POST", url: "/v1/package-maintenance-snapshot", payload: { ecosystem: "npm", package: "fastify", version: "5.6.0" } });
  assert.equal(outageResponse.statusCode, 503);
  assert.equal(outageResponse.json().error.code, "PACKAGE_SOURCE_UNAVAILABLE");
  await outage.close();

  const malformed = appWith(async () => fakeResponse(200, "not-json"));
  const malformedResponse = await malformed.inject({ method: "POST", url: "/v1/package-maintenance-snapshot", payload: { ecosystem: "npm", package: "fastify", version: "5.6.0" } });
  assert.equal(malformedResponse.statusCode, 503);
  assert.equal(malformedResponse.json().error.code, "PACKAGE_SOURCE_UNAVAILABLE");
  await malformed.close();
});
