import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { privateKeyToAccount } from "viem/accounts";
import { x402Client, x402HTTPClient } from "@x402/core/client";
import { registerExactEvmScheme } from "@x402/evm/exact/client";
import {
  AGENT402_ORIGIN,
  BASE_MAINNET,
  BASE_USDC,
  buildEndpointUrl,
  validateAgent402Quote,
  classifyPostSendSettlement,
} from "../src/payments/agent402-buyer-policy.mjs";
import {
  loadLedger,
  NETWORK_MAINNET,
  LedgerError,
  MAINNET_WALLET,
} from "../src/payments/ledger.mjs";
import { openFinancialStore } from "../src/payments/financial-store.mjs";

const MODE = process.env.MODE === "execute" ? "execute" : "dry-run";
const ENDPOINT_ID = String(process.env.ENDPOINT_ID ?? "");
const PURCHASE_ID = String(process.env.PURCHASE_ID ?? "");
const USER_AGENT = "hermes-commerce-control/1.0";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const LEDGER_PATH = path.join(ROOT, "state/commerce-control/ledgers/mainnet-budget-ledger.json");
const FINANCIAL_DB_PATH = process.env.HERMES_FINANCIAL_DB_PATH ??
  path.join(ROOT, "state/commerce-control/financial/mainnet-budget.sqlite");
const RESULT_DIR = path.join(ROOT, "state/commerce-control/private-results");
const BASE_RPC_URL = process.env.BASE_RPC_URL ?? "https://mainnet.base.org";

// Public Actions may quote/dry-run only. Refuse execute before reading a secret.
if (process.env.GITHUB_ACTIONS === "true" && MODE === "execute") {
  console.error("PUBLIC_ACTIONS_PURCHASE_DISABLED: production purchases are refused in GitHub Actions; run the buyer locally instead.");
  process.exit(1);
}

if (!/^[A-Za-z0-9._:-]{1,80}$/.test(PURCHASE_ID)) throw new Error("invalid purchaseId");
const TARGET_URL = buildEndpointUrl(ENDPOINT_ID);

function loadLegacyMainnetBudgetReadOnly() {
  try {
    return loadLedger(LEDGER_PATH, NETWORK_MAINNET, {
      allowCreate: false,
      expectedWallet: MAINNET_WALLET,
    }).ledger;
  } catch (error) {
    if (error instanceof LedgerError) {
      throw new Error(`MAINNET_LEDGER_FATAL: ${error.message} (code=${error.code})`);
    }
    throw error;
  }
}

function decodePaymentRequired(response) {
  const header = response.headers.get("payment-required");
  if (!header) throw new Error("missing PAYMENT-REQUIRED header");
  return JSON.parse(Buffer.from(header, "base64").toString("utf8"));
}

function assertResourceBound(paymentRequired) {
  const raw = paymentRequired?.resource?.url ?? paymentRequired?.resource;
  if (typeof raw !== "string" || !raw) return;
  const expected = new URL(TARGET_URL);
  const actual = new URL(raw);
  if (actual.origin !== AGENT402_ORIGIN || actual.pathname !== expected.pathname) {
    throw new Error(`payment resource escaped allowlist: ${actual.origin}${actual.pathname}`);
  }
}

async function rpcCall(method, params) {
  const response = await fetch(BASE_RPC_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw new Error(`Base RPC ${method} HTTP ${response.status}`);
  const body = await response.json();
  if (body?.error) throw new Error(`Base RPC ${method}: ${JSON.stringify(body.error)}`);
  return body?.result;
}

function transition(store, purchaseId, stage, patch = {}, options = {}) {
  const current = store.getPurchase(purchaseId);
  if (!current) throw new Error(`authoritative purchase ${purchaseId} disappeared`);
  return store.transitionPurchase(purchaseId, stage, patch, {
    expectedRevision: current.revision,
    source: options.source ?? "agent402-production-buyer",
    allowRecovery: options.allowRecovery ?? false,
  });
}

function markAmbiguousBestEffort(store, purchaseId, patch) {
  try {
    return transition(store, purchaseId, "AMBIGUOUS", patch);
  } catch (persistError) {
    // The durable SIGNED record remains reserved. Never retry/sign again here;
    // the reconciler can recover from the recorded authorization and anchor.
    console.error(
      `FINANCIAL_PERSISTENCE_AFTER_PAYMENT_FAILED purchase=${purchaseId} ` +
      `code=${persistError?.code ?? "ERROR"} ${persistError?.message ?? String(persistError)}`
    );
    return null;
  }
}

async function run() {
  let store = null;
  try {
    // Dry-run is intentionally read-only and may run in ephemeral public CI.
    // Execute mode requires the durable local DB to have been explicitly
    // initialized with financial-store-admin.mjs init-mainnet.
    const budget = MODE === "execute"
      ? (() => {
          store = openFinancialStore(FINANCIAL_DB_PATH, NETWORK_MAINNET, { expectedWallet: MAINNET_WALLET });
          return store.snapshot();
        })()
      : loadLegacyMainnetBudgetReadOnly();

    if (budget.purchases[PURCHASE_ID]) throw new Error(`duplicate purchaseId: ${PURCHASE_ID}`);

    const headers = {
      "User-Agent": USER_AGENT,
      "Idempotency-Key": PURCHASE_ID,
      Accept: "application/json",
    };

    const quoteStarted = Date.now();
    const unpaid = await fetch(TARGET_URL, {
      method: "GET",
      headers,
      redirect: "error",
      signal: AbortSignal.timeout(30_000),
    });
    if (unpaid.status !== 402) {
      throw new Error(`expected HTTP 402 from allowlisted Agent402 endpoint, got ${unpaid.status}`);
    }
    const unpaidBodyText = await unpaid.text();
    const decoded = decodePaymentRequired(unpaid);
    assertResourceBound(decoded);

    const quote = (decoded.accepts ?? []).find((q) =>
      q?.scheme === "exact" &&
      q?.network === BASE_MAINNET &&
      String(q?.asset ?? "").toLowerCase() === BASE_USDC.toLowerCase()
    );
    const verdict = validateAgent402Quote(quote, ENDPOINT_ID, budget.remainingBudget);
    if (!verdict.ok) throw new Error(`quote rejected: ${verdict.reason}`);

    console.log(
      `QUOTE_OK endpoint=${ENDPOINT_ID} amountRaw=${verdict.amountRaw} ` +
      `payTo=${verdict.payTo} remainingRaw=${budget.remainingBudget} ` +
      `quoteMs=${Date.now() - quoteStarted}`
    );
    if (MODE === "dry-run") {
      console.log("DRY_RUN_OK no signature created; no funds moved");
      return;
    }

    const PRIVATE_KEY = process.env.HERMES_COMMERCE_SPEND_PRIVATE_KEY ?? "";
    if (!PRIVATE_KEY) throw new Error("HERMES_COMMERCE_SPEND_PRIVATE_KEY is not set");
    const account = privateKeyToAccount(
      PRIVATE_KEY.startsWith("0x") ? PRIVATE_KEY : `0x${PRIVATE_KEY}`
    );
    if (store.meta().wallet.toLowerCase() !== account.address.toLowerCase()) {
      throw new Error("MAINNET_EXECUTION_WALLET_MISMATCH: production signer address does not match authoritative store wallet");
    }

    // A chain anchor is required BEFORE signing/sending. If persistence after
    // payment fails, reconciliation can scan from this block without guessing.
    const reconcileFromBlock = await rpcCall("eth_blockNumber", []);
    if (!/^0x[0-9a-f]+$/i.test(String(reconcileFromBlock ?? ""))) {
      throw new Error("Base RPC did not provide a valid reconciliation anchor block");
    }

    store.reservePurchase({
      purchaseId: PURCHASE_ID,
      endpointId: ENDPOINT_ID,
      amount: Number(verdict.amountRaw),
      payTo: verdict.payTo,
      resource: TARGET_URL,
      idempotencyKey: PURCHASE_ID,
      assetContract: quote.asset,
      paymentRequirements: quote,
      reconcileFromBlock,
    }, { source: "agent402-production-buyer" });

    let unpaidBody;
    try { unpaidBody = unpaidBodyText ? JSON.parse(unpaidBodyText) : undefined; } catch {}
    const client = new x402Client();
    registerExactEvmScheme(client, { signer: account });
    const httpClient = new x402HTTPClient(client);
    const parsedRequired = httpClient.getPaymentRequiredResponse(
      (name) => unpaid.headers.get(name),
      unpaidBody
    );
    const boundedRequired = { ...parsedRequired, accepts: [quote] };

    const signStarted = Date.now();
    const payload = await client.createPaymentPayload(boundedRequired);
    const auth = payload?.payload?.authorization ?? {};
    if (String(auth.to ?? "").toLowerCase() !== String(verdict.payTo).toLowerCase()) {
      throw new Error("authorization recipient mismatch");
    }
    if (BigInt(auth.value ?? "0") !== verdict.amountRaw) {
      throw new Error("authorization value mismatch");
    }

    transition(store, PURCHASE_ID, "SIGNED", {
      nonce: auth.nonce,
      validBefore: auth.validBefore,
      paymentPayload: payload,
      paymentRequirements: quote,
    });
    console.log(`SIGN_OK wallet=${account.address} signMs=${Date.now() - signStarted}`);

    const paymentHeaders = httpClient.encodePaymentSignatureHeader(payload);
    let paid;
    try {
      paid = await fetch(TARGET_URL, {
        method: "GET",
        headers: { ...headers, ...paymentHeaders },
        redirect: "error",
        signal: AbortSignal.timeout(120_000),
      });
    } catch (error) {
      // Transport outcome after sending a signed authorization is ambiguous: the
      // signed intent has been transmitted but we cannot confirm the result. Keep
      // the SIGNED record reserved; never sign again or auto-retry here.
      const classification = classifyPostSendSettlement({ originalTransaction: null });
      markAmbiguousBestEffort(store, PURCHASE_ID, {
        errorClass: error?.name ?? "fetch-error",
        errorMessage: String(error?.message ?? "").slice(0, 500),
        transaction: classification.transaction,
      });
      throw new Error(`paid request transport outcome ambiguous: ${error?.name ?? "fetch-error"}`);
    }

    const paidText = await paid.text();
    const settleHeader = paid.headers.get("payment-response") ?? paid.headers.get("x-payment-response");
    let settle = null;
    if (settleHeader) {
      try { settle = JSON.parse(Buffer.from(settleHeader, "base64").toString("utf8")); } catch {}
    }

    // Once the signed authorization has been transmitted, only a positive
    // confirmed settlement response may advance SIGNED -> SETTLED. Every
    // non-positive result (HTTP non-success, missing/malformed settlement
    // header, settle.success === false, missing transaction hash, transport
    // ambiguity) remains AMBIGUOUS and keeps the budget reserved. The reconciler
    // is the only path that may later release the reservation to FAILED.
    const classification = classifyPostSendSettlement({
      httpOk: paid.ok,
      settle,
      originalTransaction: null,
    });
    if (!classification.settled) {
      try {
        transition(store, PURCHASE_ID, classification.stage, { httpStatus: paid.status, transaction: classification.transaction });
      } catch (persistError) {
        console.error(
          `FINANCIAL_PERSISTENCE_AFTER_PAYMENT_FAILED purchase=${PURCHASE_ID} ` +
          `code=${persistError?.code ?? "ERROR"} ${persistError?.message ?? String(persistError)}`
        );
      }
      throw new Error(`paid request did not produce a confirmed settlement (HTTP ${paid.status})`);
    }

    let body;
    try { body = paidText ? JSON.parse(paidText) : null; }
    catch { body = { raw: paidText.slice(0, 100_000) }; }

    // Positive settlement response is persisted before the private result. If
    // this write fails, SIGNED remains reserved and chain reconciliation must
    // recover it; no duplicate signature is created.
    try {
      transition(store, PURCHASE_ID, "SETTLED", {
        transaction: classification.transaction,
        httpStatus: paid.status,
      });
    } catch (persistError) {
      console.error(
        `FINANCIAL_PERSISTENCE_AFTER_PAYMENT_FAILED purchase=${PURCHASE_ID} ` +
        `settlementTx=${classification.transaction} code=${persistError?.code ?? "ERROR"} ` +
        `${persistError?.message ?? String(persistError)}`
      );
      throw new Error("payment settled but authoritative persistence failed; reconciliation required before any retry");
    }

    fs.mkdirSync(RESULT_DIR, { recursive: true });
    const resultPath = path.join(RESULT_DIR, `${PURCHASE_ID}.json`);
    fs.writeFileSync(resultPath, `${JSON.stringify({
      purchaseId: PURCHASE_ID,
      endpointId: ENDPOINT_ID,
      wallet: account.address,
      amountRaw: Number(verdict.amountRaw),
      payTo: verdict.payTo,
      transaction: settle.transaction,
      settledAt: new Date().toISOString(),
      result: body,
    }, null, 2)}\n`, "utf8");

    console.log(`PURCHASE_SETTLED endpoint=${ENDPOINT_ID} amountRaw=${verdict.amountRaw} tx=${settle.transaction}`);
    console.log(`PRIVATE_RESULT_PATH=${resultPath}`);
  } finally {
    store?.close();
  }
}

run().catch((error) => {
  console.error(`BUYER_ERROR ${error?.message ?? String(error)}`);
  process.exit(1);
});
