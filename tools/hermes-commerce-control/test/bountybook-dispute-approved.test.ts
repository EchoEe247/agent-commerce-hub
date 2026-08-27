import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const scriptPath = resolve(process.cwd(), "scripts/bountybook-dispute-approved-broker.ts");
const wrapperPath = resolve(process.cwd(), "scripts/run-bountybook-approved-dispute.sh");

test("approved dispute writer is pinned to the current live frontend route and reason-only body", () => {
  const source = readFileSync(scriptPath, "utf8");
  assert.match(source, /\/jobs\/\$\{JOB_ID\}\/dispute/);
  assert.match(source, /\{ reason: DISPUTE_REASON \}/);
  assert.match(source, /BOUNTYBOOK_DISPUTE_APPROVED/);
  assert.match(source, /redirect: "manual"/);
  assert.match(source, /flag: "wx"/);
});

test("approved dispute writer has no automatic fallback POST or financial execution path", () => {
  const source = readFileSync(scriptPath, "utf8");
  const postCalls = source.match(/request\("POST"/g) ?? [];
  assert.equal(postCalls.length, 1);
  assert.doesNotMatch(source, /request\("POST", `\$\{API\}\/bounties/);
  assert.match(source, /AUTOMATIC_RETRY_EXECUTED=no/);
  assert.match(source, /FALLBACK_ROUTE_POST_EXECUTED=no/);
  assert.match(source, /FINANCIAL_ACTION_EXECUTED=no/);
  assert.match(source, /BLOCKCHAIN_TX_EXECUTED=no/);
});

test("approved dispute wrapper requires the memory signer broker", () => {
  const source = readFileSync(wrapperPath, "utf8");
  assert.match(source, /bountybook-signer-status\.ts/);
  assert.match(source, /BOUNTYBOOK_DISPUTE_APPROVED=yes/);
  assert.doesNotMatch(source, /read -r -s/);
  assert.doesNotMatch(source, /KEYSTORE_PASSPHRASE=.*read/);
});
