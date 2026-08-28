import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { privateKeyToAccount } from 'viem/accounts';
import { x402Client, x402HTTPClient } from '@x402/core/client';
import { registerExactEvmScheme } from '@x402/evm/exact/client';
import {
  AGENT402_ORIGIN,
  BASE_MAINNET,
  BASE_USDC,
  CUMULATIVE_BUDGET_RAW,
  buildEndpointUrl,
  validateAgent402Quote,
} from '../src/payments/agent402-buyer-policy.mjs';
import {
  loadLedger,
  saveLedger,
  stageUpdate,
  NETWORK_MAINNET,
  MAINNET_BUDGET_ID,
  LedgerError,
  MAINNET_WALLET,
} from '../src/payments/ledger.mjs';

const MODE = process.env.MODE === "execute" ? "execute" : "dry-run";
const ENDPOINT_ID = String(process.env.ENDPOINT_ID ?? "");
const PURCHASE_ID = String(process.env.PURCHASE_ID ?? "");
const USER_AGENT = "hermes-commerce-control/1.0";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const LEDGER_PATH = path.join(ROOT, "state/commerce-control/ledgers/mainnet-budget-ledger.json");
const RESULT_DIR = path.join(ROOT, "state/commerce-control/private-results");

// New fail-closed guard. Public GitHub Actions must never trigger a production
// purchase that returns private paid content, even if a hostile input/secret is
// present. The refusal happens BEFORE any payment/wallet secret is read.
if (process.env.GITHUB_ACTIONS === "true" && MODE === "execute") {
  console.error("PUBLIC_ACTIONS_PURCHASE_DISABLED: production purchases are refused in GitHub Actions; run the buyer locally instead.");
  process.exit(1);
}

if (!/^[A-Za-z0-9._:-]{1,80}$/.test(PURCHASE_ID)) throw new Error('invalid purchaseId');
const TARGET_URL = buildEndpointUrl(ENDPOINT_ID);

// Production buyer touches ONLY the mainnet ledger.
// P1 Batch 2 correction: the mainnet ledger MUST already exist and is bound to
// the known production wallet. A missing ledger is fatal (we must NOT conjure a
// fresh 2.38M USDC budget). allowCreate is intentionally false.
function loadMainnetLedger() {
  try {
    const { ledger } = loadLedger(LEDGER_PATH, NETWORK_MAINNET, {
      allowCreate: false,
      expectedWallet: MAINNET_WALLET,
    });
    return ledger;
  } catch (error) {
    if (error instanceof LedgerError) {
      throw new Error(`MAINNET_LEDGER_FATAL: ${error.message} (code=${error.code})`);
    }
    throw error;
  }
}

function decodePaymentRequired(response) {
  const header = response.headers.get('payment-required');
  if (!header) throw new Error('missing PAYMENT-REQUIRED header');
  return JSON.parse(Buffer.from(header, 'base64').toString('utf8'));
}

function assertResourceBound(paymentRequired) {
  const raw = paymentRequired?.resource?.url ?? paymentRequired?.resource;
  if (typeof raw !== 'string' || !raw) return;
  const expected = new URL(TARGET_URL);
  const actual = new URL(raw);
  if (actual.origin !== AGENT402_ORIGIN || actual.pathname !== expected.pathname) {
    throw new Error(`payment resource escaped allowlist: ${actual.origin}${actual.pathname}`);
  }
}

async function run() {
  const ledger = loadMainnetLedger();
  const budget = ledger;
  if (budget.purchases[PURCHASE_ID]) throw new Error(`duplicate purchaseId: ${PURCHASE_ID}`);

  const headers = {
    'User-Agent': USER_AGENT,
    'Idempotency-Key': PURCHASE_ID,
    Accept: 'application/json',
  };

  const quoteStarted = Date.now();
  const unpaid = await fetch(TARGET_URL, {
    method: 'GET', headers, redirect: 'error', signal: AbortSignal.timeout(30_000),
  });
  if (unpaid.status !== 402) throw new Error(`expected HTTP 402 from allowlisted Agent402 endpoint, got ${unpaid.status}`);
  const unpaidBodyText = await unpaid.text();
  const decoded = decodePaymentRequired(unpaid);
  assertResourceBound(decoded);

  const quote = (decoded.accepts ?? []).find((q) =>
    q?.scheme === 'exact' && q?.network === BASE_MAINNET && String(q?.asset ?? '').toLowerCase() === BASE_USDC.toLowerCase()
  );
  const verdict = validateAgent402Quote(quote, ENDPOINT_ID, budget.remainingBudget);
  if (!verdict.ok) throw new Error(`quote rejected: ${verdict.reason}`);

  console.log(`QUOTE_OK endpoint=${ENDPOINT_ID} amountRaw=${verdict.amountRaw} payTo=${verdict.payTo} remainingRaw=${budget.remainingBudget} quoteMs=${Date.now() - quoteStarted}`);
  if (MODE === 'dry-run') {
    console.log('DRY_RUN_OK no signature created; no funds moved');
    return;
  }

  const PRIVATE_KEY = process.env.HERMES_COMMERCE_SPEND_PRIVATE_KEY ?? '';
  if (!PRIVATE_KEY) throw new Error('HERMES_COMMERCE_SPEND_PRIVATE_KEY is not set');
  const account = privateKeyToAccount(PRIVATE_KEY.startsWith('0x') ? PRIVATE_KEY : `0x${PRIVATE_KEY}`);
  // Production execute path: the derived account MUST match the ledger's bound
  // production wallet. We do not create/repair a wallet binding at execute time.
  if (budget.wallet.toLowerCase() !== account.address.toLowerCase()) {
    throw new Error('MAINNET_EXECUTION_WALLET_MISMATCH: production signer address does not match ledger wallet');
  }

  stageUpdate(LEDGER_PATH, NETWORK_MAINNET, PURCHASE_ID, 'PREPARED', {
    endpointId: ENDPOINT_ID,
    amount: Number(verdict.amountRaw),
    payTo: verdict.payTo,
    resource: TARGET_URL,
    idempotencyKey: PURCHASE_ID,
  }, { expectedWallet: MAINNET_WALLET });

  let unpaidBody;
  try { unpaidBody = unpaidBodyText ? JSON.parse(unpaidBodyText) : undefined; } catch {}
  const client = new x402Client();
  registerExactEvmScheme(client, { signer: account });
  const httpClient = new x402HTTPClient(client);
  const parsedRequired = httpClient.getPaymentRequiredResponse((name) => unpaid.headers.get(name), unpaidBody);
  const boundedRequired = { ...parsedRequired, accepts: [quote] };

  const signStarted = Date.now();
  const payload = await client.createPaymentPayload(boundedRequired);
  const auth = payload?.payload?.authorization ?? {};
  if (String(auth.to ?? '').toLowerCase() !== String(verdict.payTo).toLowerCase()) throw new Error('authorization recipient mismatch');
  if (BigInt(auth.value ?? '0') !== verdict.amountRaw) throw new Error('authorization value mismatch');
  stageUpdate(LEDGER_PATH, NETWORK_MAINNET, PURCHASE_ID, 'SIGNED', { nonce: auth.nonce, validBefore: auth.validBefore }, { expectedWallet: MAINNET_WALLET });
  console.log(`SIGN_OK wallet=${account.address} signMs=${Date.now() - signStarted}`);

  const paymentHeaders = httpClient.encodePaymentSignatureHeader(payload);
  let paid;
  try {
    paid = await fetch(TARGET_URL, {
      method: 'GET',
      headers: { ...headers, ...paymentHeaders },
      redirect: 'error',
      signal: AbortSignal.timeout(120_000),
    });
  } catch (error) {
    stageUpdate(LEDGER_PATH, NETWORK_MAINNET, PURCHASE_ID, 'AMBIGUOUS', { errorClass: error?.name ?? 'fetch-error' }, { expectedWallet: MAINNET_WALLET });
    throw new Error(`paid request transport outcome ambiguous: ${error?.name ?? 'fetch-error'}`);
  }

  const paidText = await paid.text();
  const settleHeader = paid.headers.get('payment-response') ?? paid.headers.get('x-payment-response');
  let settle = null;
  if (settleHeader) {
    try { settle = JSON.parse(Buffer.from(settleHeader, 'base64').toString('utf8')); } catch {}
  }

  if (!paid.ok || !settle?.success || !settle?.transaction) {
    stageUpdate(LEDGER_PATH, NETWORK_MAINNET, PURCHASE_ID, settle?.success === false ? 'FAILED' : 'AMBIGUOUS', { httpStatus: paid.status }, { expectedWallet: MAINNET_WALLET });
    throw new Error(`paid request did not produce a confirmed settlement (HTTP ${paid.status})`);
  }

  let body;
  try { body = paidText ? JSON.parse(paidText) : null; } catch { body = { raw: paidText.slice(0, 100_000) }; }
  stageUpdate(LEDGER_PATH, NETWORK_MAINNET, PURCHASE_ID, 'SETTLED', { transaction: settle.transaction, httpStatus: paid.status }, { expectedWallet: MAINNET_WALLET });

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
  }, null, 2)}\n`, 'utf8');

  console.log(`PURCHASE_SETTLED endpoint=${ENDPOINT_ID} amountRaw=${verdict.amountRaw} tx=${settle.transaction}`);
  console.log(`PRIVATE_RESULT_PATH=${resultPath}`);
}

run().catch((error) => {
  console.error(`BUYER_ERROR ${error?.message ?? String(error)}`);
  process.exit(1);
});
