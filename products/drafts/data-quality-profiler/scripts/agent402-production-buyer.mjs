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
  recalculateBudgetRecord,
  validateAgent402Quote,
} from '../src/payments/agent402-buyer-policy.mjs';

const MODE = process.env.MODE === 'execute' ? 'execute' : 'dry-run';
const ENDPOINT_ID = String(process.env.ENDPOINT_ID ?? '');
const PURCHASE_ID = String(process.env.PURCHASE_ID ?? '');
const PRIVATE_KEY = process.env.HERMES_COMMERCE_SPEND_PRIVATE_KEY ?? '';
const USER_AGENT = 'hermes-commerce-control/1.0';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const LEDGER_PATH = path.join(ROOT, 'state/commerce-control/budget-ledger.json');
const RESULT_DIR = path.join(ROOT, 'state/commerce-control/private-results');

if (!/^[A-Za-z0-9._:-]{1,80}$/.test(PURCHASE_ID)) throw new Error('invalid purchaseId');
const TARGET_URL = buildEndpointUrl(ENDPOINT_ID);

function defaultLedger() {
  return {
    budgets: {
      testnet: {
        budgetId: 'B2_COMMERCE_OPERATING_BUDGET_V1_TESTNET',
        wallet: '', initialBudget: 2_000_000, spentBudget: 0, remainingBudget: 2_000_000, purchases: {},
      },
      mainnet: {
        budgetId: 'B2_COMMERCE_OPERATING_BUDGET_V1',
        wallet: '', initialBudget: CUMULATIVE_BUDGET_RAW, spentBudget: 0, remainingBudget: CUMULATIVE_BUDGET_RAW, purchases: {},
      },
    },
  };
}

function loadLedger() {
  const data = fs.existsSync(LEDGER_PATH) ? JSON.parse(fs.readFileSync(LEDGER_PATH, 'utf8')) : defaultLedger();
  data.budgets ??= {};
  data.budgets.mainnet ??= defaultLedger().budgets.mainnet;
  const budget = data.budgets.mainnet;
  if (Number(budget.initialBudget) !== CUMULATIVE_BUDGET_RAW) {
    throw new Error(`unexpected mainnet budget ceiling ${budget.initialBudget}; expected ${CUMULATIVE_BUDGET_RAW}`);
  }
  budget.purchases ??= {};
  recalculateBudgetRecord(budget);
  return data;
}

function saveLedger(data) {
  fs.mkdirSync(path.dirname(LEDGER_PATH), { recursive: true });
  fs.writeFileSync(LEDGER_PATH, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

function setStage(data, stage, extra = {}) {
  const b = data.budgets.mainnet;
  const previous = b.purchases[PURCHASE_ID] ?? { purchaseId: PURCHASE_ID };
  b.purchases[PURCHASE_ID] = {
    ...previous,
    stage,
    updatedAt: new Date().toISOString(),
    ...extra,
  };
  recalculateBudgetRecord(b);
  saveLedger(data);
  console.log(`LEDGER stage=${stage} spentRaw=${b.spentBudget} remainingRaw=${b.remainingBudget}`);
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
  const ledger = loadLedger();
  const budget = ledger.budgets.mainnet;
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

  if (!PRIVATE_KEY) throw new Error('HERMES_COMMERCE_SPEND_PRIVATE_KEY is not set');
  const account = privateKeyToAccount(PRIVATE_KEY.startsWith('0x') ? PRIVATE_KEY : `0x${PRIVATE_KEY}`);
  if (budget.wallet && budget.wallet.toLowerCase() !== account.address.toLowerCase()) {
    throw new Error('production signer address does not match ledger wallet');
  }
  if (!budget.wallet) budget.wallet = account.address;

  setStage(ledger, 'PREPARED', {
    endpointId: ENDPOINT_ID,
    amount: Number(verdict.amountRaw),
    payTo: verdict.payTo,
    resource: TARGET_URL,
    idempotencyKey: PURCHASE_ID,
  });

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
  setStage(ledger, 'SIGNED', { nonce: auth.nonce, validBefore: auth.validBefore });
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
    setStage(ledger, 'AMBIGUOUS', { errorClass: error?.name ?? 'fetch-error' });
    throw new Error(`paid request transport outcome ambiguous: ${error?.name ?? 'fetch-error'}`);
  }

  const paidText = await paid.text();
  const settleHeader = paid.headers.get('payment-response') ?? paid.headers.get('x-payment-response');
  let settle = null;
  if (settleHeader) {
    try { settle = JSON.parse(Buffer.from(settleHeader, 'base64').toString('utf8')); } catch {}
  }

  if (!paid.ok || !settle?.success || !settle?.transaction) {
    setStage(ledger, settle?.success === false ? 'FAILED' : 'AMBIGUOUS', { httpStatus: paid.status });
    throw new Error(`paid request did not produce a confirmed settlement (HTTP ${paid.status})`);
  }

  let body;
  try { body = paidText ? JSON.parse(paidText) : null; } catch { body = { raw: paidText.slice(0, 100_000) }; }
  setStage(ledger, 'SETTLED', { transaction: settle.transaction, httpStatus: paid.status });

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
