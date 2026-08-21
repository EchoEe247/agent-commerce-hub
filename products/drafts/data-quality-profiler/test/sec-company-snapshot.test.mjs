import test from "node:test";
import assert from "node:assert/strict";
import { buildApp } from "../src/app.mjs";

test("POST /v1/sec-company-snapshot delegates to the SEC snapshot service", async () => {
  const calls = [];
  const app = buildApp({
    config: { serviceVersion: "0.1.0" },
    paymentPlugin: async () => {},
    secCompanySnapshot: async (payload) => {
      calls.push(payload);
      return {
        schema_version: "1.0",
        query: { ticker: "AAPL", cik: null },
        company: { cik: "0000320193", name: "Apple Inc." },
        filings: {},
        facts: {},
        source: { provider: "SEC EDGAR" },
        warnings: [],
      };
    },
  });

  const response = await app.inject({
    method: "POST",
    url: "/v1/sec-company-snapshot",
    payload: { ticker: "AAPL" },
  });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(calls, [{ ticker: "AAPL" }]);
  assert.equal(response.json().company.cik, "0000320193");
  await app.close();
});

test("default SEC snapshot resolves ticker and returns company, filings, and sourced financial facts", async () => {
  const requests = [];
  const fixtures = new Map([
    ["https://www.sec.gov/files/company_tickers_exchange.json", {
      fields: ["cik", "name", "ticker", "exchange"],
      data: [[320193, "Apple Inc.", "AAPL", "Nasdaq"]],
    }],
    ["https://data.sec.gov/submissions/CIK0000320193.json", {
      cik: "0000320193",
      name: "Apple Inc.",
      tickers: ["AAPL"],
      exchanges: ["Nasdaq"],
      sic: "3571",
      sicDescription: "Electronic Computers",
      stateOfIncorporation: "CA",
      fiscalYearEnd: "0927",
      entityType: "operating",
      filings: {
        recent: {
          accessionNumber: ["0000320193-25-000079", "0000320193-25-000050", "0000320193-25-000040"],
          filingDate: ["2025-11-01", "2025-08-01", "2025-07-15"],
          reportDate: ["2025-09-27", "2025-06-28", "2025-07-15"],
          form: ["10-K", "10-Q", "8-K"],
          primaryDocument: ["aapl-20250927.htm", "aapl-20250628.htm", "aapl-20250715.htm"],
          primaryDocDescription: ["10-K", "10-Q", "8-K"],
        },
      },
    }],
    ["https://data.sec.gov/api/xbrl/companyfacts/CIK0000320193.json", {
      cik: 320193,
      entityName: "Apple Inc.",
      facts: {
        "us-gaap": {
          RevenueFromContractWithCustomerExcludingAssessedTax: {
            units: { USD: [{ end: "2025-09-27", val: 416000000000, accn: "0000320193-25-000079", fy: 2025, fp: "FY", form: "10-K", filed: "2025-11-01" }] },
          },
          NetIncomeLoss: {
            units: { USD: [{ end: "2025-09-27", val: 112000000000, accn: "0000320193-25-000079", fy: 2025, fp: "FY", form: "10-K", filed: "2025-11-01" }] },
          },
          Assets: {
            units: { USD: [{ end: "2025-09-27", val: 360000000000, accn: "0000320193-25-000079", fy: 2025, fp: "FY", form: "10-K", filed: "2025-11-01" }] },
          },
          Liabilities: {
            units: { USD: [{ end: "2025-09-27", val: 290000000000, accn: "0000320193-25-000079", fy: 2025, fp: "FY", form: "10-K", filed: "2025-11-01" }] },
          },
        },
        dei: {
          EntityCommonStockSharesOutstanding: {
            units: { shares: [{ end: "2025-09-27", val: 14800000000, accn: "0000320193-25-000079", fy: 2025, fp: "FY", form: "10-K", filed: "2025-11-01" }] },
          },
        },
      },
    }],
  ]);

  const secFetch = async (url, options = {}) => {
    requests.push({ url: String(url), headers: options.headers ?? {} });
    const body = fixtures.get(String(url));
    if (!body) return fakeResponse(404, { error: "not found" });
    return fakeResponse(200, body);
  };

  const app = buildApp({
    config: { serviceVersion: "0.1.0" },
    paymentPlugin: async () => {},
    secFetch,
    secClock: { now: () => Date.parse("2026-08-21T06:30:00.000Z") },
  });

  const response = await app.inject({
    method: "POST",
    url: "/v1/sec-company-snapshot",
    payload: { ticker: "aapl" },
  });

  assert.equal(response.statusCode, 200);
  const body = response.json();
  assert.deepEqual(body.query, { ticker: "AAPL", cik: null, resolved_cik: "0000320193" });
  assert.equal(body.company.name, "Apple Inc.");
  assert.equal(body.company.cik, "0000320193");
  assert.equal(body.company.sic, "3571");
  assert.equal(body.company.exchange, "Nasdaq");
  assert.match(body.filings.latest_10_k.url, /\/Archives\/edgar\/data\/320193\/000032019325000079\/aapl-20250927\.htm$/);
  assert.equal(body.filings.latest_10_q.form, "10-Q");
  assert.equal(body.filings.latest_8_k.form, "8-K");
  assert.equal(body.facts.revenue.value, 416000000000);
  assert.equal(body.facts.net_income.value, 112000000000);
  assert.equal(body.facts.assets.value, 360000000000);
  assert.equal(body.facts.liabilities.value, 290000000000);
  assert.equal(body.facts.shares_outstanding.value, 14800000000);
  assert.equal(body.source.provider, "SEC EDGAR");
  assert.equal(body.source.fetched_at, "2026-08-21T06:30:00.000Z");
  assert.equal(body.warnings.length, 0);
  assert.equal(requests.length, 3);
  assert.ok(requests.every((request) => /Hermes Commerce/i.test(String(request.headers["user-agent"] ?? request.headers["User-Agent"] ?? ""))));
  await app.close();
});

function fakeResponse(status, body) {
  return {
    status,
    ok: status >= 200 && status < 300,
    headers: new Headers({ "content-type": "application/json" }),
    async json() { return body; },
    async text() { return JSON.stringify(body); },
  };
}
