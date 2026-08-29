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

// EIP-3009 AuthorizationUsed event. Topic0 is constant; authorizer and nonce are
// the two indexed topics. This is the authoritative proof that a specific
// signed authorization was consumed on-chain — not a bare USDC Transfer.
export const AUTHORIZATION_USED_TOPIC =
  "0x98de503528ee59b575ef0c0a2576a82497bfc029a5685b209e9ec333479b10a5";

// RPC chain id that must be reported for each network before any chain result is
// trusted. Reconciliation fails closed when the RPC answers with another chain,
// a malformed id, or cannot answer at all.
export const EXPECTED_RPC_CHAIN_ID_BY_NETWORK = Object.freeze({
  "eip155:8453": "0x2105",
  "eip155:84532": "0x14a34",
});

function padAddress(address) {
  const raw = String(address ?? "").replace(/^0x/i, "").toLowerCase();
  if (!/^[0-9a-f]{40}$/.test(raw)) {
    throw new FinancialStoreError(`invalid EVM address ${address}`, "RECONCILIATION_INPUT_INVALID");
  }
  return raw.padStart(64, "0");
}

// EIP-3009 nonces are 32-byte (bytes32) values. For the authoritative
// reconciliation identity we require the exact canonical 32-byte form: an
// optional 0x prefix followed by exactly 64 hex characters. Shorter/longer or
// non-hex values are not valid bytes32 and must never be treated as identity.
function isValidBytes32Nonce(nonce) {
  const raw = String(nonce ?? "").replace(/^0x/i, "").toLowerCase();
  return /^[0-9a-f]{64}$/.test(raw);
}

function padNonce(nonce) {
  const raw = String(nonce ?? "").replace(/^0x/i, "").toLowerCase();
  if (!isValidBytes32Nonce(raw)) {
    throw new FinancialStoreError(`invalid authorization nonce ${nonce} (expected 32-byte bytes32)`, "RECONCILIATION_INPUT_INVALID");
  }
  return raw;
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

async function rpcChainId(rpcUrl, fetchImpl) {
  let raw;
  try {
    raw = await rpcCall(rpcUrl, "eth_chainId", [], fetchImpl);
  } catch (error) {
    return { status: "ERROR", reason: error?.message ?? String(error) };
  }
  if (typeof raw !== "string" || !/^0x[0-9a-f]*$/i.test(raw)) {
    return { status: "MALFORMED", chainId: raw };
  }
  return { status: "OK", chainId: String(raw).toLowerCase() };
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

// EIP-3009 AuthorizationUsed(authorizer indexed, nonce indexed). Confirm the
// exact authorization was consumed AND that the event was emitted by the
// expected USDC contract. The nonce proof is incomplete without the contract
// binding: an AuthorizationUsed event from any other address must not count.
function authorizationUsedMatches(log, { wallet, nonce, assetAddress }) {
  if (!log) return false;
  if (!assetAddress) return false;
  if (normalizeHex(log.address) !== normalizeHex(assetAddress)) return false;
  const topics = log.topics ?? [];
  if (normalizeHex(topics[0]) !== AUTHORIZATION_USED_TOPIC) return false;
  if (normalizeHex(topics[1]) !== `0x${padAddress(wallet)}`) return false;
  if (normalizeHex(topics[2]) !== `0x${padNonce(nonce)}`) return false;
  return true;
}

// A nonce-bound transfer scan only settles when the SAME transaction emits both
// the AuthorizationUsed(authorizer, nonce) event AND the exact USDC Transfer.
function findNonceBoundSettlementInReceipt(receipt, transfer, { wallet, nonce, assetAddress }) {
  const logs = receipt?.logs ?? [];
  const authLog = logs.find((log) => authorizationUsedMatches(log, { wallet, nonce, assetAddress }));
  if (!authLog) return null;
  const txHash = authLog.transactionHash ?? receipt?.transactionHash ?? null;
  if (!txHash) return null;
  const transferLogs = logs.filter((log) => transferMatches(log, transfer));
  const sameTxTransfer = transferLogs.find((log) => normalizeHex(log.transactionHash) === normalizeHex(txHash));
  if (!sameTxTransfer) return null;
  return { authLog, transferLog: sameTxTransfer, transaction: txHash };
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

  const expectedChainId = EXPECTED_RPC_CHAIN_ID_BY_NETWORK[meta.network];
  if (!expectedChainId) {
    return { status: "UNAVAILABLE", complete: false, reason: `unsupported network ${meta.network}` };
  }

  // Reconciliation must verify the RPC chain id BEFORE trusting any result. A
  // wrong/malformed/unreachable chain id fails closed: we never produce
  // SETTLED/NO_MATCH/REVERTED from a chain we cannot positively bind.
  const chainId = await rpcChainId(rpcUrl, fetchImpl);
  if (chainId.status !== "OK" || chainId.chainId !== expectedChainId) {
    return {
      status: "WRONG_CHAIN",
      complete: false,
      expectedChainId,
      actualChainId: chainId.chainId ?? null,
      reason: chainId.status === "OK"
        ? `RPC chain id ${chainId.chainId} != expected ${expectedChainId}`
        : `RPC chain id ${chainId.status} (${chainId.reason ?? ""})`,
    };
  }

  try {
    // When the authorization has been transmitted we already know the nonce that
    // EIP-3009 bound to this purchase. The authoritative identity is the nonce,
    // not (wallet, payTo, amount), which can collide across purchases.
    const hasNonce = Boolean(purchase.nonce);

    if (purchase.transaction) {
      const receipt = await rpcCall(rpcUrl, "eth_getTransactionReceipt", [purchase.transaction], fetchImpl);
      if (!receipt) return { status: "PENDING", complete: false, transaction: purchase.transaction, chainId: expectedChainId };
      if (receipt.status === "0x0" || receipt.status === 0) {
        return { status: "REVERTED", complete: true, transaction: purchase.transaction, chainId: expectedChainId };
      }
      if (hasNonce) {
        const bound = findNonceBoundSettlementInReceipt(receipt, transfer, { wallet: transfer.from, nonce: purchase.nonce, assetAddress: transfer.assetAddress });
        if (bound) {
          return { status: "SETTLED", complete: true, transaction: bound.transaction, blockNumber: receipt.blockNumber ?? null, chainId: expectedChainId };
        }
      } else {
        // No stored nonce: legacy/historical record. Fall back to exact USDC
        // Transfer verification (the new strict nonce binding only applies to
        // records that carry a nonce; historical records are not rewritten for
        // this batch).
        const matches = (receipt.logs ?? []).filter((log) => transferMatches(log, transfer));
        if (matches.length === 1) {
          return { status: "SETTLED", complete: true, transaction: purchase.transaction, blockNumber: receipt.blockNumber ?? null, chainId: expectedChainId };
        }
        return {
          status: "RECEIPT_SUCCESS_UNVERIFIED",
          complete: true,
          transaction: purchase.transaction,
          hasNonce: false,
          reason: "receipt succeeded but exact USDC Transfer log was absent",
          chainId: expectedChainId,
        };
      }
      return {
        status: "RECEIPT_SUCCESS_UNVERIFIED",
        complete: true,
        transaction: purchase.transaction,
        hasNonce,
        reason: hasNonce
          ? "receipt succeeded but no matching AuthorizationUsed(nonce) + exact USDC Transfer in the same transaction"
          : "receipt succeeded but exact USDC Transfer log was absent",
        chainId: expectedChainId,
      };
    }

    if (!purchase.reconcileFromBlock) {
      return { status: "UNAVAILABLE", complete: false, reason: "reconcileFromBlock not recorded" };
    }

    // Transaction-less scan: identify the payment by its EIP-3009 nonce, not by
    // an ambiguous Transfer with the same amount/payee.
    if (hasNonce) {
      const [authLogs, latestBlock] = await Promise.all([
        rpcCall(rpcUrl, "eth_getLogs", [{
          address: BASE_USDC_BY_NETWORK[meta.network],
          fromBlock: purchase.reconcileFromBlock,
          toBlock: "latest",
          topics: [
            AUTHORIZATION_USED_TOPIC,
            `0x${padAddress(transfer.from)}`,
            `0x${padNonce(purchase.nonce)}`,
          ],
        }], fetchImpl),
        rpcCall(rpcUrl, "eth_blockNumber", [], fetchImpl),
      ]);

      const matching = (authLogs ?? []).filter((log) => authorizationUsedMatches(log, { wallet: transfer.from, nonce: purchase.nonce, assetAddress: transfer.assetAddress }));
      if (matching.length === 0) {
        return { status: "NO_AUTHORIZATION", complete: true, matchCount: 0, latestBlock, chainId: expectedChainId };
      }
      if (matching.length > 1) {
        // Corruption / operator review: multiple AuthorizationUsed for one nonce.
        return { status: "AMBIGUOUS_MULTIPLE_NONCE_EVENTS", complete: true, matchCount: matching.length, latestBlock, chainId: expectedChainId };
      }
      const txHash = matching[0].transactionHash ?? null;
      if (!txHash) {
        return { status: "NO_AUTHORIZATION", complete: true, matchCount: 0, latestBlock, chainId: expectedChainId };
      }
      const receipt = await rpcCall(rpcUrl, "eth_getTransactionReceipt", [txHash], fetchImpl);
      if (!receipt) {
        return { status: "PENDING", complete: false, transaction: txHash, chainId: expectedChainId };
      }
      const bound = findNonceBoundSettlementInReceipt(receipt, transfer, { wallet: transfer.from, nonce: purchase.nonce, assetAddress: transfer.assetAddress });
      if (bound) {
        return { status: "SETTLED", complete: true, transaction: bound.transaction, blockNumber: receipt.blockNumber ?? null, latestBlock, chainId: expectedChainId };
      }
      return {
        status: "RECEIPT_SUCCESS_UNVERIFIED",
        complete: true,
        transaction: txHash,
        reason: "AuthorizationUsed found but exact USDC Transfer not in the same transaction",
        latestBlock,
        chainId: expectedChainId,
      };
    }

    // No stored nonce and no known transaction: a current-runtime SIGNED/
    // AMBIGUOUS purchase cannot be safely resolved by (wallet, payTo, amount)
    // evidence. The EIP-3009 nonce is the authoritative identity; without it we
    // cannot settle OR release. Do NOT perform the ambiguous Transfer scan —
    // that path is not authoritative. Hold for operator review / non-nonce-proof
    // reconciliation. (Known historical records that already carry a transaction
    // hash retain the legacy exact-Transfer receipt compatibility path above.)
    if (purchase.stage === "SIGNED" || purchase.stage === "AMBIGUOUS") {
      return {
        status: "NONCE_REQUIRED",
        complete: false,
        reason: "current-runtime unresolved purchase has no stored EIP-3009 nonce; nonce-required for authoritative release/settlement",
        chainId: expectedChainId,
      };
    }
    // PREPARED (unsigned) with no nonce/transaction falls through to a normal
    // ambiguous Transfer scan (its release is governed by the unsigned PREPARED
    // expiry rule, not chain authorization).
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
        status: "SETTLED_AMBIGUOUS_TRANSFER_ONLY",
        complete: true,
        transaction: matches[0].transactionHash ?? null,
        blockNumber: matches[0].blockNumber ?? null,
        latestBlock,
        chainId: expectedChainId,
        reason: "Transfer with matching amount/payee but no nonce binding; operator review required",
      };
    }
    if (matches.length > 1) {
      return {
        status: "AMBIGUOUS_MULTIPLE_MATCHES",
        complete: true,
        matchCount: matches.length,
        latestBlock,
        chainId: expectedChainId,
      };
    }
    return { status: "NO_MATCH", complete: true, matchCount: 0, latestBlock, chainId: expectedChainId };
  } catch (error) {
    return {
      status: "ERROR",
      complete: false,
      reason: error?.message ?? String(error),
      chainId: expectedChainId,
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

  // Authoritative positive settlement (chain-bound, nonce-verified) is the only
  // non-positive->SETTLED path.
  if (chain.status === "SETTLED") {
    return {
      action: "SETTLED",
      reason: "CHAIN_AUTHORIZATION_CONFIRMED",
      transaction: chain.transaction ?? purchase.transaction ?? null,
    };
  }

  // A positively chain-bound transaction reverted. The authorization is consumed
  // but inconclusive for settlement; release the budget (FAILED) while keeping
  // the reverted transaction hash as historical evidence. The active transaction
  // field is cleared by reconcilePurchase so a proven-reverted hash no longer
  // consumes budget.
  if (chain.status === "REVERTED") {
    return {
      action: "FAILED",
      reason: "CHAIN_TRANSACTION_REVERTED",
      revertedTransaction: chain.transaction ?? purchase.transaction ?? null,
    };
  }

  // Chain binding failed (wrong chain id, malformed/unreachable). Fail closed:
  // never release budget, never settle, never produce NO_MATCH/REVERTED from a
  // chain we could not positively bind.
  if (chain.status === "WRONG_CHAIN") {
    return { action: "HOLD", reason: "CHAIN_ID_BINDING_FAILED", chainId: chain.chainId ?? null };
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

    // Eligible for release only when the scan is complete AND positively chain
    // bound (correct chain id) AND proves no matching authorization existed.
    const noAuthorization =
      (chain.status === "NO_MATCH" || chain.status === "NO_AUTHORIZATION") &&
      chain.complete === true;

    if (
      authorizationExpired &&
      chain.complete === true &&
      noAuthorization &&
      facilitator.status !== "VALID"
    ) {
      return { action: "FAILED", reason: "AUTH_EXPIRED_NO_CHAIN_AUTHORIZATION" };
    }
  }

  return {
    action: "HOLD",
    reason:
      chain.status === "AMBIGUOUS_MULTIPLE_MATCHES" ||
      chain.status === "AMBIGUOUS_MULTIPLE_NONCE_EVENTS" ||
      chain.status === "SETTLED_AMBIGUOUS_TRANSFER_ONLY" ||
      chain.status === "KNOWN_TRANSACTION_UNVERIFIED_NO_NONCE"
        ? "MULTIPLE_CHAIN_MATCHES_REQUIRE_OPERATOR_REVIEW"
        : chain.status === "RECEIPT_SUCCESS_UNVERIFIED"
          ? "RECEIPT_UNVERIFIED_REQUIRES_OPERATOR_REVIEW"
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
  // REVERTED release: preserve the proven-reverted transaction hash as historical
  // evidence, but clear the active transaction/transaction_hash field so the
  // proven-reverted authorization no longer consumes budget.
  if (decision.action === "FAILED" && decision.revertedTransaction) {
    patch.revertedTransaction = decision.revertedTransaction;
    patch.transaction = null;
  } else if (decision.transaction) {
    patch.transaction = decision.transaction;
  }
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
