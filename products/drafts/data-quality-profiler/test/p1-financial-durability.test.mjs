// P1 Batch 3 — authoritative financial durability/reconciliation tests.
// All state lives under os.tmpdir(); canonical repository ledgers are never
// mutated by this test file.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  createEmptyLedger,
  saveLedger,
  NETWORK_MAINNET,
  NETWORK_TESTNET,
  MAINNET_WALLET,
  TESTNET_WALLET,
  TESTNET_DEFAULT_CEILING_RAW,
} from "../src/payments/ledger.mjs";
import {
  FinancialStoreError,
  initializeFinancialStoreFromLedger,
  openFinancialStore,
  compareFinancialStoreToLedger,
  exportFinancialStoreToLedger,
} from "../src/payments/financial-store.mjs";
import {
  collectChainEvidence,
  collectFacilitatorEvidence,
  decideReconciliation,
  reconcilePurchase,
  BASE_USDC_BY_NETWORK,
  EXPECTED_RPC_CHAIN_ID_BY_NETWORK,
  AUTHORIZATION_USED_TOPIC,
} from "../src/payments/reconciliation.mjs";

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "p1-b3-financial-"));
}

function makeLedger(dir, network = NETWORK_TESTNET, wallet = TESTNET_WALLET) {
  const ledgerPath = path.join(dir, "ledger.json");
  const ledger = createEmptyLedger(network, { wallet });
  saveLedger(ledgerPath, ledger);
  return { ledgerPath, ledger };
}

function initTestnetStore(dir) {
  const { ledgerPath } = makeLedger(dir);
  const dbPath = path.join(dir, "financial.sqlite");
  const store = initializeFinancialStoreFromLedger(
    dbPath,
    ledgerPath,
    NETWORK_TESTNET,
    { expectedWallet: TESTNET_WALLET }
  );
  return { store, dbPath, ledgerPath };
}

test("Batch 3 initialization imports a strict ledger into SQLite and preserves totals", () => {
  const dir = tmpDir();
  const { ledgerPath, ledger } = makeLedger(dir);
  ledger.purchases.old = {
    purchaseId: "old",
    stage: "SETTLED",
    amount: 5000,
    payTo: "0x0000000000000000000000000000000000000001",
    transaction: "0xabc",
    updatedAt: new Date().toISOString(),
  };
  ledger.spentBudget = 5000;
  ledger.remainingBudget = ledger.initialBudget - 5000;
  saveLedger(ledgerPath, ledger);

  const dbPath = path.join(dir, "financial.sqlite");
  const store = initializeFinancialStoreFromLedger(dbPath, ledgerPath, NETWORK_TESTNET, {
    expectedWallet: TESTNET_WALLET,
  });
  try {
    assert.equal(store.getPurchase("old").stage, "SETTLED");
    assert.equal(store.budget().spentBudget, 5000);
    assert.equal(store.budget().remainingBudget, TESTNET_DEFAULT_CEILING_RAW - 5000);
    assert.equal(store.meta().wallet.toLowerCase(), TESTNET_WALLET.toLowerCase());
  } finally { store.close(); }
});

test("operational open fails closed when the authoritative DB is missing", () => {
  const dir = tmpDir();
  assert.throws(
    () => openFinancialStore(path.join(dir, "missing.sqlite"), NETWORK_MAINNET, { expectedWallet: MAINNET_WALLET }),
    (e) => e instanceof FinancialStoreError && e.code === "STORE_MISSING"
  );
});

test("initialization refuses to replace an existing authoritative DB", () => {
  const dir = tmpDir();
  const { store, dbPath, ledgerPath } = initTestnetStore(dir);
  store.close();
  assert.throws(
    () => initializeFinancialStoreFromLedger(dbPath, ledgerPath, NETWORK_TESTNET, { expectedWallet: TESTNET_WALLET }),
    (e) => e instanceof FinancialStoreError && e.code === "STORE_ALREADY_EXISTS"
  );
});

test("BEGIN IMMEDIATE budget reservation prevents concurrent overspend", () => {
  const dir = tmpDir();
  const { store: a, dbPath } = initTestnetStore(dir);
  const b = openFinancialStore(dbPath, NETWORK_TESTNET, { expectedWallet: TESTNET_WALLET });
  try {
    a.reservePurchase({ purchaseId: "big", amount: 1_900_000, payTo: "0x0000000000000000000000000000000000000001" });
    assert.throws(
      () => b.reservePurchase({ purchaseId: "too-much", amount: 200_000, payTo: "0x0000000000000000000000000000000000000002" }),
      (e) => e instanceof FinancialStoreError && e.code === "BUDGET_EXCEEDED"
    );
    assert.equal(a.budget().spentBudget, 1_900_000);
    assert.equal(a.getPurchase("too-much"), null);
  } finally { a.close(); b.close(); }
});

test("purchase revision is a CAS guard against stale writers", () => {
  const dir = tmpDir();
  const { store: a, dbPath } = initTestnetStore(dir);
  const b = openFinancialStore(dbPath, NETWORK_TESTNET, { expectedWallet: TESTNET_WALLET });
  try {
    const reserved = a.reservePurchase({ purchaseId: "cas", amount: 1000 });
    const staleRevision = reserved.revision;
    const fresh = b.getPurchase("cas");
    b.transitionPurchase("cas", "SIGNED", { nonce: "0x01", validBefore: "9999999999" }, {
      expectedRevision: fresh.revision,
    });
    assert.throws(
      () => a.transitionPurchase("cas", "AMBIGUOUS", {}, { expectedRevision: staleRevision }),
      (e) => e instanceof FinancialStoreError && e.code === "CAS_CONFLICT"
    );
    assert.equal(a.getPurchase("cas").stage, "SIGNED");
  } finally { a.close(); b.close(); }
});

test("amount is immutable after reservation", () => {
  const dir = tmpDir();
  const { store } = initTestnetStore(dir);
  try {
    const p = store.reservePurchase({ purchaseId: "immutable", amount: 1000 });
    assert.throws(
      () => store.transitionPurchase("immutable", "SIGNED", { amount: 2000 }, { expectedRevision: p.revision }),
      (e) => e instanceof FinancialStoreError && e.code === "IMMUTABLE_FIELD"
    );
  } finally { store.close(); }
});

test("SIGNED intent survives close/reopen for post-crash reconciliation", () => {
  const dir = tmpDir();
  const { store, dbPath } = initTestnetStore(dir);
  const reserved = store.reservePurchase({
    purchaseId: "crash-safe",
    amount: 4000,
    payTo: "0x0000000000000000000000000000000000000001",
    reconcileFromBlock: "0x100",
    assetContract: BASE_USDC_BY_NETWORK[NETWORK_TESTNET],
  });
  store.transitionPurchase("crash-safe", "SIGNED", {
    nonce: "0xdead",
    validBefore: "9999999999",
    paymentPayload: { x402Version: 2, payload: { authorization: { nonce: "0xdead" } } },
    paymentRequirements: { network: NETWORK_TESTNET, amount: "4000" },
  }, { expectedRevision: reserved.revision });
  store.close();

  const reopened = openFinancialStore(dbPath, NETWORK_TESTNET, { expectedWallet: TESTNET_WALLET });
  try {
    const p = reopened.getPurchase("crash-safe");
    assert.equal(p.stage, "SIGNED");
    assert.equal(p.nonce, "0xdead");
    assert.equal(p.reconcileFromBlock, "0x100");
    assert.equal(reopened.budget().spentBudget, 4000);
  } finally { reopened.close(); }
});

test("stale unsigned PREPARED reservation is safely released", async () => {
  const dir = tmpDir();
  const { store } = initTestnetStore(dir);
  try {
    store.reservePurchase({
      purchaseId: "stale-prepared",
      amount: 6000,
      reservationExpiresAt: 1000,
    }, { nowMs: 1 });
    const result = await reconcilePurchase(store, "stale-prepared", {
      nowMs: 2000,
      chainEvidence: { status: "UNAVAILABLE", complete: false },
      facilitatorEvidence: { status: "UNAVAILABLE", complete: false },
    });
    assert.equal(result.changed, true);
    assert.equal(result.purchase.stage, "FAILED");
    assert.equal(store.budget().spentBudget, 0);
  } finally { store.close(); }
});

test("expired SIGNED reservation releases only after complete no-transfer chain evidence", async () => {
  const dir = tmpDir();
  const { store } = initTestnetStore(dir);
  try {
    const p = store.reservePurchase({ purchaseId: "expired", amount: 7000 });
    store.transitionPurchase("expired", "SIGNED", { nonce: "0x1", validBefore: "10" }, {
      expectedRevision: p.revision,
    });
    const held = decideReconciliation(store.getPurchase("expired"), {
      chain: { status: "ERROR", complete: false },
      facilitator: { status: "INVALID", complete: true },
    }, { nowMs: 100_000 });
    assert.equal(held.action, "HOLD", "incomplete chain evidence must not release signed funds");

    const result = await reconcilePurchase(store, "expired", {
      nowMs: 100_000,
      authorizationGraceMs: 0,
      chainEvidence: { status: "NO_MATCH", complete: true, latestBlock: "0x200" },
      facilitatorEvidence: { status: "INVALID", complete: true, invalidReason: "expired" },
    });
    assert.equal(result.purchase.stage, "FAILED");
    assert.equal(store.budget().spentBudget, 0);
  } finally { store.close(); }
});

test("valid facilitator authorization keeps an unresolved reservation held", () => {
  const decision = decideReconciliation({
    stage: "SIGNED",
    validBefore: "9999999999",
  }, {
    chain: { status: "NO_MATCH", complete: true },
    facilitator: { status: "VALID", complete: true },
  }, { nowMs: 1000 });
  assert.equal(decision.action, "HOLD");
  assert.equal(decision.reason, "AUTHORIZATION_STILL_VALID");
});

test("positive chain evidence settles an ambiguous purchase", async () => {
  const dir = tmpDir();
  const { store } = initTestnetStore(dir);
  try {
    let p = store.reservePurchase({ purchaseId: "amb", amount: 9000 });
    p = store.transitionPurchase("amb", "SIGNED", { nonce: "0xa", validBefore: "9999999999" }, { expectedRevision: p.revision });
    store.transitionPurchase("amb", "AMBIGUOUS", {}, { expectedRevision: p.revision });
    const result = await reconcilePurchase(store, "amb", {
      chainEvidence: { status: "SETTLED", complete: true, transaction: "0xsettled" },
      facilitatorEvidence: { status: "UNAVAILABLE", complete: false },
    });
    assert.equal(result.purchase.stage, "SETTLED");
    assert.equal(result.purchase.transaction, "0xsettled");
    assert.equal(store.budget().spentBudget, 9000);
  } finally { store.close(); }
});

test("authoritative chain evidence can recover a conservatively FAILED purchase", async () => {
  const dir = tmpDir();
  const { store } = initTestnetStore(dir);
  try {
    let p = store.reservePurchase({ purchaseId: "recover", amount: 8000 });
    p = store.transitionPurchase("recover", "SIGNED", { validBefore: "10", nonce: "0xb" }, { expectedRevision: p.revision });
    store.transitionPurchase("recover", "FAILED", { reason: "earlier conservative classification" }, { expectedRevision: p.revision });
    assert.equal(store.budget().spentBudget, 0);
    const result = await reconcilePurchase(store, "recover", {
      chainEvidence: { status: "SETTLED", complete: true, transaction: "0xlate" },
      facilitatorEvidence: { status: "UNAVAILABLE", complete: false },
    });
    assert.equal(result.purchase.stage, "SETTLED");
    assert.equal(store.budget().spentBudget, 8000);
  } finally { store.close(); }
});

test("chain receipt reconciliation verifies the exact USDC Transfer", async () => {
  const wallet = TESTNET_WALLET;
  const payTo = "0x0000000000000000000000000000000000000001";
  const pad = (a) => a.slice(2).toLowerCase().padStart(64, "0");
  const amount = 5000;
  const fetchImpl = async (url, init) => {
    const body = JSON.parse(init.body);
    if (body.method === "eth_chainId") {
      return { ok: true, json: async () => ({ jsonrpc: "2.0", id: 1, result: EXPECTED_RPC_CHAIN_ID_BY_NETWORK[NETWORK_TESTNET] }) };
    }
    if (body.method === "eth_getTransactionReceipt") {
      return { ok: true, json: async () => ({
        jsonrpc: "2.0",
        id: 1,
        result: {
          status: "0x1",
          blockNumber: "0x123",
          logs: [{
            address: BASE_USDC_BY_NETWORK[NETWORK_TESTNET],
            topics: [
              "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef",
              `0x${pad(wallet)}`,
              `0x${pad(payTo)}`,
            ],
            data: `0x${amount.toString(16)}`,
          }],
        },
      }) };
    }
    throw new Error(`unexpected RPC method ${body.method}`);
  };
  const evidence = await collectChainEvidence({
    stage: "AMBIGUOUS",
    amount,
    payTo,
    transaction: "0xtx",
  }, {
    network: NETWORK_TESTNET,
    wallet,
  }, {
    rpcUrl: "https://rpc.invalid",
    fetchImpl,
  });
  assert.equal(evidence.status, "SETTLED");
  assert.equal(evidence.transaction, "0xtx");
});

test("facilitator /verify evidence is advisory and parsed without settling", async () => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    return { ok: true, json: async () => ({ isValid: true, payer: TESTNET_WALLET }) };
  };
  const evidence = await collectFacilitatorEvidence({
    paymentPayload: { x402Version: 2, payload: { authorization: {} } },
    paymentRequirements: { network: NETWORK_TESTNET, amount: "1000" },
  }, {
    facilitatorUrl: "https://facilitator.example",
    fetchImpl,
  });
  assert.equal(evidence.status, "VALID");
  assert.equal(calls.length, 1);
  assert.ok(calls[0].url.endsWith("/verify"));
});

test("JSON audit export advances compatible history but refuses divergence", () => {
  const dir = tmpDir();
  const { store, ledgerPath } = initTestnetStore(dir);
  try {
    let p = store.reservePurchase({ purchaseId: "new-one", amount: 5000, payTo: "0x0000000000000000000000000000000000000001" });
    p = store.transitionPurchase("new-one", "SIGNED", { nonce: "0x2", validBefore: "9999999999" }, { expectedRevision: p.revision });
    store.transitionPurchase("new-one", "SETTLED", { transaction: "0xnew" }, { expectedRevision: p.revision });

    const before = compareFinancialStoreToLedger(store, ledgerPath);
    assert.equal(before.compatible, true);
    assert.equal(before.exact, false);
    const exported = exportFinancialStoreToLedger(store, ledgerPath);
    assert.equal(exported.purchases["new-one"].stage, "SETTLED");

    const divergent = JSON.parse(fs.readFileSync(ledgerPath, "utf8"));
    divergent.purchases["new-one"].amount = 9999;
    fs.writeFileSync(ledgerPath, JSON.stringify(divergent, null, 2) + "\n");
    const rawBefore = fs.readFileSync(ledgerPath, "utf8");
    assert.throws(
      () => exportFinancialStoreToLedger(store, ledgerPath),
      (e) => e instanceof FinancialStoreError && e.code === "LEDGER_DIVERGENCE"
    );
    assert.equal(fs.readFileSync(ledgerPath, "utf8"), rawBefore, "divergent audit ledger must not be overwritten");
  } finally { store.close(); }
});

test("network or wallet mismatch cannot open the authoritative store", () => {
  const dir = tmpDir();
  const { store, dbPath } = initTestnetStore(dir);
  store.close();
  assert.throws(
    () => openFinancialStore(dbPath, NETWORK_MAINNET, { expectedWallet: MAINNET_WALLET }),
    (e) => e instanceof FinancialStoreError && e.code === "NETWORK_MISMATCH"
  );
  assert.throws(
    () => openFinancialStore(dbPath, NETWORK_TESTNET, { expectedWallet: "0x0000000000000000000000000000000000000bad" }),
    (e) => e instanceof FinancialStoreError && e.code === "WALLET_MISMATCH"
  );
});
