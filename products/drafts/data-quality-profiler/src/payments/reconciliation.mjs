// P1 Batch 3 — external payment reconciliation.
//
// The durable store deliberately records PREPARED/SIGNED state before the paid
// request. If the process dies, the HTTP response is lost, or persistence after
// a successful payment fails, reconciliation uses chain evidence (authoritative)
// and facilitator verification (advisory) to resolve the reservation without
// creating another signature.

import { FinancialStoreError } from "./financial-store.mjs";

const TRANSFER_TOPIC =
  "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

export const BASE_USDC_BY_NETWORK = Object.freeze({
  "eip155:8453": "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
  "eip155:84532": "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
});

function padAddress(address) {
  const raw = String(address ?? "").replace(/^0x/i, "").toLowerCase();
  if (!/^[0-9a-f]{40}$/.test(raw)) {
    throw new FinancialStoreError(`invalid EVM address ${address}`, "RECONCILIATION_INPUT_INVALID");
  }
  return raw.padStart(64, "0");
}

function normalizeHex(value) {
  return String(value ?? "").toLowerCase();
}

function transferMatches(log, { assetAddress, from, to, amount }) {
  if (!log || normalizeHex(log.address) !== normalizeHex(assetAddress)) return false;
  const topics = log.topics ?? [];
  if (normalizeHex(topics[0]) !== TRANSFER_TOPIC) return false;
  if (normalizeHex(topics[1]) !== `0x${padAddress(from)}`) return false;
  if (normalizeHex(topics[2]) !== `0x${padAddress(to)}`) return false;
  try {
    return BigInt(log.data ?? "0x0") === BigInt(amount);
  } catch {
    return false;
  }
}

async function rpcCall(rpcUrl, method, params, fetchImpl) {
  const response = await fetchImpl(rpcUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) {
    throw new Error(`RPC ${method} HTTP ${response.status}`);
  }
  const body = await response.json();
  if (body?.error) throw new Error(`RPC ${method}: ${JSON.stringify(body.error)}`);
  return body?.result;
}

function expectedTransferContext(purchase, meta, assetAddress) {
  const resolvedAsset = assetAddress ?? purchase.assetContract ?? BASE_USDC_BY_NETWORK[meta.network];
  if (!resolvedAsset || !purchase.payTo || !meta.wallet || !Number.isSafeInteger(Number(purchase.amount))) {
    return null;
  }
  return {
    assetAddress: resolvedAsset,
    from: meta.wallet,
    to: purchase.payTo,
    amount: Number(purchase.amount),
  };
}

export async function collectChainEvidence(
  purchase,
  meta,
  { rpcUrl, assetAddress = null, fetchImpl = fetch } = {}
) {
  if (!rpcUrl) return { status: "UNAVAILABLE", complete: false, reason: "rpcUrl not configured" };
  const transfer = expectedTransferContext(purchase, meta, assetAddress);
  if (!transfer) {
    return { status: "UNAVAILABLE", complete: false, reason: "missing transfer identity" };
  }

  try {
    if (purchase.transaction) {
      const receipt = await rpcCall(rpcUrl, "eth_getTransactionReceipt", [purchase.transaction], fetchImpl);
      if (!receipt) return { status: "PENDING", complete: false, transaction: purchase.transaction };
      if (receipt.status === "0x0" || receipt.status === 0) {
        return { status: "REVERTED", complete: true, transaction: purchase.transaction };
      }
      const matches = (receipt.logs ?? []).filter((log) => transferMatches(log, transfer));
      if (matches.length === 1) {
        return {
          status: "SETTLED",
          complete: true,
          transaction: purchase.transaction,
          blockNumber: receipt.blockNumber ?? null,
        };
      }
      if (matches.length > 1) {
        return {
          status: "AMBIGUOUS_MULTIPLE_MATCHES",
          complete: true,
          transaction: purchase.transaction,
          matchCount: matches.length,
        };
      }
      return {
        status: "RECEIPT_SUCCESS_UNVERIFIED",
        complete: true,
        transaction: purchase.transaction,
        reason: "receipt succeeded but exact USDC Transfer log was absent",
      };
    }

    if (!purchase.reconcileFromBlock) {
      return { status: "UNAVAILABLE", complete: false, reason: "reconcileFromBlock not recorded" };
    }

    const [logs, latestBlock] = await Promise.all([
      rpcCall(rpcUrl, "eth_getLogs", [{
        address: transfer.assetAddress,
        fromBlock: purchase.reconcileFromBlock,
        toBlock: "latest",
        topics: [
          TRANSFER_TOPIC,
          `0x${padAddress(transfer.from)}`,
          `0x${padAddress(transfer.to)}`,
        ],
      }], fetchImpl),
      rpcCall(rpcUrl, "eth_blockNumber", [], fetchImpl),
    ]);

    const matches = (logs ?? []).filter((log) => transferMatches(log, transfer));
    if (matches.length === 1) {
      return {
        status: "SETTLED",
        complete: true,
        transaction: matches[0].transactionHash ?? null,
        blockNumber: matches[0].blockNumber ?? null,
        latestBlock,
      };
    }
    if (matches.length > 1) {
      return {
        status: "AMBIGUOUS_MULTIPLE_MATCHES",
        complete: true,
        matchCount: matches.length,
        latestBlock,
      };
    }
    return { status: "NO_MATCH", complete: true, matchCount: 0, latestBlock };
  } catch (error) {
    return {
      status: "ERROR",
      complete: false,
      reason: error?.message ?? String(error),
    };
  }
}

export async function collectFacilitatorEvidence(
  purchase,
  { facilitatorUrl = null, fetchImpl = fetch } = {}
) {
  const url = facilitatorUrl ?? purchase.facilitatorUrl ?? null;
  const paymentPayload = purchase.paymentPayload ?? null;
  const paymentRequirements = purchase.paymentRequirements ?? null;
  if (!url || !paymentPayload || !paymentRequirements) {
    return { status: "UNAVAILABLE", complete: false };
  }

  try {
    const response = await fetchImpl(`${String(url).replace(/\/$/, "")}/verify`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        x402Version: Number(paymentPayload.x402Version ?? 2),
        paymentPayload,
        paymentRequirements,
      }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) {
      return { status: "ERROR", complete: false, reason: `HTTP ${response.status}` };
    }
    const body = await response.json();
    if (body?.isValid === true) {
      return { status: "VALID", complete: true, payer: body.payer ?? null };
    }
    if (body?.isValid === false) {
      return {
        status: "INVALID",
        complete: true,
        payer: body.payer ?? null,
        invalidReason: body.invalidReason ?? "unknown",
      };
    }
    return { status: "ERROR", complete: false, reason: "malformed facilitator verify response" };
  } catch (error) {
    return { status: "ERROR", complete: false, reason: error?.message ?? String(error) };
  }
}

export function decideReconciliation(
  purchase,
  evidence,
  { nowMs = Date.now(), authorizationGraceMs = 30_000 } = {}
) {
  const chain = evidence?.chain ?? { status: "UNAVAILABLE", complete: false };
  const facilitator = evidence?.facilitator ?? { status: "UNAVAILABLE", complete: false };

  if (chain.status === "SETTLED") {
    return {
      action: "SETTLED",
      reason: "CHAIN_TRANSFER_CONFIRMED",
      transaction: chain.transaction ?? purchase.transaction ?? null,
    };
  }
  if (chain.status === "REVERTED") {
    return { action: "FAILED", reason: "CHAIN_TRANSACTION_REVERTED" };
  }

  if (purchase.stage === "PREPARED") {
    const expiry = Number(purchase.reservationExpiresAt ?? 0);
    const unsigned = !purchase.nonce && !purchase.paymentPayload && !purchase.transaction;
    if (unsigned && expiry > 0 && nowMs >= expiry) {
      return { action: "FAILED", reason: "STALE_UNSIGNED_PREPARED_RELEASED" };
    }
  }

  if (purchase.stage === "SIGNED" || purchase.stage === "AMBIGUOUS") {
    const validBeforeSec = Number(purchase.validBefore ?? 0);
    const authorizationExpired =
      Number.isFinite(validBeforeSec) && validBeforeSec > 0 &&
      nowMs >= validBeforeSec * 1000 + authorizationGraceMs;

    if (
      authorizationExpired &&
      chain.complete === true &&
      chain.status === "NO_MATCH" &&
      facilitator.status !== "VALID"
    ) {
      return { action: "FAILED", reason: "AUTH_EXPIRED_NO_CHAIN_TRANSFER" };
    }
  }

  return {
    action: "HOLD",
    reason: chain.status === "AMBIGUOUS_MULTIPLE_MATCHES"
      ? "MULTIPLE_CHAIN_MATCHES_REQUIRE_OPERATOR_REVIEW"
      : facilitator.status === "VALID"
        ? "AUTHORIZATION_STILL_VALID"
        : "INSUFFICIENT_AUTHORITATIVE_EVIDENCE",
  };
}

export async function reconcilePurchase(store, purchaseId, options = {}) {
  const purchase = store.getPurchase(purchaseId);
  if (!purchase) throw new FinancialStoreError(`unknown purchase ${purchaseId}`, "PURCHASE_NOT_FOUND");
  const meta = store.meta();

  const chain = options.chainEvidence ?? await collectChainEvidence(purchase, meta, options);
  const facilitator = options.facilitatorEvidence ?? await collectFacilitatorEvidence(purchase, options);
  const evidence = { chain, facilitator };
  const decision = decideReconciliation(purchase, evidence, options);

  if (decision.action === "HOLD") {
    store.recordEvent(purchaseId, "RECONCILIATION_HOLD", { decision, evidence }, { source: "reconciler" });
    return { purchase, decision, evidence, changed: false };
  }

  const patch = {
    reconciliationReason: decision.reason,
    reconciliationCheckedAt: new Date(options.nowMs ?? Date.now()).toISOString(),
  };
  if (decision.transaction) patch.transaction = decision.transaction;
  const updated = store.transitionPurchase(
    purchaseId,
    decision.action,
    patch,
    {
      expectedRevision: purchase.revision,
      source: "reconciler",
      allowRecovery: decision.action === "SETTLED",
      nowMs: options.nowMs ?? Date.now(),
    }
  );
  store.recordEvent(purchaseId, "RECONCILIATION_DECISION", { decision, evidence }, { source: "reconciler" });
  return { purchase: updated, decision, evidence, changed: true };
}

export async function reconcileUnresolvedPurchases(store, options = {}) {
  const results = [];
  for (const purchase of store.listUnresolvedPurchases()) {
    results.push(await reconcilePurchase(store, purchase.purchaseId, options));
  }
  return results;
}
