import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function runScript(env = process.env) {
  return spawnSync(process.execPath, ["scripts/buyer-discovery-check.mjs"], {
    cwd: PROJECT_ROOT,
    env,
    encoding: "utf8",
  });
}

test("buyer discovery CLI emits a passing in-process JSON report by default", () => {
  const result = runScript();
  assert.equal(result.status, 0, `${result.stderr}\n${result.stdout}`);
  const report = JSON.parse(result.stdout);
  assert.equal(report.overall, "pass");
  assert.equal(report.target, "in-process");
});

test("buyer discovery CLI rejects non-http TARGET_URL without exposing environment data", () => {
  const result = runScript({ ...process.env, TARGET_URL: "ftp://example.com" });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /TARGET_URL must use http or https/);
  assert.equal(result.stdout, "");
});
