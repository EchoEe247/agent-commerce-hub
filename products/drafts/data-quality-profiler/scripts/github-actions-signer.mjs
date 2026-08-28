// Base Sepolia x402 live validation & Production-signer simulation in GitHub Actions.
// REAL facilitator, REAL EIP-3009 signing, with budget policies and latency metrics.
import Fastify from "fastify";
import net from "node:net";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { privateKeyToAccount } from "viem/accounts";
import { x402Client, x402HTTPClient } from "@x402/core/client";
import { registerExactEvmScheme } from "@x402/evm/exact/client";
import { x402ResourceServer, HTTPFacilitatorClient } from "@x402/core/server";
import { ExactEvmScheme } from "@x402/evm/exact/server";
import { paymentMiddleware } from "@x402/fastify";
import { buildApp } from "../src/app.mjs";
import { buildPaymentPlugin } from "../src/payments/x402-plugin.mjs";

const TEST_WALLET = "0xc6139957cf09F97718cA6b3c88fB3931aDC04ead";
const TEST_USDC = "0x036CbD53842c5426634e7929541eC2318f3dCF7e";
const BASE_SEPOLIA = "eip155:84532";
const FACILITATOR_URL = process.env.X402_FACILITATOR_URL ?? "https://x402.org/facilitator";
const PAY_TO = "0x0000000000000000000000000000000000000001";
const PAY_TO_FAIL = "0x0000000000000000000000000000000000000002";
const PRICE = "$0.02";
const PRICE_RAW = 20000n;
const RPC_URL = "https://sepolia.base.org";
const TRANSFER_TOPIC =
  "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

// Log array
const log = [];
function add(msg) {
  console.log(msg);
  log.push(`${new Date().toISOString()} ${msg}`);
}

// ── RPC helpers ──────────────────────────────────────────────────────
async function rpcCall(method, params) {
  const res = await fetch(RPC_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    signal: AbortSignal.timeout(20000),
  });
  const json = await res.json();
  if (json.error) throw new Error(`rpc ${method}: ${JSON.stringify(json.error)}`);
  return json.result;
}
const pad = (addr) => addr.slice(2).toLowerCase().padStart(64, "0");
async function usdcBalance(addr) {
  const hex = await rpcCall("eth_call", [
    { to: TEST_USDC, data: "0x70a08231" + pad(addr) },
    "latest",
  ]);
  return BigInt(hex ?? "0x0");
}
const ethBalance = async (addr) =>
  BigInt((await rpcCall("eth_getBalance", [addr, "latest"])) ?? "0x0");
const txCount = async (addr) =>
  Number(BigInt((await rpcCall("eth_getTransactionCount", [addr, "latest"])) ?? "0x0"));

async function pollReceipt(hash, attempts = 30, intervalMs = 4000) {
  for (let i = 0; i < attempts; i++) {
    const receipt = await rpcCall("eth_getTransactionReceipt", [hash]);
    if (receipt) return receipt;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  return null;
}
async function transferLogs(fromBlockHex, to) {
  return (
    (await rpcCall("eth_getLogs", [
      {
        address: TEST_USDC,
        fromBlock: fromBlockHex,
        toBlock: "latest",
        topics: [TRANSFER_TOPIC, "0x" + pad(TEST_WALLET), "0x" + pad(to)],
      },
    ])) ?? []
  );
}

function decode402(res) {
  const header = res.headers.get("payment-required");
  if (!header) throw new Error("missing PAYMENT-REQUIRED header");
  return JSON.parse(Buffer.from(header, "base64").toString("utf8"));
}

function sendAndAbandon(port, pathName, paymentHeaderName, paymentHeaderValue, body) {
  return new Promise((resolve, reject) => {
    const socket = net.connect(port, "127.0.0.1", () => {
      const payload =
        `POST ${pathName} HTTP/1.1\r\n` +
        `Host: 127.0.0.1:${port}\r\n` +
        `content-type: application/json\r\n` +
        `content-length: ${Buffer.byteLength(body)}\r\n` +
        `${paymentHeaderName}: ${paymentHeaderValue}\r\n` +
        `connection: close\r\n\r\n` +
        body;
      socket.write(payload, () => {
        socket.destroy();
        resolve();
      });
    });
    socket.on("error", reject);
  });
}

// ── Budget Ledger Management (TESTNET ONLY) ──────────────────────────
// P1 Batch 2 correction: this signer is STRICTLY testnet (Base Sepolia,
// eip155:84532). It must never open or write the mainnet ledger. The testnet
// ledger is a physically separate file, bound to the known testnet wallet. A
// malformed existing ledger is FATAL — it must NEVER be reset to a default
// document. The stale embedded production budget default has been removed.
// Network/wallet binding logic lives in signer-init.mjs so it can be tested
// without contacting testnet or signing.
import {
  loadTestnetLedger,
  resolveSignerNetwork,
  verifyTestnetWallet,
  SIGNER_NETWORK,
  recalculateBudget,
} from "./signer-init.mjs";

// Explicitly declared at module scope. The strict loader assigns it before any
// purchase-stage mutation or signing happens.
let ledgerData;
const ledgerPath = (await import("node:path")).join(
  (await import("node:url")).fileURLToPath(import.meta.url),
  "../../../../state/commerce-control/ledgers/testnet-budget-ledger.json"
);

function updatePurchaseStage(networkKey, purchaseId, stage, extra = {}) {
  // Single canonical totals path: stageUpdate recalculates spent/remaining from
  // purchases and atomically persists consistent root totals.
  ledgerData = stageUpdate(
    ledgerPath,
    SIGNER_NETWORK,
    purchaseId,
    stage,
    extra
  );
  add(`[ledger] ${purchaseId} -> ${stage} updated: spentBudget=${ledgerData.spentBudget} remainingBudget=${ledgerData.remainingBudget}`);
  return ledgerData;
}


// ── Quote & Policy Validation ─────────────────────────────────────────
function validateQuoteAndBudget(quote, expectedPayTo, networkKey) {
  // This signer is STRICTLY testnet. Any attempt to pass a mainnet key is a
  // programming error and is refused rather than silently touching a different
  // network's financial state.
  if (networkKey !== "testnet") {
    return { ok: false, reason: `signer is testnet-only; refused network key ${networkKey}` };
  }
  const b = ledgerData;
  // Signer is strictly testnet: expected chain and token are the testnet ones.
  const expectedChain = BASE_SEPOLIA;
  const expectedToken = TEST_USDC;

  if (quote.network !== expectedChain) return { ok: false, reason: `wrong chain, expected ${expectedChain}, got ${quote.network}` };
  if ((quote.asset ?? "").toLowerCase() !== expectedToken.toLowerCase())
    return { ok: false, reason: `wrong token, expected ${expectedToken}, got ${quote.asset}` };

  let amount;
  try {
    amount = BigInt(quote.amount ?? quote.maxAmountRequired ?? "0");
  } catch {
    return { ok: false, reason: "unparseable amount" };
  }
  if (amount <= 0n) return { ok: false, reason: "invalid amount" };
  
  // Normal per-purchase cap: <= 100,000 raw USDC ($0.10)
  const cap = 100000n;
  if (amount > cap) return { ok: false, reason: `amount ${amount} above per-purchase cap ${cap}` };

  // Budget Policy: B2_COMMERCE_OPERATING_BUDGET_V1 cumulative budget ceiling <= 2.00 USDC
  // ledgerData.remainingBudget is the canonical, recalc-consistent total.
  if (BigInt(b.remainingBudget) < amount) {
    return { ok: false, reason: `insufficient remaining budget (needs ${amount}, has ${b.remainingBudget})` };
  }

  if ((quote.payTo ?? "").toLowerCase() !== expectedPayTo.toLowerCase())
    return { ok: false, reason: "wrong payTo" };

  const timeout = Number(quote.maxTimeoutSeconds ?? 0);
  if (!Number.isFinite(timeout) || timeout <= 0)
    return { ok: false, reason: "stale/invalid validity window" };
  if (timeout > 3600) return { ok: false, reason: "validity window too long" };

  const extra = quote.extra ?? {};
  if (extra.recurring || extra.subscription || extra.approval)
    return { ok: false, reason: "recurring/subscription/approval not allowed" };

  return { ok: true, amount };
}

async function run() {
  const T_START = Date.now();
  add("START GitHub Actions External Signer Validation");

  // Refuse mainnet input BEFORE any key material is used.
  resolveSignerNetwork(process.env.NETWORK);

  // Load private key and verify it matches the known testnet wallet BEFORE
  // any signing/payment operation.
  const testPrivateKey = process.env.HERMES_COMMERCE_SPEND_TEST_PRIVATE_KEY;
  const account = verifyTestnetWallet(testPrivateKey);

  // Setup/load budget ledger (testnet-only, wallet-bound, strict).
  ledgerData = loadTestnetLedger(ledgerPath);

  const purchaseId = process.env.PURCHASE_ID || `purchase-${Date.now()}`;
  const networkKey = "testnet"; // For Sepolia testnet live validation
  const budget = ledgerData;

  // Replay check
  if (budget.purchases[purchaseId] && budget.purchases[purchaseId].stage === "SETTLED") {
    throw new Error(`REPLAY_PROTECTION: Purchase ${purchaseId} is already SETTLED`);
  }

  const startBlockHex = await rpcCall("eth_blockNumber", []);
  add(`start block=${Number(BigInt(startBlockHex))}`);

  // Stage 1: facilitator support
  const supportedRes = await fetch(`${FACILITATOR_URL}/supported`, {
    signal: AbortSignal.timeout(20000),
  });
  if (!supportedRes.ok) throw new Error(`facilitator /supported ${supportedRes.status}`);
  const supported = await supportedRes.json();
  const kind = (supported.kinds ?? []).find(
    (k) => k.x402Version === 2 && k.scheme === "exact" && k.network === BASE_SEPOLIA
  );
  if (!kind) throw new Error("facilitator does not list exact/eip155:84532 (v2)");
  add(`facilitator supports exact on ${BASE_SEPOLIA} (x402Version=2)`);

  // Stage 2: merchant app with the FIXED lifecycle (listen -> x402Ready)
  const pluginConfig = {
    serviceVersion: "0.1.0",
    x402Enabled: true,
    x402Network: BASE_SEPOLIA,
    x402Price: PRICE,
    x402PayTo: PAY_TO,
    x402FacilitatorUrl: FACILITATOR_URL,
    allowMainnet: false,
  };
  const app = buildApp({
    config: pluginConfig,
    paymentPlugin: buildPaymentPlugin(pluginConfig),
  });
  await app.listen({ port: 0, host: "127.0.0.1" });
  await app.x402Ready();
  const appPort = app.server.address().port;
  const baseUrl = `http://127.0.0.1:${appPort}`;
  add(`merchant listening at ${baseUrl}; facilitator discovery completed AFTER listen`);

  // Buyer client: ONLY the bounded exact/EIP-3009 scheme is registered.
  const client = new x402Client();
  registerExactEvmScheme(client, { signer: account });
  const httpClient = new x402HTTPClient(client);

  // Stage 3: pre-flight reads
  const [buyerUsdc0, payToUsdc0, failPayToUsdc0, buyerEth0, buyerNonce0] =
    await Promise.all([
      usdcBalance(TEST_WALLET),
      usdcBalance(PAY_TO),
      usdcBalance(PAY_TO_FAIL),
      ethBalance(TEST_WALLET),
      txCount(TEST_WALLET),
    ]);
  add(
    `pre: buyerUSDC=${buyerUsdc0} payToUSDC=${payToUsdc0} failPayToUSDC=${failPayToUsdc0} buyerETH=${buyerEth0} buyerNonce=${buyerNonce0}`
  );
  if (buyerUsdc0 < PRICE_RAW) throw new Error("buyer test USDC below quote amount");

  // Stage 4: 402 quote + policy validation
  const T_QUOTE_REQ = Date.now();
  const unpaid = await fetch(`${baseUrl}/v1/profile`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ format: "json", records: [{ id: 1 }] }),
    signal: AbortSignal.timeout(30000),
  });
  const T_QUOTE_RESP = Date.now();
  add(`unpaid status=${unpaid.status}`);
  if (unpaid.status !== 402) throw new Error(`expected 402, got ${unpaid.status}`);
  const unpaidBodyText = await unpaid.text();
  const paymentRequiredDecoded = decode402(unpaid);
  const quote = paymentRequiredDecoded.accepts?.[0];
  add(
    `quote scheme=${quote?.scheme} network=${quote?.network} amount=${quote?.amount} asset=${quote?.asset} payTo=${quote?.payTo} maxTimeoutSeconds=${quote?.maxTimeoutSeconds}`
  );

  // Quote & Budget Policy Validation
  const policy = validateQuoteAndBudget(quote, PAY_TO, networkKey);
  const T_POLICY_VAL = Date.now();
  add(`policy validation=${policy.ok ? "PASS" : `REJECT (${policy.reason})`}`);
  if (!policy.ok) throw new Error(`quote failed policy: ${policy.reason}`);
  updatePurchaseStage(networkKey, purchaseId, "PREPARED", { amount: Number(PRICE_RAW), payTo: PAY_TO });

  // Stage 5: narrow EIP-3009 authorization (local test signer)
  let unpaidBody;
  try {
    unpaidBody = unpaidBodyText ? JSON.parse(unpaidBodyText) : undefined;
  } catch {}
  const paymentRequired = httpClient.getPaymentRequiredResponse(
    (n) => unpaid.headers.get(n),
    unpaidBody
  );
  const T_SIGN_START = Date.now();
  const paymentPayload = await client.createPaymentPayload(paymentRequired);
  const T_SIGN_END = Date.now();
  const auth = paymentPayload.payload?.authorization ?? {};
  add(
    `signed EIP-3009 auth: from=${auth.from} to=${auth.to} value=${auth.value} validAfter=${auth.validAfter} validBefore=${auth.validBefore} nonce=${auth.nonce} signMs=${T_SIGN_END - T_SIGN_START}`
  );
  if ((auth.to ?? "").toLowerCase() !== PAY_TO.toLowerCase())
    throw new Error("authorization recipient mismatch");
  if (BigInt(auth.value ?? "0") !== PRICE_RAW)
    throw new Error("authorization value mismatch");
  updatePurchaseStage(networkKey, purchaseId, "SIGNED", { nonce: auth.nonce, validBefore: auth.validBefore });
  const paymentHeaders = httpClient.encodePaymentSignatureHeader(paymentPayload);

  // Stage 6: paid retry -> handler + facilitator settlement
  const T_PAID_START = Date.now();
  const paid = await fetch(`${baseUrl}/v1/profile`, {
    method: "POST",
    headers: { "content-type": "application/json", ...paymentHeaders },
    body: JSON.stringify({ format: "json", records: [{ id: 1 }] }),
    signal: AbortSignal.timeout(120000),
  });
  const T_PAID_END = Date.now();
  add(`paid status=${paid.status} elapsedMs=${T_PAID_END - T_PAID_START} quoteToPaidMs=${T_PAID_END - T_QUOTE_REQ}`);
  const paidBody = await paid.text();
  if (paid.status !== 200) {
    add(`paid body=${paidBody.slice(0, 400)}`);
    throw new Error(`paid request failed: ${paid.status}`);
  }
  const settleHeader =
    paid.headers.get("payment-response") ?? paid.headers.get("x-payment-response");
  if (!settleHeader) throw new Error("missing PAYMENT-RESPONSE settle header");
  const settle = JSON.parse(Buffer.from(settleHeader, "base64").toString("utf8"));
  add(`settle response=${JSON.stringify(settle)}`);
  if (!settle.success) throw new Error("facilitator settle reported failure");
  updatePurchaseStage(networkKey, purchaseId, "SETTLED", { transaction: settle.transaction });

  // Stage 7: on-chain confirmation of the settlement transaction
  const receipt = await pollReceipt(settle.transaction);
  const T_SETTLE_CONFIRMED = Date.now();
  if (!receipt) throw new Error(`no receipt for settlement tx ${settle.transaction}`);
  add(
    `settlement receipt: block=${Number(BigInt(receipt.blockNumber))} status=${receipt.status} from(facilitator broadcaster)=${receipt.from} to=${receipt.to}`
  );
  if (receipt.status !== "0x1") throw new Error("settlement tx reverted");
  const transferLog = (receipt.logs ?? []).find(
    (l) =>
      l.address.toLowerCase() === TEST_USDC.toLowerCase() &&
      l.topics?.[0] === TRANSFER_TOPIC &&
      l.topics?.[1] === "0x" + pad(TEST_WALLET) &&
      l.topics?.[2] === "0x" + pad(PAY_TO)
  );
  if (!transferLog) throw new Error("settlement receipt lacks expected USDC Transfer log");
  const transferValue = BigInt(transferLog.data);
  add(`Transfer log: ${TEST_WALLET} -> ${PAY_TO} value=${transferValue} token=${transferLog.address}`);
  if (transferValue !== PRICE_RAW) throw new Error("transfer value mismatch");
  if (receipt.from.toLowerCase() === TEST_WALLET.toLowerCase())
    throw new Error("BUYER_GAS_MODEL_MISMATCH: buyer broadcast the settlement tx");

  // Stage 8: balances + buyer gas proof. The receipt is already confirmed;
  // poll (bounded) because load-balanced RPC replicas can lag the head.
  let buyerUsdc1, payToUsdc1, buyerEth1, buyerNonce1;
  const balanceDeadline = Date.now() + 90000;
  for (;;) {
    [buyerUsdc1, payToUsdc1, buyerEth1, buyerNonce1] = await Promise.all([
      usdcBalance(TEST_WALLET),
      usdcBalance(PAY_TO),
      ethBalance(TEST_WALLET),
      txCount(TEST_WALLET),
    ]);
    if (buyerUsdc0 - buyerUsdc1 === PRICE_RAW && payToUsdc1 - payToUsdc0 === PRICE_RAW) break;
    if (Date.now() > balanceDeadline) break;
    await new Promise((r) => setTimeout(r, 5000));
  }
  add(
    `post: buyerUSDC=${buyerUsdc1} (delta=${buyerUsdc1 - buyerUsdc0}) payToUSDC=${payToUsdc1} (delta=${payToUsdc1 - payToUsdc0}) buyerETH=${buyerEth1} (delta=${buyerEth1 - buyerEth0}) buyerNonce=${buyerNonce1}`
  );
  if (buyerUsdc0 - buyerUsdc1 !== PRICE_RAW) throw new Error("buyer USDC delta mismatch");
  if (payToUsdc1 - payToUsdc0 !== PRICE_RAW) throw new Error("merchant USDC delta mismatch");
  if (buyerEth1 !== buyerEth0)
    throw new Error("BUYER_GAS_MODEL_MISMATCH: buyer ETH balance changed");
  if (buyerNonce1 !== buyerNonce0)
    throw new Error("BUYER_GAS_MODEL_MISMATCH: buyer account nonce advanced");
  add("buyer gas proof: buyer paid ZERO ETH, nonce unchanged; facilitator broadcast settlement");

  // Stage 9: replay — reuse the SAME settled authorization
  const replay = await fetch(`${baseUrl}/v1/profile`, {
    method: "POST",
    headers: { "content-type": "application/json", ...paymentHeaders },
    body: JSON.stringify({ format: "json", records: [{ id: 1 }] }),
    signal: AbortSignal.timeout(120000),
  });
  add(`replay status=${replay.status}`);
  if (replay.status === 200) throw new Error("REPLAY_PROTECTION_FAILURE: replay returned 200");
  
  let buyerUsdcReplay, payToUsdcReplay;
  const replayDeadline = Date.now() + 60000;
  for (;;) {
    [buyerUsdcReplay, payToUsdcReplay] = await Promise.all([
      usdcBalance(TEST_WALLET),
      usdcBalance(PAY_TO),
    ]);
    if (buyerUsdcReplay === buyerUsdc1 && payToUsdcReplay === payToUsdc1) break;
    if (Date.now() > replayDeadline) break;
    await new Promise((r) => setTimeout(r, 5000));
  }
  const transfersToPayTo = await transferLogs(startBlockHex, PAY_TO);
  add(
    `replay evidence: buyerUSDC=${buyerUsdcReplay} payToUSDC=${payToUsdcReplay} buyer->payTo transfers since start=${transfersToPayTo.length}`
  );
  if (buyerUsdcReplay !== buyerUsdc1 || payToUsdcReplay !== payToUsdc1)
    throw new Error("REPLAY_PROTECTION_FAILURE: balances moved on replay");
  if (transfersToPayTo.length !== 1)
    throw new Error(`REPLAY_PROTECTION_FAILURE: expected 1 transfer, saw ${transfersToPayTo.length}`);
  updatePurchaseStage(networkKey, purchaseId, "REPLAY_REJECTED", { replayStatus: replay.status });

  // Stage 10: failed handler must not charge
  const failApp = Fastify({ logger: false });
  failApp.post("/v1/fail", async () => {
    throw new Error("deliberate handler failure");
  });
  const failResourceServer = new x402ResourceServer(
    new HTTPFacilitatorClient({ url: FACILITATOR_URL })
  );
  failResourceServer.register(BASE_SEPOLIA, new ExactEvmScheme());
  paymentMiddleware(
    failApp,
    {
      "POST /v1/fail": {
        accepts: { scheme: "exact", payTo: PAY_TO_FAIL, price: PRICE, network: BASE_SEPOLIA },
      },
    },
    failResourceServer,
    undefined,
    undefined,
    false
  );
  await failApp.listen({ port: 0, host: "127.0.0.1" });
  await failResourceServer.initialize();
  const failPort = failApp.server.address().port;

  const failUnpaid = await fetch(`http://127.0.0.1:${failPort}/v1/fail`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({}),
    signal: AbortSignal.timeout(30000),
  });
  if (failUnpaid.status !== 402) throw new Error(`fail route expected 402, got ${failUnpaid.status}`);
  const failQuote = decode402(failUnpaid).accepts?.[0];
  const failPolicy = validateQuoteAndBudget(failQuote, PAY_TO_FAIL, networkKey);
  if (!failPolicy.ok) throw new Error(`fail-route quote rejected: ${failPolicy.reason}`);
  let failUnpaidBody;
  try {
    failUnpaidBody = JSON.parse(await failUnpaid.text());
  } catch {}
  const failPR = httpClient.getPaymentRequiredResponse(
    (n) => failUnpaid.headers.get(n),
    failUnpaidBody
  );
  const failPayload = await client.createPaymentPayload(failPR);
  const failPurchaseId = `${purchaseId}-fail`;
  updatePurchaseStage(networkKey, failPurchaseId, "SIGNED", { nonce: failPayload.payload?.authorization?.nonce, amount: Number(PRICE_RAW) });
  const failHeaders = httpClient.encodePaymentSignatureHeader(failPayload);
  const failPaid = await fetch(`http://127.0.0.1:${failPort}/v1/fail`, {
    method: "POST",
    headers: { "content-type": "application/json", ...failHeaders },
    body: JSON.stringify({}),
    signal: AbortSignal.timeout(120000),
  });
  add(`failed-handler paid attempt status=${failPaid.status}`);
  if (failPaid.status < 400)
    throw new Error("SETTLEMENT_SEMANTICS_MISMATCH: failing handler returned success");
  await new Promise((r) => setTimeout(r, 10000));
  const [buyerUsdcAfterFail, failPayToUsdc1] = await Promise.all([
    usdcBalance(TEST_WALLET),
    usdcBalance(PAY_TO_FAIL),
  ]);
  const failTransfers = await transferLogs(startBlockHex, PAY_TO_FAIL);
  add(
    `failed-handler evidence: buyerUSDC=${buyerUsdcAfterFail} failPayToUSDC=${failPayToUsdc1} (delta=${failPayToUsdc1 - failPayToUsdc0}) buyer->failPayTo transfers=${failTransfers.length}`
  );
  if (buyerUsdcAfterFail !== buyerUsdc1 || failPayToUsdc1 !== failPayToUsdc0 || failTransfers.length !== 0)
    throw new Error("SETTLEMENT_SEMANTICS_MISMATCH: failed handler charged the buyer");
  updatePurchaseStage(networkKey, failPurchaseId, "FAILED", { status: failPaid.status });

  // Stage 11: ambiguous timeout + reconciliation
  const toUnpaid = await fetch(`${baseUrl}/v1/profile`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ format: "json", records: [{ id: 2 }] }),
    signal: AbortSignal.timeout(30000),
  });
  if (toUnpaid.status !== 402) throw new Error("timeout stage: expected 402");
  const toQuote = decode402(toUnpaid).accepts?.[0];
  const toPolicy = validateQuoteAndBudget(toQuote, PAY_TO, networkKey);
  if (!toPolicy.ok) throw new Error(`timeout stage quote rejected: ${toPolicy.reason}`);
  let toUnpaidBody;
  try {
    toUnpaidBody = JSON.parse(await toUnpaid.text());
  } catch {}
  const toPR = httpClient.getPaymentRequiredResponse((n) => toUnpaid.headers.get(n), toUnpaidBody);
  let timeoutSignatures = 0;
  const toPayload = await client.createPaymentPayload(toPR);
  timeoutSignatures += 1;
  const toNonce = toPayload.payload?.authorization?.nonce;
  const timeoutPurchaseId = `${purchaseId}-timeout`;
  updatePurchaseStage(networkKey, timeoutPurchaseId, "SIGNED", { nonce: toNonce, amount: Number(PRICE_RAW) });
  const toHeaders = httpClient.encodePaymentSignatureHeader(toPayload);
  const [toHeaderName, toHeaderValue] = Object.entries(toHeaders)[0];
  const buyerUsdcBeforeTimeout = await usdcBalance(TEST_WALLET);
  const payToUsdcBeforeTimeout = await usdcBalance(PAY_TO);
  await sendAndAbandon(
    appPort,
    "/v1/profile",
    toHeaderName,
    toHeaderValue,
    JSON.stringify({ format: "json", records: [{ id: 2 }] })
  );
  add("timeout stage: paid request sent, HTTP response deliberately abandoned");
  updatePurchaseStage(networkKey, timeoutPurchaseId, "AMBIGUOUS");

  let classification = "UNKNOWN";
  const validBeforeSec = Number(toPayload.payload?.authorization?.validBefore ?? 0);
  const reconcileDeadline = Math.max(
    Date.now() + 120000,
    validBeforeSec * 1000 + 60000
  );
  while (Date.now() < reconcileDeadline) {
    const [b, p] = await Promise.all([usdcBalance(TEST_WALLET), usdcBalance(PAY_TO)]);
    if (
      buyerUsdcBeforeTimeout - b === PRICE_RAW &&
      p - payToUsdcBeforeTimeout === PRICE_RAW
    ) {
      classification = "SETTLED";
      break;
    }
    if (validBeforeSec && Date.now() / 1000 > validBeforeSec + 30) {
      classification = "FAILED";
      break;
    }
    await new Promise((r) => setTimeout(r, 6000));
  }
  add(
    `timeout reconciliation: classification=${classification} signaturesCreatedForStage=${timeoutSignatures}`
  );
  if (timeoutSignatures !== 1) throw new Error("timeout stage created a duplicate signature");
  updatePurchaseStage(networkKey, timeoutPurchaseId, classification);

  // Stage 12: policy rejection suite
  const mutations = [
    ["wrong chain", { ...quote, network: "eip155:8453" }, PAY_TO],
    ["wrong token", { ...quote, asset: "0x" + "11".repeat(20) }, PAY_TO],
    ["wrong payTo", { ...quote, payTo: "0x" + "22".repeat(20) }, PAY_TO],
    ["amount above cap", { ...quote, amount: "2000000" }, PAY_TO],
    ["altered quote (amount tampered)", { ...quote, amount: "200001" }, PAY_TO],
    ["stale quote (no validity window)", { ...quote, maxTimeoutSeconds: 0 }, PAY_TO],
    ["excessive validity window", { ...quote, maxTimeoutSeconds: 999999 }, PAY_TO],
    ["unsupported scheme", { ...quote, scheme: "upto" }, PAY_TO],
    ["subscription flag", { ...quote, extra: { ...quote.extra, subscription: true } }, PAY_TO],
    ["recurring flag", { ...quote, extra: { ...quote.extra, recurring: true } }, PAY_TO],
    ["approval flag", { ...quote, extra: { ...quote.extra, approval: true } }, PAY_TO],
    ["missing quote", null, PAY_TO],
  ];
  let rejections = 0;
  for (const [name, mutated, expectedPayTo] of mutations) {
    const verdict = validateQuoteAndBudget(mutated, expectedPayTo, networkKey);
    add(`policy-reject [${name}]: ${verdict.ok ? "SIGNED (BUG)" : `REJECTED (${verdict.reason})`}`);
    if (!verdict.ok) rejections += 1;
  }
  // cumulative budget limit test
  const budgetNetworkKey = networkKey;
  const budgetForTest = ledgerData;

  // Recompute canonical totals in-place (pure function, no persistence here).
  Object.assign(budgetForTest, recalculateBudget(budgetForTest, SIGNER_NETWORK));

  const savedBudgetTestPurchase =
    budgetForTest.purchases["__budget-test__"];

  const amountToExhaust =
    Math.max(0, budgetForTest.remainingBudget);

  budgetForTest.purchases["__budget-test__"] = {
    purchaseId: "__budget-test__",
    stage: "SETTLED",
    amount: amountToExhaust,
    payTo: PAY_TO,
    updatedAt: new Date().toISOString(),
  };

  const budgetVerdict =
    validateQuoteAndBudget(
      { ...quote },
      PAY_TO,
      budgetNetworkKey
    );

  if (savedBudgetTestPurchase) {
    budgetForTest.purchases["__budget-test__"] =
      savedBudgetTestPurchase;
  } else {
    delete budgetForTest.purchases["__budget-test__"];
  }

  Object.assign(budgetForTest, recalculateBudget(budgetForTest, SIGNER_NETWORK));
  add(
    `policy-reject [cumulative budget exceeded]: ${budgetVerdict.ok ? "SIGNED (BUG)" : `REJECTED (${budgetVerdict.reason})`}`
  );
  if (!budgetVerdict.ok) rejections += 1;
  if (rejections !== mutations.length + 1)
    throw new Error(`policy suite: expected ${mutations.length + 1} rejections, got ${rejections}`);

  await app.close();
  await failApp.close();

  const T_END = Date.now();
  add("END x402 LIVE validation — all stages passed");

  // Format Latency metrics as specified
  const metrics = {
    T0_quote_available: T_QUOTE_RESP,
    T1_workflow_dispatch: process.env.WORKFLOW_DISPATCH_TIME ? Number(process.env.WORKFLOW_DISPATCH_TIME) : T_START,
    T2_runner_starts: T_START,
    T3_quote_validated: T_POLICY_VAL,
    T4_signature_generated: T_SIGN_END,
    T5_paid_retry_sent: T_PAID_START,
    T6_http_success: T_PAID_END,
    T7_settlement_confirmed: T_SETTLE_CONFIRMED,
    total_elapsed_ms: T_END - T_START
  };

  console.log("LATENCY_METRICS", JSON.stringify(metrics, null, 2));

  return { classification, metrics };
}

run()
  .then(({ classification, metrics }) => {
    // Write evidence log and ledger as requested
    const dir = path.join(
      path.dirname(fileURLToPath(import.meta.url)),
      "../../../../research/raw/x402-live"
    );
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(
      dir,
      `${new Date().toISOString().replace(/[:.]/g, "-")}-github-actions-signer-run.json`
    );
    fs.writeFileSync(file, JSON.stringify({ status: "SUCCESS", classification, log, ledger: ledgerData, metrics }, null, 2));
    console.log(`evidence written to ${file}`);
    process.exit(0);
  })
  .catch((e) => {
    console.error("VALIDATION_ERROR", e);
    process.exit(1);
  });
