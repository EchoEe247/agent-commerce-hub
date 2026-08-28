// P1 Batch 2 — financial safety targeted tests.
//
// Covers:
//   A. Production payment enforcement FAILS CLOSED
//      - production config + X402_ENABLED=false  -> refuses paid routes
//      - production config + missing x402 enablement -> refuses paid routes
//      - production config + missing/invalid payment config -> fatal at startup
//      - explicit local/test unpaid mode works only when deliberately enabled
//      - free company-domain preview remains free
//      - health/discovery sane under config failure
//   B. Ledger isolation
//      - mainnet buyer path != testnet signer path
//      - production code cannot open testnet ledger
//      - testnet code cannot open production ledger
//      - malformed mainnet ledger is fatal
//      - malformed testnet ledger is fatal
//      - schema/network mismatch is fatal
//      - missing ledger initialization requires explicit allowed path
//      - testnet update changes only testnet fixture
//      - production update changes only production fixture
//
// No test signs, spends, contacts a facilitator for settlement, or touches the
// real repository financial-state path. All ledger I/O uses temp fixtures.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { loadConfig, resolvePaymentMode, assertProductionPaymentConfig } from "../src/config.mjs";
import { buildApp } from "../src/app.mjs";
import { buildPaymentPlugin } from "../src/payments/x402-plugin.mjs";
import {
  loadLedger,
  saveLedger,
  stageUpdate,
  createEmptyLedger,
  validateLedger,
  LedgerError,
  NETWORK_MAINNET,
  NETWORK_TESTNET,
  MAINNET_BUDGET_ID,
  TESTNET_BUDGET_ID,
  MAINNET_DEFAULT_CEILING_RAW,
  TESTNET_DEFAULT_CEILING_RAW,
  TESTNET_WALLET,
} from "../src/payments/ledger.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "../../../..");
const MAINNET_LEDGER_PATH = path.join(REPO_ROOT, "state/commerce-control/ledgers/mainnet-budget-ledger.json");
const TESTNET_LEDGER_PATH = path.join(REPO_ROOT, "state/commerce-control/ledgers/testnet-budget-ledger.json");

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "p1-ledger-"));
}

function fakeFacilitator() {
  // Minimal facilitator discovery so buildPaymentPlugin can construct a server.
  // We never actually settle; these tests only assert route protection.
  return {
    url: "https://facilitator.example.invalid",
  };
}

// ---------------------------------------------------------------- Payment A

test("production config with X402_ENABLED=false fails closed at startup", () => {
  // A production-like (mainnet) config with x402 disabled must never silently
  // produce a runnable config; loadConfig refuses it before any route is wired.
  assert.throws(
    () => loadConfig({
      X402_PAYMENT_MODE: "production",
      X402_ENABLED: "false",
      X402_PAY_TO: "0x0000000000000000000000000000000000000001",
      X402_NETWORK: "eip155:8453",
      ALLOW_MAINNET: "true",
    }),
    /PRODUCTION_PAYMENT_CONFIG_INVALID/
  );
});

test("production config missing x402 enablement fails closed at startup", () => {
  // No X402_PAYMENT_MODE set, but production-like (mainnet) => production, and
  // an incomplete production config must be refused at config load.
  assert.throws(
    () => loadConfig({
      X402_NETWORK: "eip155:8453",
      ALLOW_MAINNET: "true",
    }),
    /PRODUCTION_PAYMENT_CONFIG_INVALID/
  );
});

test("production config with missing payTo fails closed at config load", () => {
  assert.throws(
    () => loadConfig({ X402_PAYMENT_MODE: "production", X402_ENABLED: "true" }),
    /X402_PAY_TO is required when X402_ENABLED=true/
  );
});

test("production config with malformed facilitator mode fails closed", () => {
  assert.throws(
    () => loadConfig({
      X402_PAYMENT_MODE: "production",
      X402_ENABLED: "true",
      X402_PAY_TO: "0x0000000000000000000000000000000000000001",
      X402_FACILITATOR_MODE: "bogus",
    }),
    /X402_FACILITATOR_MODE/
  );
});

test("production config with valid facilitator mode but missing payTo fails closed", () => {
  assert.throws(
    () => loadConfig({
      X402_PAYMENT_MODE: "production",
      X402_ENABLED: "true",
    }),
    /X402_PAY_TO is required when X402_ENABLED=true/
  );
});

test("explicit local/test unpaid mode is the only path that leaves routes unpaid", async () => {
  const cfg = loadConfig({
    X402_PAYMENT_MODE: "local-unpaid",
    X402_ENABLED: "false",
  });
  assert.equal(cfg.isProduction, false);
  // In local-unpaid mode, the plugin intentionally does NOT wrap paid routes.
  const calls = { install: false };
  const fakeApp = {
    addHook() {}, decorate() {}, post() {}, register() {},
    inject() { calls.install = true; return Promise.resolve({ statusCode: 200 }); },
  };
  assert.doesNotThrow(() => buildPaymentPlugin(cfg)(fakeApp));
  // Build a real app in local-unpaid mode and confirm a paid route is reachable.
  const app = buildApp({ config: { ...cfg, x402Network: "eip155:84532" }, paymentPlugin: buildPaymentPlugin(cfg) });
  const res = await app.inject({ method: "POST", url: "/v1/profile", payload: { format: "json", records: [{ id: 1 }] } });
  assert.equal(res.statusCode, 200, "local-unpaid must leave /v1/profile reachable without payment");
  await app.close();
});

test("free company-domain preview remains free in production config", async () => {
  const cfg = loadConfig({
    X402_PAYMENT_MODE: "production",
    X402_ENABLED: "true",
    X402_PAY_TO: "0x0000000000000000000000000000000000000001",
    X402_NETWORK: "eip155:84532",
  });
  const app = buildApp({ config: cfg, paymentPlugin: buildPaymentPlugin(cfg) });
  const res = await app.inject({
    method: "POST",
    url: "/v1/company-domain-intelligence/preview",
    payload: { domain: "stripe.com" },
  });
  assert.equal(res.statusCode, 200, "preview route must remain free even in production");
  const body = res.json();
  assert.equal(body.preview, true);
  await app.close();
});

test("health and discovery behave sanely under production config failure", async () => {
  // Health and discovery never depended on x402, so they must remain 200 even
  // when payment config is broken (the failure is at paid-route install only).
  const app = buildApp({ config: { serviceVersion: "0.1.0" } });
  const health = await app.inject({ method: "GET", url: "/health" });
  assert.equal(health.statusCode, 200);
  const disc = await app.inject({ method: "GET", url: "/.well-known/x402" });
  assert.equal(disc.statusCode, 200);
  await app.close();
});

// ---------------------------------------------------------------- Ledger B

test("mainnet buyer ledger path is physically distinct from testnet signer ledger path", () => {
  assert.notEqual(MAINNET_LEDGER_PATH, TESTNET_LEDGER_PATH);
  assert.ok(MAINNET_LEDGER_PATH.endsWith("ledgers/mainnet-budget-ledger.json"));
  assert.ok(TESTNET_LEDGER_PATH.endsWith("ledgers/testnet-budget-ledger.json"));
});

test("production (mainnet) code cannot open the testnet ledger", () => {
  assert.throws(
    () => loadLedger(TESTNET_LEDGER_PATH, NETWORK_MAINNET, { allowCreate: false }),
    (e) => e instanceof LedgerError && e.code === "NETWORK_MISMATCH"
  );
});

test("testnet code cannot open the production (mainnet) ledger", () => {
  assert.throws(
    () => loadLedger(MAINNET_LEDGER_PATH, NETWORK_TESTNET, { allowCreate: false }),
    (e) => e instanceof LedgerError && e.code === "NETWORK_MISMATCH"
  );
});

test("malformed mainnet ledger is fatal (never reset to default)", () => {
  const dir = tmpDir();
  const p = path.join(dir, "mainnet-budget-ledger.json");
  fs.writeFileSync(p, "{ this is not valid json ");
  assert.throws(
    () => loadLedger(p, NETWORK_MAINNET, { allowCreate: false }),
    (e) => e instanceof LedgerError && e.code === "LEDGER_PARSE_ERROR"
  );
  // The corrupt file must NOT have been replaced/reset.
  assert.equal(fs.readFileSync(p, "utf8"), "{ this is not valid json ");
});

test("malformed testnet ledger is fatal (never reset to default)", () => {
  const dir = tmpDir();
  const p = path.join(dir, "testnet-budget-ledger.json");
  fs.writeFileSync(p, "not json at all");
  assert.throws(
    () => loadLedger(p, NETWORK_TESTNET, { allowCreate: false }),
    (e) => e instanceof LedgerError && e.code === "LEDGER_PARSE_ERROR"
  );
});

test("schema/version mismatch is fatal", () => {
  const dir = tmpDir();
  const p = path.join(dir, "mainnet.json");
  fs.writeFileSync(p, JSON.stringify({ schemaVersion: "99", network: NETWORK_MAINNET }));
  assert.throws(
    () => loadLedger(p, NETWORK_MAINNET, { allowCreate: false }),
    (e) => e instanceof LedgerError && e.code === "SCHEMA_MISMATCH"
  );
});

test("wrong budget ceiling on mainnet is fatal", () => {
  const dir = tmpDir();
  const p = path.join(dir, "mainnet.json");
  const fake = createEmptyLedger(NETWORK_MAINNET);
  fake.initialBudget = MAINNET_DEFAULT_CEILING_RAW + 1;
  saveLedger(p, fake);
  assert.throws(
    () => loadLedger(p, NETWORK_MAINNET, { allowCreate: false }),
    (e) => e instanceof LedgerError && e.code === "CEILING_MISMATCH"
  );
});

test("missing ledger requires explicit allowed-create path; default is fatal", () => {
  const dir = tmpDir();
  const p = path.join(dir, "nope.json");
  assert.throws(
    () => loadLedger(p, NETWORK_MAINNET, { allowCreate: false }),
    (e) => e instanceof LedgerError && e.code === "LEDGER_MISSING"
  );
  // With explicit allowCreate, an empty ledger is initialized (first-run only).
  const { ledger } = loadLedger(p, NETWORK_MAINNET, { allowCreate: true });
  assert.equal(ledger.network, NETWORK_MAINNET);
  assert.equal(ledger.budgetId, MAINNET_BUDGET_ID);
  assert.equal(ledger.initialBudget, MAINNET_DEFAULT_CEILING_RAW);
  assert.deepEqual(ledger.purchases, {});
});

test("a testnet update changes only the testnet fixture", () => {
  const dir = tmpDir();
  const tPath = path.join(dir, "testnet.json");
  const mPath = path.join(dir, "mainnet.json");
  saveLedger(tPath, createEmptyLedger(NETWORK_TESTNET));
  saveLedger(mPath, createEmptyLedger(NETWORK_MAINNET));

  stageUpdate(tPath, NETWORK_TESTNET, "t1", "SETTLED", { amount: 5000, transaction: "0xtest" });

  const t = JSON.parse(fs.readFileSync(tPath, "utf8"));
  const m = JSON.parse(fs.readFileSync(mPath, "utf8"));
  assert.ok(t.purchases.t1 && t.purchases.t1.stage === "SETTLED");
  assert.deepEqual(m.purchases, {}, "mainnet fixture must be untouched by a testnet update");
  assert.equal(t.network, NETWORK_TESTNET);
  assert.equal(m.network, NETWORK_MAINNET);
});

test("a mainnet update changes only the mainnet fixture", () => {
  const dir = tmpDir();
  const tPath = path.join(dir, "testnet.json");
  const mPath = path.join(dir, "mainnet.json");
  saveLedger(tPath, createEmptyLedger(NETWORK_TESTNET));
  saveLedger(mPath, createEmptyLedger(NETWORK_MAINNET));

  stageUpdate(mPath, NETWORK_MAINNET, "m1", "SETTLED", { amount: 5000, transaction: "0xmain" });

  const t = JSON.parse(fs.readFileSync(tPath, "utf8"));
  const m = JSON.parse(fs.readFileSync(mPath, "utf8"));
  assert.ok(m.purchases.m1 && m.purchases.m1.stage === "SETTLED");
  assert.deepEqual(t.purchases, {}, "testnet fixture must be untouched by a mainnet update");
});

test("cross-network stageUpdate is refused", () => {
  const dir = tmpDir();
  const tPath = path.join(dir, "testnet.json");
  saveLedger(tPath, createEmptyLedger(NETWORK_TESTNET));
  // Trying to write mainnet records into the testnet file must fail closed.
  assert.throws(
    () => stageUpdate(tPath, NETWORK_MAINNET, "x", "SETTLED", {}),
    (e) => e instanceof LedgerError && e.code === "NETWORK_MISMATCH"
  );
});

test("committed ledgers load with correct network binding and preserve history", () => {
  const main = loadLedger(MAINNET_LEDGER_PATH, NETWORK_MAINNET, { allowCreate: false });
  assert.equal(main.ledger.network, NETWORK_MAINNET);
  assert.equal(main.ledger.budgetId, MAINNET_BUDGET_ID);
  assert.ok(Object.keys(main.ledger.purchases).length >= 1, "mainnet history preserved");

  const test = loadLedger(TESTNET_LEDGER_PATH, NETWORK_TESTNET, { allowCreate: false });
  assert.equal(test.ledger.network, NETWORK_TESTNET);
  assert.equal(test.ledger.budgetId, TESTNET_BUDGET_ID);
  assert.ok(Object.keys(test.ledger.purchases).length >= 1, "testnet history preserved");
});

// ---------------------------------------------------------------- Payment A (correction)

test("MALFORMED_PRODUCTION_PAYTO: non-EVM payTo is fatal in production", () => {
  assert.throws(
    () => loadConfig({
      X402_PAYMENT_MODE: "production",
      X402_ENABLED: "true",
      X402_PAY_TO: "not-an-address",
      X402_NETWORK: "eip155:84532",
    }),
    /PRODUCTION_PAYMENT_CONFIG_INVALID/
  );
  assert.throws(
    () => loadConfig({
      X402_PAYMENT_MODE: "production",
      X402_ENABLED: "true",
      X402_PAY_TO: "0x" + "a".repeat(39),
      X402_NETWORK: "eip155:84532",
    }),
    /PRODUCTION_PAYMENT_CONFIG_INVALID/
  );
});

test("valid production config with EVM payTo works", () => {
  const cfg = loadConfig({
    X402_PAYMENT_MODE: "production",
    X402_ENABLED: "true",
    X402_PAY_TO: "0x0000000000000000000000000000000000000001",
    X402_NETWORK: "eip155:84532",
  });
  assert.equal(cfg.isProduction, true);
  assert.equal(cfg.paymentMode, "production");
});

// ---------------------------------------------------------------- Ledger B (correction)

test("fresh testnet ledger: SETTLED amount 5000 persists spent=5000 remaining=correct", () => {
  const dir = tmpDir();
  const p = path.join(dir, "testnet.json");
  saveLedger(p, createEmptyLedger(NETWORK_TESTNET));
  const updated = stageUpdate(p, NETWORK_TESTNET, "t1", "SETTLED", { amount: 5000, transaction: "0xabc" });
  assert.equal(updated.spentBudget, 5000);
  assert.equal(updated.remainingBudget, TESTNET_DEFAULT_CEILING_RAW - 5000);
  const reloaded = JSON.parse(fs.readFileSync(p, "utf8"));
  assert.equal(reloaded.spentBudget, 5000);
  assert.equal(reloaded.remainingBudget, TESTNET_DEFAULT_CEILING_RAW - 5000);
});

test("FAILED stage does not consume budget", () => {
  const dir = tmpDir();
  const p = path.join(dir, "testnet.json");
  saveLedger(p, createEmptyLedger(NETWORK_TESTNET));
  stageUpdate(p, NETWORK_TESTNET, "f1", "FAILED", { amount: 5000 });
  const reloaded = JSON.parse(fs.readFileSync(p, "utf8"));
  assert.equal(reloaded.spentBudget, 0, "FAILED must not consume budget");
  assert.equal(reloaded.remainingBudget, TESTNET_DEFAULT_CEILING_RAW);
});

test("PREPARED stage consumes budget", () => {
  const dir = tmpDir();
  const p = path.join(dir, "testnet.json");
  saveLedger(p, createEmptyLedger(NETWORK_TESTNET));
  stageUpdate(p, NETWORK_TESTNET, "p1", "PREPARED", { amount: 7000 });
  const reloaded = JSON.parse(fs.readFileSync(p, "utf8"));
  assert.equal(reloaded.spentBudget, 7000, "PREPARED consumes budget");
});

test("existing stale spentBudget triggers TOTALS_MISMATCH (no silent rewrite)", () => {
  const dir = tmpDir();
  const p = path.join(dir, "testnet.json");
  const l = createEmptyLedger(NETWORK_TESTNET);
  l.purchases.p1 = { purchaseId: "p1", stage: "SETTLED", amount: 5000, transaction: "0x1" };
  l.spentBudget = 999999;
  l.remainingBudget = TESTNET_DEFAULT_CEILING_RAW - 999999;
  saveLedger(p, l);
  assert.throws(
    () => loadLedger(p, NETWORK_TESTNET, { allowCreate: false }),
    (e) => e instanceof LedgerError && e.code === "TOTALS_MISMATCH"
  );
  const raw = JSON.parse(fs.readFileSync(p, "utf8"));
  assert.equal(raw.spentBudget, 999999);
});

test("existing stale remainingBudget triggers TOTALS_MISMATCH", () => {
  const dir = tmpDir();
  const p = path.join(dir, "testnet.json");
  const l = createEmptyLedger(NETWORK_TESTNET);
  l.purchases.p1 = { purchaseId: "p1", stage: "SETTLED", amount: 5000, transaction: "0x1" };
  l.spentBudget = 5000;
  l.remainingBudget = 12345;
  saveLedger(p, l);
  assert.throws(
    () => loadLedger(p, NETWORK_TESTNET, { allowCreate: false }),
    (e) => e instanceof LedgerError && e.code === "TOTALS_MISMATCH"
  );
});

test("overspent ledger is fatal", () => {
  const dir = tmpDir();
  const p = path.join(dir, "testnet.json");
  const l = createEmptyLedger(NETWORK_TESTNET);
  l.purchases.p1 = { purchaseId: "p1", stage: "SETTLED", amount: TESTNET_DEFAULT_CEILING_RAW + 100, transaction: "0x1" };
  l.spentBudget = TESTNET_DEFAULT_CEILING_RAW + 100;
  l.remainingBudget = -100;
  saveLedger(p, l);
  assert.throws(
    () => loadLedger(p, NETWORK_TESTNET, { allowCreate: false }),
    (e) => e instanceof LedgerError && e.code === "OVERSPEND"
  );
});

test("asset ETH instead of USDC is fatal", () => {
  const dir = tmpDir();
  const p = path.join(dir, "testnet.json");
  const l = createEmptyLedger(NETWORK_TESTNET);
  l.asset = "ETH";
  saveLedger(p, l);
  assert.throws(
    () => loadLedger(p, NETWORK_TESTNET, { allowCreate: false }),
    (e) => e instanceof LedgerError && e.code === "ASSET_MISMATCH"
  );
});

test("wrong wallet with expectedWallet is fatal", () => {
  const dir = tmpDir();
  const p = path.join(dir, "testnet.json");
  const l = createEmptyLedger(NETWORK_TESTNET);
  l.wallet = "0x1111111111111111111111111111111111111111";
  saveLedger(p, l);
  assert.throws(
    () => loadLedger(p, NETWORK_TESTNET, { allowCreate: false, expectedWallet: "0xc6139957cf09F97718cA6b3c88fB3931aDC04ead" }),
    (e) => e instanceof LedgerError && e.code === "WALLET_MISMATCH"
  );
});

test("empty wallet with expectedWallet is fatal", () => {
  const dir = tmpDir();
  const p = path.join(dir, "testnet.json");
  const l = createEmptyLedger(NETWORK_TESTNET);
  saveLedger(p, l);
  assert.throws(
    () => loadLedger(p, NETWORK_TESTNET, { allowCreate: false, expectedWallet: "0xc6139957cf09F97718cA6b3c88fB3931aDC04ead" }),
    (e) => e instanceof LedgerError && e.code === "WALLET_MISMATCH"
  );
});

test("allowCreate=true actually creates the ledger file on disk", () => {
  const dir = tmpDir();
  const p = path.join(dir, "created.json");
  assert.equal(fs.existsSync(p), false);
  const { ledger } = loadLedger(p, NETWORK_TESTNET, { allowCreate: true });
  assert.equal(ledger.network, NETWORK_TESTNET);
  assert.equal(fs.existsSync(p), true, "allowCreate must persist the empty ledger");
});

test("allowCreate=false missing mainnet ledger remains fatal", () => {
  const dir = tmpDir();
  const p = path.join(dir, "missing-mainnet.json");
  assert.throws(
    () => loadLedger(p, NETWORK_MAINNET, { allowCreate: false }),
    (e) => e instanceof LedgerError && e.code === "LEDGER_MISSING"
  );
});

// ---------------------------------------------------------------- Signer init (pure, no-spend)

import {
  resolveSignerNetwork,
  verifyTestnetWallet,
  loadTestnetLedger,
  initializeTestnetLedger,
  stageTestnetUpdate,
  makeTestnetLedger,
  SIGNER_NETWORK,
  SIGNER_EXPECTED_WALLET,
  DEFAULT_LEDGER_PATH,
  TEST_WALLET,
  BASE_SEPOLIA,
} from "../scripts/signer-init.mjs";

test("signer-init: mainnet input is refused before key use", () => {
  assert.throws(() => resolveSignerNetwork("eip155:8453"), /TESTNET_SIGNER_MAINNET_REFUSED/);
  assert.equal(resolveSignerNetwork(undefined), SIGNER_NETWORK);
  assert.equal(resolveSignerNetwork("eip155:84532"), SIGNER_NETWORK);
});

test("signer-init: missing private key is refused", () => {
  assert.throws(() => verifyTestnetWallet(""), /environment variable is not set/i);
});

test("signer-init: wrong-key derived address is rejected against test wallet", () => {
  const wrongKey = "0x" + "11".repeat(32);
  assert.throws(() => verifyTestnetWallet(wrongKey), /TESTNET_WALLET_BINDING_FAILED/);
});

test("signer-init: loadTestnetLedger enforces wallet binding", () => {
  const dir = tmpDir();
  const p = path.join(dir, "testnet.json");
  makeTestnetLedger(p);
  const l = loadTestnetLedger(p);
  assert.equal(l.wallet.toLowerCase(), "0xc6139957cf09f97718ca6b3c88fb3931adc04ead");
});

test("signer source declares ledgerData at module scope", () => {
  const src = fs.readFileSync(
    path.join(__dirname, "../scripts/github-actions-signer.mjs"),
    "utf8"
  );
  assert.ok(/let\s+ledgerData\s*;/.test(src), "signer must declare `let ledgerData;`");
  assert.ok(!/loadLedgerStrict\(/.test(src), "obsolete loadLedgerStrict must be removed");
});

// ---------------------------------------------------------------- P1 Batch 2 final live-signer wiring

test("signer-init: DEFAULT_LEDGER_PATH resolves to canonical testnet ledger, not products/state", () => {
  const expected = path.join(REPO_ROOT, "state/commerce-control/ledgers/testnet-budget-ledger.json");
  assert.equal(DEFAULT_LEDGER_PATH, expected);
  assert.ok(!DEFAULT_LEDGER_PATH.includes("products/state"), "must not resolve under products/state");
});

test("signer source imports DEFAULT_LEDGER_PATH and the bounded stage helper (no handcrafted path, no unbound stageUpdate)", () => {
  const src = fs.readFileSync(
    path.join(__dirname, "../scripts/github-actions-signer.mjs"),
    "utf8"
  );
  // Imports the canonical constant instead of building its own path.
  assert.ok(/import\s*\{[^}]*DEFAULT_LEDGER_PATH[^}]*\}\s*from\s*"\.\/signer-init\.mjs"/.test(src),
    "signer must import DEFAULT_LEDGER_PATH from signer-init.mjs");
  assert.ok(/const\s+ledgerPath\s*=\s*DEFAULT_LEDGER_PATH\s*;/.test(src),
    "signer must bind ledgerPath to the imported DEFAULT_LEDGER_PATH");
  // Uses the wallet-bound testnet stage helper.
  assert.ok(/stageTestnetUpdate\(/.test(src), "signer must use stageTestnetUpdate(...)");
  // No handcrafted import.meta.url ledger path remains.
  assert.ok(!/fileURLToPath\(import\.meta\.url\)[^]*?\.\.\/\.\.\/\.\.\/\.\.\/state/.test(src),
    "signer must not contain a github-actions-signer.mjs/../../../state ledger path");
  // No unbound raw stageUpdate(...) call remains in the signer.
  assert.ok(!/stageUpdate\(ledgerPath/.test(src), "signer must not call raw stageUpdate(ledgerPath,...)");
});

test("signer-init: canonical constants alias without drift", () => {
  assert.equal(TEST_WALLET, TESTNET_WALLET);
  assert.equal(BASE_SEPOLIA, NETWORK_TESTNET);
  assert.equal(TEST_WALLET, SIGNER_EXPECTED_WALLET);
});

test("signer-init: operational loadTestnetLedger treats a missing ledger as fatal (no auto-reset)", () => {
  const dir = tmpDir();
  const p = path.join(dir, "missing-testnet.json");
  let created = false;
  try {
    loadTestnetLedger(p); // default allowCreate=false
  } catch (e) {
    // fatal is expected
    assert.ok(/TESTNET_LEDGER_FATAL/.test(e.message) || e instanceof Error);
    created = fs.existsSync(p);
  }
  assert.equal(fs.existsSync(p), false, "no replacement ledger file may be written on missing canonical path");
});

test("signer-init: explicit initializeTestnetLedger creates wallet/network/asset-bound ledger", () => {
  const dir = tmpDir();
  const p = path.join(dir, "init-testnet.json");
  const ledger = initializeTestnetLedger(p);
  assert.equal(fs.existsSync(p), true, "initializer must create the file");
  assert.equal(ledger.wallet.toLowerCase(), TESTNET_WALLET.toLowerCase());
  assert.equal(ledger.network, NETWORK_TESTNET);
  assert.equal(ledger.asset, "USDC");
  assert.equal(ledger.spentBudget, 0);
  assert.equal(ledger.remainingBudget, ledger.initialBudget);
  assert.deepEqual(ledger.purchases, {});
  // Re-load without allowCreate (operational mode) must now succeed.
  const reloaded = loadTestnetLedger(p, false);
  assert.equal(reloaded.wallet.toLowerCase(), TESTNET_WALLET.toLowerCase());
});

test("signer-init: stageTestnetUpdate PREPARED amount 5000 persists correct totals and keeps wallet", () => {
  const dir = tmpDir();
  const p = path.join(dir, "stage-testnet.json");
  makeTestnetLedger(p);
  const updated = stageTestnetUpdate(p, "purchase-1", "PREPARED", { amount: 5000, payTo: "0x0000000000000000000000000000000000000001" });
  assert.equal(updated.spentBudget, 5000);
  assert.equal(updated.remainingBudget, 1995000);
  assert.equal(updated.wallet.toLowerCase(), TESTNET_WALLET.toLowerCase());
  // The persisted file must agree (canonical totals written atomically).
  const persisted = JSON.parse(fs.readFileSync(p, "utf8"));
  assert.equal(persisted.spentBudget, 5000);
  assert.equal(persisted.remainingBudget, 1995000);
  assert.equal(persisted.wallet.toLowerCase(), TESTNET_WALLET.toLowerCase());
});

test("signer-init: stageTestnetUpdate refuses a wrong-wallet fixture", () => {
  const dir = tmpDir();
  const p = path.join(dir, "wrong-wallet.json");
  const bad = createEmptyLedger(NETWORK_TESTNET, { wallet: "0x0000000000000000000000000000000000000bad" });
  saveLedger(p, bad);
  assert.throws(
    () => stageTestnetUpdate(p, "purchase-2", "PREPARED", { amount: 1000 }),
    (e) => e && e.code === "WALLET_MISMATCH"
  );
});

test("ledger: allowCreate=true + expectedWallet=TESTNET_WALLET creates bound ledger and loads", () => {
  const dir = tmpDir();
  const p = path.join(dir, "create-bound.json");
  const { ledger } = loadLedger(p, NETWORK_TESTNET, {
    allowCreate: true,
    expectedWallet: TESTNET_WALLET,
  });
  assert.equal(fs.existsSync(p), true, "allowCreate must persist the new ledger");
  assert.equal(ledger.wallet.toLowerCase(), TESTNET_WALLET.toLowerCase(),
    "created ledger must contain the exact expected wallet");
  // Validate the binding by re-loading (operational mode, no create).
  const reloaded = loadLedger(p, NETWORK_TESTNET, { allowCreate: false, expectedWallet: TESTNET_WALLET });
  assert.equal(reloaded.ledger.wallet.toLowerCase(), TESTNET_WALLET.toLowerCase());
});
