import test from 'node:test';
import assert from 'node:assert/strict';
import {
  AGENT402_ENDPOINTS,
  AGENT402_PAY_TO,
  BASE_MAINNET,
  BASE_USDC,
  CUMULATIVE_BUDGET_RAW,
  MAX_PER_PURCHASE_RAW,
  buildEndpointUrl,
  recalculateBudgetRecord,
  validateAgent402Quote,
} from '../src/payments/agent402-buyer-policy.mjs';

const goodQuote = (over = {}) => ({
  scheme: 'exact',
  network: BASE_MAINNET,
  asset: BASE_USDC,
  amount: '5000',
  payTo: AGENT402_PAY_TO,
  maxTimeoutSeconds: 300,
  extra: {},
  ...over,
});

test('production budget is 2.38 USDC and per-purchase ceiling is 0.10 USDC', () => {
  assert.equal(CUMULATIVE_BUDGET_RAW, 2_380_000);
  assert.equal(MAX_PER_PURCHASE_RAW, 100_000);
});

test('only the two money-intelligence endpoints are allowed and URLs are fixed to agent402.tools', () => {
  assert.deepEqual(Object.keys(AGENT402_ENDPOINTS).sort(), ['bestsellers', 'demand-radar']);
  assert.equal(buildEndpointUrl('demand-radar'), 'https://agent402.tools/api/demand-radar?sort=count&limit=25&minCount=1');
  assert.equal(buildEndpointUrl('bestsellers'), 'https://agent402.tools/api/bestsellers?sort=buyers&days=30&limit=25');
  assert.throws(() => buildEndpointUrl('anything-else'), /endpoint not allowlisted/);
});

test('valid Base USDC Agent402 quote passes when budget remains', () => {
  const verdict = validateAgent402Quote(goodQuote(), 'demand-radar', 2_380_000);
  assert.equal(verdict.ok, true);
  assert.equal(verdict.amountRaw, 5000n);
});

test('quote policy rejects wrong chain, token, recipient, stale/huge timeout and recurring payment shapes', () => {
  const cases = [
    goodQuote({ network: 'eip155:84532' }),
    goodQuote({ asset: '0x2222222222222222222222222222222222222222' }),
    goodQuote({ payTo: '0x1111111111111111111111111111111111111111' }),
    goodQuote({ maxTimeoutSeconds: 0 }),
    goodQuote({ maxTimeoutSeconds: 601 }),
    goodQuote({ extra: { recurring: true } }),
    goodQuote({ extra: { subscription: true } }),
    goodQuote({ extra: { approval: true } }),
  ];
  for (const quote of cases) assert.equal(validateAgent402Quote(quote, 'demand-radar', 2_380_000).ok, false);
});

test('endpoint-specific price ceiling and cumulative budget both fail closed', () => {
  assert.equal(validateAgent402Quote(goodQuote({ amount: '10001' }), 'demand-radar', 2_380_000).ok, false);
  assert.equal(validateAgent402Quote(goodQuote({ amount: '5000' }), 'demand-radar', 4999).ok, false);
});

test('budget accounting reserves ambiguous work and keeps settled/replay-rejected spend', () => {
  const b = {
    initialBudget: CUMULATIVE_BUDGET_RAW,
    purchases: {
      settled: { stage: 'SETTLED', amount: 5000 },
      replay: { stage: 'REPLAY_REJECTED', amount: 5000, transaction: '0xabc' },
      ambiguous: { stage: 'AMBIGUOUS', amount: 5000 },
      failed: { stage: 'FAILED', amount: 5000 },
    },
  };
  recalculateBudgetRecord(b);
  assert.equal(b.spentBudget, 15_000);
  assert.equal(b.remainingBudget, CUMULATIVE_BUDGET_RAW - 15_000);
});
