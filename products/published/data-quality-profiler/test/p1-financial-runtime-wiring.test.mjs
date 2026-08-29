// P1 Batch 3 runtime wiring tests. No signing/network/spending occurs.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  createEmptyLedger,
  saveLedger,
  NETWORK_TESTNET,
  TESTNET_WALLET,
} from "../src/payments/ledger.mjs";
import { initializeFinancialStoreFromLedger, openFinancialStore } from "../src/payments/financial-store.mjs";
import {
  loadTestnetLedger,
  stageTestnetUpdate,
  DEFAULT_FINANCIAL_DB_PATH,
} from "../scripts/signer-init.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "p1-b3-wiring-"));
}

function withDbEnv(dbPath, fn) {
  const before = process.env.HERMES_FINANCIAL_DB_PATH;
  process.env.HERMES_FINANCIAL_DB_PATH = dbPath;
  try { return fn(); }
  finally {
    if (before === undefined) delete process.env.HERMES_FINANCIAL_DB_PATH;
    else process.env.HERMES_FINANCIAL_DB_PATH = before;
  }
}

test("signer Batch 3 runtime reads/writes SQLite while tracked JSON stays unchanged", () => {
  const dir = tmpDir();
  const ledgerPath = path.join(dir, "testnet.json");
  const dbPath = path.join(dir, "testnet.sqlite");
  saveLedger(ledgerPath, createEmptyLedger(NETWORK_TESTNET, { wallet: TESTNET_WALLET }));
  const bootstrap = initializeFinancialStoreFromLedger(dbPath, ledgerPath, NETWORK_TESTNET, { expectedWallet: TESTNET_WALLET });
  bootstrap.close();
  const before = fs.readFileSync(ledgerPath, "utf8");

  withDbEnv(dbPath, () => {
    const initial = loadTestnetLedger(ledgerPath);
    assert.equal(initial.spentBudget, 0);
    stageTestnetUpdate(ledgerPath, "wired", "PREPARED", {
      amount: 5000,
      payTo: "0x0000000000000000000000000000000000000001",
    });
    const after = loadTestnetLedger(ledgerPath);
    assert.equal(after.purchases.wired.stage, "PREPARED");
    assert.equal(after.spentBudget, 5000);
  });

  assert.equal(fs.readFileSync(ledgerPath, "utf8"), before, "live stage update must not mutate tracked JSON audit snapshot");
  const store = openFinancialStore(dbPath, NETWORK_TESTNET, { expectedWallet: TESTNET_WALLET });
  try { assert.equal(store.getPurchase("wired").stage, "PREPARED"); }
  finally { store.close(); }
});

test("signer compatibility records replay rejection as an event without erasing SETTLED", () => {
  const dir = tmpDir();
  const ledgerPath = path.join(dir, "testnet.json");
  const dbPath = path.join(dir, "testnet.sqlite");
  saveLedger(ledgerPath, createEmptyLedger(NETWORK_TESTNET, { wallet: TESTNET_WALLET }));
  initializeFinancialStoreFromLedger(dbPath, ledgerPath, NETWORK_TESTNET, { expectedWallet: TESTNET_WALLET }).close();

  withDbEnv(dbPath, () => {
    stageTestnetUpdate(ledgerPath, "replay", "PREPARED", { amount: 5000 });
    stageTestnetUpdate(ledgerPath, "replay", "SIGNED", { nonce: "0x1", validBefore: "9999999999" });
    stageTestnetUpdate(ledgerPath, "replay", "SETTLED", { transaction: "0xsettled" });
    stageTestnetUpdate(ledgerPath, "replay", "REPLAY_REJECTED", { replayStatus: 402 });
  });

  const store = openFinancialStore(dbPath, NETWORK_TESTNET, { expectedWallet: TESTNET_WALLET });
  try {
    assert.equal(store.getPurchase("replay").stage, "SETTLED");
    assert.ok(store.listEvents("replay").some((e) => e.event_type === "REPLAY_REJECTED"));
  } finally { store.close(); }
});

test("UNKNOWN timeout classification stays AMBIGUOUS and keeps its reservation", () => {
  const dir = tmpDir();
  const ledgerPath = path.join(dir, "testnet.json");
  const dbPath = path.join(dir, "testnet.sqlite");
  saveLedger(ledgerPath, createEmptyLedger(NETWORK_TESTNET, { wallet: TESTNET_WALLET }));
  initializeFinancialStoreFromLedger(dbPath, ledgerPath, NETWORK_TESTNET, { expectedWallet: TESTNET_WALLET }).close();

  withDbEnv(dbPath, () => {
    stageTestnetUpdate(ledgerPath, "unknown", "PREPARED", { amount: 7000 });
    stageTestnetUpdate(ledgerPath, "unknown", "SIGNED", { nonce: "0x2", validBefore: "9999999999" });
    stageTestnetUpdate(ledgerPath, "unknown", "AMBIGUOUS", {});
    stageTestnetUpdate(ledgerPath, "unknown", "UNKNOWN", {});
  });

  const store = openFinancialStore(dbPath, NETWORK_TESTNET, { expectedWallet: TESTNET_WALLET });
  try {
    assert.equal(store.getPurchase("unknown").stage, "AMBIGUOUS");
    assert.equal(store.budget().spentBudget, 7000);
  } finally { store.close(); }
});

test("default testnet financial DB is an ignored sqlite runtime path", () => {
  assert.ok(DEFAULT_FINANCIAL_DB_PATH.endsWith("state/commerce-control/financial/testnet-budget.sqlite"));
});

test("production buyer source uses authoritative store for execute and no raw stageUpdate", () => {
  const src = fs.readFileSync(path.join(__dirname, "../scripts/agent402-production-buyer.mjs"), "utf8");
  assert.ok(/openFinancialStore\(/.test(src));
  assert.ok(/FINANCIAL_DB_PATH/.test(src));
  assert.ok(/reconcileFromBlock/.test(src));
  assert.ok(!/stageUpdate\(/.test(src), "production buyer must not mutate JSON via raw stageUpdate");
  assert.ok(/MODE === "execute"/.test(src));
});
