import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";

const PRODUCT_ROOT = new URL("..", import.meta.url);

test("distribution readiness CLI uses the canonical final OpenAPI overlays", () => {
  const result = spawnSync(process.execPath, ["scripts/distribution-readiness-check.mjs"], {
    cwd: PRODUCT_ROOT,
    env: {
      ...process.env,
      X402_FACILITATOR_URL: "https://facilitator.xpay.sh",
    },
    encoding: "utf8",
  });

  assert.equal(result.status, 0, result.stderr);

  const report = JSON.parse(result.stdout);
  const company = report.channels.index_402.registration_payloads.find(
    (item) => item.url.endsWith("/v1/company-domain-intelligence"),
  );

  assert.ok(company, "expected company-domain-intelligence registration payload");
  assert.equal(
    company.name,
    "Company domain intelligence: research and enrich a business domain with public web and infrastructure signals",
  );
  assert.match(company.description, /after trying the free preview/i);
});
