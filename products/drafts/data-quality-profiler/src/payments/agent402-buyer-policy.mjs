export const AGENT402_ORIGIN = 'https://agent402.tools';
export const AGENT402_PAY_TO = '0xaBF4FAbd7c416fB67202E5f9002389Fc75e2a9D0';
export const BASE_MAINNET = 'eip155:8453';
export const BASE_USDC = '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913';
export const CUMULATIVE_BUDGET_RAW = 2_380_000;
export const MAX_PER_PURCHASE_RAW = 100_000;

export const AGENT402_ENDPOINTS = Object.freeze({
  'demand-radar': Object.freeze({
    method: 'GET',
    path: '/api/demand-radar?sort=count&limit=25&minCount=1',
    maxQuoteRaw: 10_000,
  }),
  bestsellers: Object.freeze({
    method: 'GET',
    path: '/api/bestsellers?sort=buyers&days=30&limit=25',
    maxQuoteRaw: 10_000,
  }),
});

const BUDGET_CONSUMING_STAGES = new Set([
  'PREPARED',
  'SIGNED',
  'AMBIGUOUS',
  'SETTLED',
  'REPLAY_REJECTED',
]);

export function buildEndpointUrl(endpointId) {
  const endpoint = AGENT402_ENDPOINTS[endpointId];
  if (!endpoint) throw new Error(`endpoint not allowlisted: ${endpointId}`);
  return `${AGENT402_ORIGIN}${endpoint.path}`;
}

export function recalculateBudgetRecord(budget) {
  if (!budget || typeof budget !== 'object') throw new Error('missing budget');
  const initial = Number(budget.initialBudget);
  if (!Number.isSafeInteger(initial) || initial < 0) throw new Error('invalid initialBudget');
  let spent = 0;
  for (const purchase of Object.values(budget.purchases ?? {})) {
    if (!purchase || typeof purchase !== 'object') continue;
    if (BUDGET_CONSUMING_STAGES.has(purchase.stage) || purchase.transaction) {
      const amount = Number(purchase.amount ?? 0);
      if (!Number.isSafeInteger(amount) || amount < 0) throw new Error('invalid purchase amount');
      spent += amount;
    }
  }
  budget.spentBudget = spent;
  budget.remainingBudget = initial - spent;
  return budget;
}

export function validateAgent402Quote(quote, endpointId, remainingBudgetRaw) {
  const endpoint = AGENT402_ENDPOINTS[endpointId];
  if (!endpoint) return { ok: false, reason: 'endpoint not allowlisted' };
  if (!quote || typeof quote !== 'object') return { ok: false, reason: 'missing quote' };
  if (quote.scheme !== 'exact') return { ok: false, reason: 'unsupported scheme' };
  if (quote.network !== BASE_MAINNET) return { ok: false, reason: 'wrong chain' };
  if (String(quote.asset ?? '').toLowerCase() !== BASE_USDC.toLowerCase()) {
    return { ok: false, reason: 'wrong token' };
  }

  let amountRaw;
  try {
    amountRaw = BigInt(quote.amount ?? quote.maxAmountRequired ?? '0');
  } catch {
    return { ok: false, reason: 'unparseable amount' };
  }
  if (amountRaw <= 0n) return { ok: false, reason: 'invalid amount' };
  if (amountRaw > BigInt(MAX_PER_PURCHASE_RAW)) return { ok: false, reason: 'above per-purchase cap' };
  if (amountRaw > BigInt(endpoint.maxQuoteRaw)) return { ok: false, reason: 'above endpoint price ceiling' };

  let remaining;
  try {
    remaining = BigInt(remainingBudgetRaw);
  } catch {
    return { ok: false, reason: 'invalid remaining budget' };
  }
  if (remaining < amountRaw) return { ok: false, reason: 'cumulative budget exceeded' };

  if (String(quote.payTo ?? '').toLowerCase() !== AGENT402_PAY_TO.toLowerCase()) {
    return { ok: false, reason: 'unexpected payTo' };
  }

  const timeout = Number(quote.maxTimeoutSeconds ?? 0);
  if (!Number.isFinite(timeout) || timeout <= 0 || timeout > 600) {
    return { ok: false, reason: 'invalid validity window' };
  }

  const extra = quote.extra ?? {};
  if (extra.recurring || extra.subscription || extra.approval) {
    return { ok: false, reason: 'recurring/subscription/approval not allowed' };
  }

  return { ok: true, amountRaw, payTo: quote.payTo, endpoint };
}
