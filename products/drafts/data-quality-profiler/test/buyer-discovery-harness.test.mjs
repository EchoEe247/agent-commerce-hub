import test from "node:test";
import assert from "node:assert/strict";
import { runInProcessBuyerDiscovery } from "../src/discovery/buyer-discovery-runner.mjs";

function collectForbiddenKeys(value, path = "$") {
  const found = [];
  if (!value || typeof value !== "object") return found;
  for (const [key, child] of Object.entries(value)) {
    const childPath = `${path}.${key}`;
    if (/private|secret|signature|authorization/i.test(key)) found.push(childPath);
    found.push(...collectForbiddenKeys(child, childPath));
  }
  return found;
}

test("in-process buyer discovery verifies the full pre-payment acquisition funnel", async () => {
  const report = await runInProcessBuyerDiscovery();

  assert.equal(report.overall, "pass", JSON.stringify(report, null, 2));
  assert.equal(report.target, "in-process");
  assert.equal(report.intent_results.length, 5);
  assert.equal(report.intent_results.every((item) => item.matched), true);
  assert.equal(report.checks.find((item) => item.id === "preview.free")?.status, "pass");
  assert.equal(report.checks.find((item) => item.id === "paid_boundary.http_402")?.observed, 402);
  assert.equal(report.checks.find((item) => item.id === "paid_boundary.bazaar")?.status, "pass");
  assert.deepEqual(collectForbiddenKeys(report), []);
});
