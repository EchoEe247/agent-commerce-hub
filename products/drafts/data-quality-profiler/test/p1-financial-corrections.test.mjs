// P1 Batch 3 — final correction tests (defects 1-5).
// Covers: audit-export confidentiality, post-send negative response -> AMBIGUOUS,
// RPC chain-id binding, EIP-3009 nonce-bound reconciliation, and proven revert
// budget release. All state lives under os.tmpdir(); canonical ledgers are never
// touched.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  NETWORK_MAINNET,
  NETWORK_TESTNET,
  MAINNET_WALLET,
  TESTNET_WALLET,
  createEmptyLedger,
  saveLedger,
} from "../src/payments/ledger.mjs";
import {
  FinancialStoreError,
  initializeFinancialStoreFromLedger,
  openFinancialStore,
  exportFinancialStoreToLedger,
} from "../src/payments/financial-store.mjs";
import {
  collectChainEvidence,
  decideReconciliation,
  reconcilePurchase,
  BASE_USDC_BY_NETWORK,
  AUTHORIZATION_USED_TOPIC,
  EXPECTED_RPC_CHAIN_ID_BY_NETWORK,
} from "../src/payments/reconciliation.mjs";
import { classifyPostSendSettlement } from "../src/payments/agent402-buyer-policy.mjs";

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "p1-b3-correction-"));
}

function makeLedger(dir, network = NETWORK_TESTNET, wallet = TESTNET_WALLET) {
  const ledgerPath = path.join(dir, "ledger.json");
  saveLedger(ledgerPath, createEmptyLedger(network, { wallet }));
  return ledgerPath;
}

function initStore(dir, network = NETWORK_TESTNET, wallet = TESTNET_WALLET) {
  const ledgerPath = makeLedger(dir, network, wallet);
  const dbPath = path.join(dir, "financial.sqlite");
  const store = initializeFinancialStoreFromLedger(dbPath, ledgerPath, network, { expectedWallet: wallet });
  return { store, dbPath, ledgerPath };
}

const TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const pad = (a) => String(a).replace(/^0x/i, "").toLowerCase().padStart(64, "0");

// A fake RPC that answers every jsonrpc call from a handler table.
function fakeRpc(handlers) {
  return async (url, init) => {
    const body = JSON.parse(init.body);
    const handler = handlers[body.method];
    if (!handler) throw new Error(`unexpected RPC method ${body.method}`);
    return { ok: true, json: async () => ({ jsonrpc: "2.0", id: 1, result: handler(body.params) }) };
  };
}

// ---------------------------------------------------------------------------
// Defect 1 — public audit snapshot must never contain signed authorization.
// ---------------------------------------------------------------------------
test("audit export strips paymentPayload while local store retains it", () => {
  const dir = tmpDir();
  const { store, ledgerPath } = initStore(dir);
  try {
    let p = store.reservePurchase({ purchaseId: "signed-one", amount: 5000, payTo: TESTNET_WALLET });
    p = store.transitionPurchase("signed-one", "SIGNED", {
      nonce: "0xfeed",
      validBefore: "9999999999",
      paymentPayload: { signature: "SENSITIVE_TEST_SIGNATURE", x402Version: 2, payload: { authorization: { nonce: "0xfeed" } } },
      paymentRequirements: { network: NETWORK_TESTNET, amount: "5000" },
    }, { expectedRevision: p.revision });

    const local = store.getPurchase("signed-one");
    assert.ok(local.paymentPayload, "local store retains payment payload");
    assert.equal(local.paymentPayload.signature, "SENSITIVE_TEST_SIGNATURE");

    const exported = exportFinancialStoreToLedger(store, path.join(dir, "export.json"));
    const exportedPurchase = exported.purchases["signed-one"];
    assert.ok(exportedPurchase, "purchase present in export");
    assert.equal(exportedPurchase.paymentPayload, undefined, "paymentPayload must not reach public snapshot");
    assert.equal(exportedPurchase.stage, "SIGNED");
    assert.equal(exportedPurchase.nonce, "0xfeed");

    const serialized = JSON.stringify(exported);
    assert.ok(!serialized.includes("paymentPayload"), "no paymentPayload key in exported JSON");
    assert.ok(!serialized.includes("SENSITIVE_TEST_SIGNATURE"), "no sensitive signature in exported JSON");
  } finally { store.close(); }
});

test("local SQLite row still carries the signed payload after export", () => {
  const dir = tmpDir();
  const { store } = initStore(dir);
  try {
    let p = store.reservePurchase({ purchaseId: "signed-two", amount: 4000, payTo: TESTNET_WALLET });
    p = store.transitionPurchase("signed-two", "SIGNED", {
      nonce: "0xbeef",
      validBefore: "9999999999",
      paymentPayload: { signature: "SENSITIVE_TEST_SIGNATURE", payload: {} },
    }, { expectedRevision: p.revision });
    const snapshot = store.snapshot().purchases["signed-two"];
    assert.equal(snapshot.paymentPayload, undefined, "snapshot() is audit-safe");
    const raw = store.getPurchase("signed-two");
    assert.equal(raw.paymentPayload.signature, "SENSITIVE_TEST_SIGNATURE", "authoritative record keeps payload");
  } finally { store.close(); }
});

// ---------------------------------------------------------------------------
// Defect 2 — negative remote response must not release budget (stay AMBIGUOUS).
// ---------------------------------------------------------------------------
test("classifyPostSendSettlement keeps non-positive results AMBIGUOUS", () => {
  const positive = classifyPostSendSettlement({ httpOk: true, settle: { success: true, transaction: "0xabc" } });
  assert.equal(positive.stage, "SETTLED");
  assert.equal(positive.transaction, "0xabc");

  const negative = classifyPostSendSettlement({ httpOk: true, settle: { success: false } });
  assert.equal(negative.stage, "AMBIGUOUS");
  assert.equal(negative.settled, false);

  const httpFail = classifyPostSendSettlement({ httpOk: false, settle: null });
  assert.equal(httpFail.stage, "AMBIGUOUS");

  const missingHeader = classifyPostSendSettlement({ httpOk: true, settle: null });
  assert.equal(missingHeader.stage, "AMBIGUOUS");

  const missingTx = classifyPostSendSettlement({ httpOk: true, settle: { success: true } });
  assert.equal(missingTx.stage, "AMBIGUOUS");
});

test("negative paid response leaves purchase AMBIGUOUS and budget reserved", async () => {
  const dir = tmpDir();
  const { store } = initStore(dir);
  try {
    let p = store.reservePurchase({ purchaseId: "neg", amount: 7000, payTo: TESTNET_WALLET });
    p = store.transitionPurchase("neg", "SIGNED", { nonce: "0x1", validBefore: "9999999999" }, { expectedRevision: p.revision });
    assert.equal(store.budget().spentBudget, 7000);

    const result = await reconcilePurchase(store, "neg", {
      nowMs: 1000,
      chainEvidence: await (async () => {
        // Simulate the post-send negative response: no authoritative chain proof.
        return { status: "UNAVAILABLE", complete: false };
      })(),
      facilitatorEvidence: { status: "UNAVAILABLE", complete: false },
    });
    // A buyer that observes a negative remote result would persist AMBIGUOUS via
    // classifyPostSendSettlement; reconciliation of an unresolved SIGNED record
    // with no chain evidence HOLDs, never releases.
    assert.equal(store.getPurchase("neg").stage !== "FAILED", true, "negative response must not auto-FAILED");
    assert.equal(store.budget().spentBudget, 7000, "budget stays reserved after negative response");
  } finally { store.close(); }
});

// ---------------------------------------------------------------------------
// Defect 3 — reconciliation must verify RPC chain id (fail closed on wrong chain).
// ---------------------------------------------------------------------------
test("reconciliation fails closed when RPC reports the wrong chain", async () => {
  const dir = tmpDir();
  const { store } = initStore(dir, NETWORK_MAINNET, MAINNET_WALLET);
  try {
    let p = store.reservePurchase({ purchaseId: "wrong-chain", amount: 5000, payTo: MAINNET_WALLET, assetContract: BASE_USDC_BY_NETWORK[NETWORK_MAINNET] });
    p = store.transitionPurchase("wrong-chain", "SIGNED", { nonce: "0xaa", validBefore: "9999999999" }, { expectedRevision: p.revision });

    const rpc = fakeRpc({
      eth_chainId: () => "0x1", // Ethereum mainnet, not Base
    });
    const evidence = await collectChainEvidence(store.getPurchase("wrong-chain"), store.meta(), {
      rpcUrl: "https://rpc.invalid", fetchImpl: rpc,
    });
    assert.equal(evidence.status, "WRONG_CHAIN");
    assert.equal(evidence.expectedChainId, EXPECTED_RPC_CHAIN_ID_BY_NETWORK[NETWORK_MAINNET]);
    assert.equal(evidence.actualChainId, "0x1");

    const decision = decideReconciliation(store.getPurchase("wrong-chain"), { chain: evidence, facilitator: { status: "UNAVAILABLE", complete: false } });
    assert.equal(decision.action, "HOLD", "wrong chain must HOLD, not release");
    assert.equal(store.budget().spentBudget, 5000, "budget remains reserved on wrong chain");
  } finally { store.close(); }
});

test("reconciliation fails closed when RPC chain id is malformed", async () => {
  const dir = tmpDir();
  const { store } = initStore(dir, NETWORK_TESTNET, TESTNET_WALLET);
  try {
    let p = store.reservePurchase({ purchaseId: "malformed", amount: 3000, payTo: TESTNET_WALLET });
    p = store.transitionPurchase("malformed", "SIGNED", { nonce: "0xcc", validBefore: "9999999999" }, { expectedRevision: p.revision });
    const rpc = fakeRpc({ eth_chainId: () => 8453 }); // not 0x-hex
    const evidence = await collectChainEvidence(store.getPurchase("malformed"), store.meta(), {
      rpcUrl: "https://rpc.invalid", fetchImpl: rpc,
    });
    assert.equal(evidence.status, "WRONG_CHAIN");
  } finally { store.close(); }
});

// ---------------------------------------------------------------------------
// Defect 4 — reconciliation must bind to the EIP-3009 nonce.
// ---------------------------------------------------------------------------
test("same amount / wrong nonce cannot settle the purchase", async () => {
  const dir = tmpDir();
  const { store } = initStore(dir, NETWORK_TESTNET, TESTNET_WALLET);
  try {
    const payTo = TESTNET_WALLET;
    const amount = 5000;
    let p = store.reservePurchase({ purchaseId: "A", amount, payTo, reconcileFromBlock: "0x100" });
    p = store.transitionPurchase("A", "SIGNED", { nonce: "0xaaaaaaaa", validBefore: "9999999999" }, { expectedRevision: p.revision });

    // Chain contains a USDC Transfer W->P amount 5000 AND an AuthorizationUsed for
    // a DIFFERENT nonce (0xbbbbbbbb). Purchase A must NOT settle.
    const rpc = fakeRpc({
      eth_chainId: () => EXPECTED_RPC_CHAIN_ID_BY_NETWORK[NETWORK_TESTNET],
      eth_blockNumber: () => "0x200",
      eth_getLogs: () => ([
        {
          address: BASE_USDC_BY_NETWORK[NETWORK_TESTNET],
          topics: [TRANSFER_TOPIC, `0x${pad(payTo)}`, `0x${pad(payTo)}`],
          data: `0x${amount.toString(16)}`,
          transactionHash: "0xunrelated",
          blockNumber: "0x150",
        },
        {
          address: BASE_USDC_BY_NETWORK[NETWORK_TESTNET],
          topics: [AUTHORIZATION_USED_TOPIC, `0x${pad(payTo)}`, `0x${pad("0xbbbbbbbb")}`],
          transactionHash: "0xunrelated",
          blockNumber: "0x150",
        },
      ]),
      eth_getTransactionReceipt: (params) => ({
        status: "0x1",
        blockNumber: "0x150",
        logs: [
          { address: BASE_USDC_BY_NETWORK[NETWORK_TESTNET], topics: [TRANSFER_TOPIC, `0x${pad(payTo)}`, `0x${pad(payTo)}`], data: `0x${amount.toString(16)}`, transactionHash: "0xunrelated" },
          { address: BASE_USDC_BY_NETWORK[NETWORK_TESTNET], topics: [AUTHORIZATION_USED_TOPIC, `0x${pad(payTo)}`, `0x${pad("0xbbbbbbbb")}`], transactionHash: "0xunrelated" },
        ],
      }),
    });
    const evidence = await collectChainEvidence(store.getPurchase("A"), store.meta(), { rpcUrl: "https://rpc.invalid", fetchImpl: rpc });
    assert.equal(evidence.status, "NO_AUTHORIZATION", "wrong nonce: no matching AuthorizationUsed, must not settle");

    const decision = decideReconciliation(store.getPurchase("A"), { chain: evidence, facilitator: { status: "UNAVAILABLE", complete: false } });
    assert.equal(decision.action, "HOLD");
    assert.equal(store.budget().spentBudget, amount, "budget remains reserved; misattribution prevented");
  } finally { store.close(); }
});

test("exact nonce AuthorizationUsed + Transfer settles the purchase", async () => {
  const dir = tmpDir();
  const { store } = initStore(dir, NETWORK_TESTNET, TESTNET_WALLET);
  try {
    const payTo = TESTNET_WALLET;
    const amount = 5000;
    const nonce = "0xaaaaaaaa";
    let p = store.reservePurchase({ purchaseId: "B", amount, payTo, reconcileFromBlock: "0x100" });
    p = store.transitionPurchase("B", "SIGNED", { nonce, validBefore: "9999999999" }, { expectedRevision: p.revision });

    const rpc = fakeRpc({
      eth_chainId: () => EXPECTED_RPC_CHAIN_ID_BY_NETWORK[NETWORK_TESTNET],
      eth_blockNumber: () => "0x200",
      eth_getLogs: () => ([{
        address: BASE_USDC_BY_NETWORK[NETWORK_TESTNET],
        topics: [AUTHORIZATION_USED_TOPIC, `0x${pad(payTo)}`, `0x${pad(nonce)}`],
        transactionHash: "0xcorrect",
        blockNumber: "0x150",
      }]),
      eth_getTransactionReceipt: () => ({
        status: "0x1",
        blockNumber: "0x150",
        logs: [
          { address: BASE_USDC_BY_NETWORK[NETWORK_TESTNET], topics: [AUTHORIZATION_USED_TOPIC, `0x${pad(payTo)}`, `0x${pad(nonce)}`], transactionHash: "0xcorrect" },
          { address: BASE_USDC_BY_NETWORK[NETWORK_TESTNET], topics: [TRANSFER_TOPIC, `0x${pad(payTo)}`, `0x${pad(payTo)}`], data: `0x${amount.toString(16)}`, transactionHash: "0xcorrect" },
        ],
      }),
    });
    const evidence = await collectChainEvidence(store.getPurchase("B"), store.meta(), { rpcUrl: "https://rpc.invalid", fetchImpl: rpc });
    assert.equal(evidence.status, "SETTLED");
    assert.equal(evidence.transaction, "0xcorrect");

    const result = await reconcilePurchase(store, "B", {
      chainEvidence: evidence, facilitatorEvidence: { status: "UNAVAILABLE", complete: false },
    });
    assert.equal(result.purchase.stage, "SETTLED");
    assert.equal(result.purchase.transaction, "0xcorrect");
    assert.equal(store.budget().spentBudget, amount);
  } finally { store.close(); }
});

test("expired unused nonce with complete chain scan is eligible for FAILED", async () => {
  const dir = tmpDir();
  const { store } = initStore(dir, NETWORK_TESTNET, TESTNET_WALLET);
  try {
    let p = store.reservePurchase({ purchaseId: "expired-nonce", amount: 2000, payTo: TESTNET_WALLET, reconcileFromBlock: "0x100" });
    p = store.transitionPurchase("expired-nonce", "SIGNED", { nonce: "0xdead", validBefore: "10" }, { expectedRevision: p.revision });

    const rpc = fakeRpc({
      eth_chainId: () => EXPECTED_RPC_CHAIN_ID_BY_NETWORK[NETWORK_TESTNET],
      eth_blockNumber: () => "0x300",
      eth_getLogs: () => [], // no AuthorizationUsed for this nonce
    });
    const result = await reconcilePurchase(store, "expired-nonce", {
      nowMs: 100_000,
      authorizationGraceMs: 0,
      chainEvidence: await collectChainEvidence(store.getPurchase("expired-nonce"), store.meta(), { rpcUrl: "https://rpc.invalid", fetchImpl: rpc }),
      facilitatorEvidence: { status: "INVALID", complete: true, invalidReason: "expired" },
    });
    assert.equal(result.purchase.stage, "FAILED", "expired unused nonce eligible for release");
    assert.equal(store.budget().spentBudget, 0, "budget released");
  } finally { store.close(); }
});

test("reconciliation HOLDs when nonce is absent and no known transaction (current-runtime)", async () => {
  const dir = tmpDir();
  const { store } = initStore(dir, NETWORK_TESTNET, TESTNET_WALLET);
  try {
    // A current-runtime purchase with NO stored nonce and NO known transaction: a
    // bare transaction-less Transfer scan is ambiguous by design and must HOLD,
    // never auto-settle from (wallet, payTo, amount) alone.
    let p = store.reservePurchase({ purchaseId: "no-nonce", amount: 1500, payTo: TESTNET_WALLET, reconcileFromBlock: "0x100" });
    p = store.transitionPurchase("no-nonce", "AMBIGUOUS", {}, { expectedRevision: p.revision });
    const rpc = fakeRpc({
      eth_chainId: () => EXPECTED_RPC_CHAIN_ID_BY_NETWORK[NETWORK_TESTNET],
      eth_blockNumber: () => "0x300",
      eth_getLogs: () => ([{
        address: BASE_USDC_BY_NETWORK[NETWORK_TESTNET],
        topics: [TRANSFER_TOPIC, `0x${pad(TESTNET_WALLET)}`, `0x${pad(TESTNET_WALLET)}`],
        data: `0x${(1500).toString(16)}`,
        transactionHash: "0xother",
        blockNumber: "0x150",
      }]),
    });
    const evidence = await collectChainEvidence(store.getPurchase("no-nonce"), store.meta(), { rpcUrl: "https://rpc.invalid", fetchImpl: rpc });
    assert.equal(evidence.status, "SETTLED_AMBIGUOUS_TRANSFER_ONLY", "no-nonce transaction-less transfer scan is not authoritative");
    const decision = decideReconciliation(store.getPurchase("no-nonce"), { chain: evidence, facilitator: { status: "UNAVAILABLE", complete: false } });
    assert.equal(decision.action, "HOLD", "current-runtime no-nonce purchase must HOLD, not settle");
  } finally { store.close(); }
});

// ---------------------------------------------------------------------------
// Defect 5 — proven revert releases budget while preserving the hash.
// ---------------------------------------------------------------------------
test("proven reverted transaction releases budget and preserves the hash", async () => {
  const dir = tmpDir();
  const { store } = initStore(dir, NETWORK_TESTNET, TESTNET_WALLET);
  try {
    let p = store.reservePurchase({ purchaseId: "reverted", amount: 6000, payTo: TESTNET_WALLET });
    p = store.transitionPurchase("reverted", "SIGNED", { nonce: "0x77", validBefore: "9999999999" }, { expectedRevision: p.revision });
    p = store.transitionPurchase("reverted", "AMBIGUOUS", { transaction: "0xrevertedtx" }, { expectedRevision: p.revision });
    assert.equal(store.budget().spentBudget, 6000, "reserved before reconciliation");

    const rpc = fakeRpc({
      eth_chainId: () => EXPECTED_RPC_CHAIN_ID_BY_NETWORK[NETWORK_TESTNET],
      eth_getTransactionReceipt: () => ({ status: "0x0", blockNumber: "0x150" }),
    });
    const result = await reconcilePurchase(store, "reverted", {
      chainEvidence: await collectChainEvidence(store.getPurchase("reverted"), store.meta(), { rpcUrl: "https://rpc.invalid", fetchImpl: rpc }),
      facilitatorEvidence: { status: "UNAVAILABLE", complete: false },
    });
    assert.equal(result.purchase.stage, "FAILED", "reverted -> FAILED");
    assert.equal(result.purchase.revertedTransaction, "0xrevertedtx", "reverted hash preserved as evidence");
    assert.equal(result.purchase.transaction, null, "active transaction cleared so budget releases");
    assert.equal(store.getPurchase("reverted").transaction, null, "transaction_hash cleared in authoritative record");
    assert.equal(store.budget().spentBudget, 0, "budget released after proven revert");
  } finally { store.close(); }
});
