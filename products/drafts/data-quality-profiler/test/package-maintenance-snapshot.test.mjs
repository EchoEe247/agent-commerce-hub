import test from "node:test";
import assert from "node:assert/strict";
import { buildApp } from "../src/app.mjs";

// Product #13 route/service seam plus npm runtime contract.
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

test("default package maintenance snapshot normalizes npm package and release metadata", async () => {
  const requests = [];
  const registryFetch = async (url) => {
    requests.push(String(url));
    return fakeResponse(200, {
      name: "demo-package",
      description: "Demo package",
      "dist-tags": { latest: "2.0.0" },
      time: {
        created: "2024-01-01T00:00:00.000Z",
        modified: "2026-08-10T00:00:00.000Z",
        "1.0.0": "2025-01-15T00:00:00.000Z",
        "2.0.0": "2026-08-10T00:00:00.000Z"
      },
      versions: {
        "1.0.0": {
          name: "demo-package",
          version: "1.0.0",
          description: "Demo package v1",
          license: "MIT",
          deprecated: "Use 2.x",
          repository: { type: "git", url: "git+https://github.com/example/demo-package.git" },
          homepage: "https://example.test/demo-package",
          engines: { node: ">=18" }
        },
        "2.0.0": {
          name: "demo-package",
          version: "2.0.0",
          license: "MIT"
        }
      }
    });
  };

  const app = buildApp({
    config: { serviceVersion: "0.1.0" },
    paymentPlugin: async () => {},
    packageRegistryFetch: registryFetch,
    packageClock: { now: () => Date.parse("2026-08-21T12:00:00.000Z") },
  });

  const response = await app.inject({
    method: "POST",
    url: "/v1/package-maintenance-snapshot",
    payload: { ecosystem: "npm", package: "demo-package", version: "1.0.0" },
  });

  assert.equal(response.statusCode, 200);
  const body = response.json();
  assert.deepEqual(body.query, { ecosystem: "npm", package: "demo-package", version: "1.0.0" });
  assert.equal(body.package.name, "demo-package");
  assert.equal(body.package.requested_version, "1.0.0");
  assert.equal(body.package.latest_version, "2.0.0");
  assert.equal(body.package.requested_is_latest, false);
  assert.equal(body.package.deprecated, true);
  assert.equal(body.package.deprecated_reason, "Use 2.x");
  assert.equal(body.package.yanked, false);
  assert.equal(body.package.license, "MIT");
  assert.equal(body.package.repository_url, "https://github.com/example/demo-package");
  assert.equal(body.package.homepage, "https://example.test/demo-package");
  assert.equal(body.package.runtime.node, ">=18");
  assert.equal(body.release.requested_published_at, "2025-01-15T00:00:00.000Z");
  assert.equal(body.release.latest_published_at, "2026-08-10T00:00:00.000Z");
  assert.equal(body.release.package_created_at, "2024-01-01T00:00:00.000Z");
  assert.equal(body.release.requested_age_days, 583);
  assert.equal(body.release.latest_release_age_days, 11);
  assert.equal(body.source.provider, "npm registry");
  assert.equal(body.source.metadata_url, "https://registry.npmjs.org/demo-package");
  assert.equal(body.source.fetched_at, "2026-08-21T12:00:00.000Z");
  assert.deepEqual(body.warnings, []);
  assert.deepEqual(requests, ["https://registry.npmjs.org/demo-package"]);
  await app.close();
});

function fakeResponse(status, body) {
  return {
    status,
    ok: status >= 200 && status < 300,
    headers: new Headers({ "content-type": "application/json" }),
    async text() { return JSON.stringify(body); },
  };
}
