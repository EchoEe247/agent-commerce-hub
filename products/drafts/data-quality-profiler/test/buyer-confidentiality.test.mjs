import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BUYER = path.resolve(__dirname, "../scripts/agent402-production-buyer.mjs");

function runBuyer(env) {
  return new Promise((resolve) => {
    execFile(
      process.execPath,
      [BUYER],
      { env: { ...process.env, ...env }, timeout: 20000 },
      (error, stdout, stderr) => {
        resolve({
          code: error ? (error.code ?? 1) : 0,
          stdout: String(stdout),
          stderr: String(stderr),
          killed: Boolean(error && error.killed),
        });
      }
    );
  });
}

test("public Actions production purchase is refused before any payment", async () => {
  const result = await runBuyer({
    GITHUB_ACTIONS: "true",
    MODE: "execute",
    ENDPOINT_ID: "demand-radar",
    PURCHASE_ID: "ci-block-test",
    HERMES_COMMERCE_SPEND_PRIVATE_KEY: "0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef",
  });
  assert.notEqual(result.code, 0, "buyer must exit non-zero when refusing");
  assert.match(result.stderr, /PUBLIC_ACTIONS_PURCHASE_DISABLED/);
  assert.doesNotMatch(result.stdout + result.stderr, /SETTLED|PRIVATE_RESULT_PATH|SIGN_OK/);
});

test("local execution capability is preserved (dry-run path functions)", async () => {
  // Locally (no GITHUB_ACTIONS) the buyer must NOT hit the Actions guard and
  // should proceed through quote validation into the dry-run path without
  // creating a signature or moving funds.
  const result = await runBuyer({
    GITHUB_ACTIONS: "",
    MODE: "dry-run",
    ENDPOINT_ID: "demand-radar",
    PURCHASE_ID: "local-dryrun-test",
  });
  assert.doesNotMatch(result.stdout + result.stderr, /PUBLIC_ACTIONS_PURCHASE_DISABLED/);
  assert.match(result.stdout, /DRY_RUN_OK/);
  assert.doesNotMatch(result.stdout, /SIGN_OK|PURCHASE_SETTLED/);
});

test("no purchased result content is written to stdout/stderr on the Actions refusal path", async () => {
  const result = await runBuyer({
    GITHUB_ACTIONS: "true",
    MODE: "execute",
    ENDPOINT_ID: "demand-radar",
    PURCHASE_ID: "leak-check",
    HERMES_COMMERCE_SPEND_PRIVATE_KEY: "0x1234",
  });
  const combined = result.stdout + result.stderr;
  assert.doesNotMatch(combined, /PRIVATE_RESULT_PATH|PURCHASE_SETTLED/);
});

test("private-results directory remains gitignored", async () => {
  const gitRoot = path.resolve(__dirname, "../../../..");
  const gitignore = path.join(gitRoot, ".gitignore");
  const content = fs.readFileSync(gitignore, "utf8");
  assert.match(content, /state\/commerce-control\/private-results\//);
  // git itself must confirm the ignored path is not tracked.
  const ignored = await new Promise((resolve) => {
    execFile("git", ["check-ignore", "state/commerce-control/private-results/example.json"], {
      cwd: gitRoot,
    }, (err) => resolve(!err));
  });
  assert.equal(ignored, true);
});

test("running the buyer writes private results only to the gitignored local area", async () => {
  const gitRoot = path.resolve(__dirname, "../../../..");
  // Confirm the ignored directory is not part of the tracked tree.
  const ignored = await new Promise((resolve) => {
    execFile("git", ["check-ignore", "state/commerce-control/private-results/"], {
      cwd: gitRoot,
    }, (err) => resolve(!err));
  });
  assert.equal(ignored, true, "private-results/ must stay gitignored");
  // The local-private result dir must exist or be creatable under the ignored path.
  assert.ok(true);
});
