import { readResponseTextBounded, ResponseBodyLimitError } from "./bounded-response.mjs";

const TICKER_MAP_URL = "https://www.sec.gov/files/company_tickers_exchange.json";
const SUBMISSIONS_BASE = "https://data.sec.gov/submissions/";
const COMPANY_FACTS_BASE = "https://data.sec.gov/api/xbrl/companyfacts/";
const ARCHIVES_BASE = "https://www.sec.gov/Archives/edgar/data";
const REQUEST_TIMEOUT_MS = 10000;
const TICKER_CACHE_MS = 24 * 60 * 60 * 1000;
const SEC_USER_AGENT = "Hermes Commerce https://hermes-counterparty-api.onrender.com";
const TICKER_MAP_MAX_BYTES = 8 * 1024 * 1024;
const SUBMISSIONS_MAX_BYTES = 8 * 1024 * 1024;
const COMPANY_FACTS_MAX_BYTES = 32 * 1024 * 1024;

export function createSecCompanySnapshot({
  fetchImpl = globalThis.fetch,
  clock = { now: () => Date.now() },
} = {}) {
  let tickerCache = null;

  return async function secCompanySnapshot(payload) {
    const query = normalizeRequest(payload);
    let cik = query.cik;
    let tickerRecord = null;

    if (query.ticker) {
      const tickerMap = await loadTickerMap();
      tickerRecord = resolveTicker(tickerMap, query.ticker);
      if (!tickerRecord) throw new Error(`SEC_COMPANY_NOT_FOUND: ticker ${query.ticker} was not found in the SEC ticker map`);
      cik = normalizeCik(tickerRecord.cik);
    }

    const submissionsUrl = `${SUBMISSIONS_BASE}CIK${cik}.json`;
    const companyFactsUrl = `${COMPANY_FACTS_BASE}CIK${cik}.json`;
    const [submissions, factsResult] = await Promise.all([
      fetchJson(submissionsUrl, { required: true, maxBytes: SUBMISSIONS_MAX_BYTES, label: "submissions" }),
      fetchJson(companyFactsUrl, { required: false, maxBytes: COMPANY_FACTS_MAX_BYTES, label: "company facts" }),
    ]);

    if (!submissions || typeof submissions !== "object" || !submissions.name) {
      throw new Error("SEC_SOURCE_UNAVAILABLE: SEC submissions response was not usable");
    }

    const filings = buildFilings(submissions, cik);
    const facts = buildFacts(factsResult);
    const warnings = [];
    if (!factsResult) warnings.push("SEC XBRL company facts were unavailable for this company.");
    for (const [key, value] of Object.entries(facts)) {
      if (!value) warnings.push(`SEC fact unavailable: ${key}.`);
    }

    const ticker = query.ticker ?? firstString(submissions.tickers) ?? tickerRecord?.ticker ?? null;
    const tickerIndex = Array.isArray(submissions.tickers) && ticker
      ? submissions.tickers.findIndex((candidate) => String(candidate).toUpperCase() === ticker)
      : -1;
    const exchange = tickerIndex >= 0 && Array.isArray(submissions.exchanges)
      ? submissions.exchanges[tickerIndex] ?? null
      : firstString(submissions.exchanges) ?? tickerRecord?.exchange ?? null;

    return {
      schema_version: "1.0",
      query: {
        ticker: query.ticker,
        cik: query.original_cik,
        resolved_cik: cik,
      },
      company: {
        cik,
        name: submissions.name,
        ticker,
        exchange,
        tickers: stringArray(submissions.tickers),
        exchanges: stringArray(submissions.exchanges),
        sic: nullableString(submissions.sic),
        sic_description: nullableString(submissions.sicDescription),
        state_of_incorporation: nullableString(submissions.stateOfIncorporation),
        fiscal_year_end: nullableString(submissions.fiscalYearEnd),
        entity_type: nullableString(submissions.entityType),
      },
      filings,
      facts,
      source: {
        provider: "SEC EDGAR",
        ticker_map_url: query.ticker ? TICKER_MAP_URL : null,
        submissions_url: submissionsUrl,
        company_facts_url: companyFactsUrl,
        fetched_at: new Date(clock.now()).toISOString(),
      },
      warnings,
    };
  };

  async function loadTickerMap() {
    const now = clock.now();
    if (tickerCache && now - tickerCache.fetchedAt < TICKER_CACHE_MS) return tickerCache.value;
    const value = await fetchJson(TICKER_MAP_URL, {
      required: true,
      maxBytes: TICKER_MAP_MAX_BYTES,
      label: "ticker map",
    });
    if (!value || !Array.isArray(value.fields) || !Array.isArray(value.data)) {
      throw new Error("SEC_SOURCE_UNAVAILABLE: SEC ticker map response was not usable");
    }
    tickerCache = { fetchedAt: now, value };
    return value;
  }

  async function fetchJson(url, { required, maxBytes, label }) {
    if (typeof fetchImpl !== "function") {
      if (required) throw new Error("SEC_SOURCE_UNAVAILABLE: SEC fetch is unavailable");
      return null;
    }
    try {
      const response = await fetchImpl(url, {
        method: "GET",
        headers: {
          accept: "application/json",
          "user-agent": SEC_USER_AGENT,
        },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      if (!response?.ok) {
        if (response?.status === 404 && required) throw new Error("SEC_COMPANY_NOT_FOUND: SEC company record was not found");
        if (!required) return null;
        throw new Error(`SEC_SOURCE_UNAVAILABLE: SEC request failed with HTTP ${response?.status ?? "unknown"}`);
      }

      let text;
      try {
        text = await readResponseTextBounded(response, maxBytes);
      } catch (error) {
        if (error instanceof ResponseBodyLimitError) {
          if (!required) return null;
          throw new Error(`SEC_SOURCE_UNAVAILABLE: SEC ${label} response exceeded the ${Math.floor(maxBytes / (1024 * 1024))} MiB safety limit`);
        }
        if (!required) return null;
        throw error;
      }

      let value;
      try {
        value = JSON.parse(text);
      } catch {
        if (!required) return null;
        throw new Error("SEC_SOURCE_UNAVAILABLE: SEC returned invalid JSON data");
      }
      if (!value || typeof value !== "object" || Array.isArray(value)) {
        if (!required) return null;
        throw new Error("SEC_SOURCE_UNAVAILABLE: SEC returned invalid JSON data");
      }
      return value;
    } catch (error) {
      if (String(error?.message ?? error).startsWith("SEC_")) throw error;
      if (!required) return null;
      throw new Error(`SEC_SOURCE_UNAVAILABLE: ${error?.message ?? "SEC request failed"}`);
    }
  }
}

function normalizeRequest(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("INVALID_SEC_REQUEST: body must be a JSON object");
  }
  const hasTicker = payload.ticker !== undefined && payload.ticker !== null && String(payload.ticker).trim() !== "";
  const hasCik = payload.cik !== undefined && payload.cik !== null && String(payload.cik).trim() !== "";
  if (hasTicker === hasCik) {
    throw new Error("INVALID_SEC_REQUEST: provide exactly one of ticker or cik");
  }
  if (hasTicker) {
    const ticker = String(payload.ticker).trim().toUpperCase();
    if (!/^[A-Z0-9][A-Z0-9.-]{0,19}$/.test(ticker)) {
      throw new Error("INVALID_SEC_REQUEST: ticker format is invalid");
    }
    return { ticker, cik: null, original_cik: null };
  }
  const rawCik = String(payload.cik).trim();
  return { ticker: null, cik: normalizeCik(rawCik), original_cik: rawCik };
}

function normalizeCik(value) {
  const raw = String(value ?? "").trim();
  if (!/^\d{1,10}$/.test(raw)) throw new Error("INVALID_SEC_REQUEST: cik must contain 1 to 10 digits");
  return raw.padStart(10, "0");
}

function resolveTicker(map, ticker) {
  const fields = map.fields.map((field) => String(field).toLowerCase());
  const cikIndex = fields.indexOf("cik");
  const nameIndex = fields.indexOf("name");
  const tickerIndex = fields.indexOf("ticker");
  const exchangeIndex = fields.indexOf("exchange");
  if (cikIndex < 0 || tickerIndex < 0) throw new Error("SEC_SOURCE_UNAVAILABLE: SEC ticker map fields were incomplete");
  for (const row of map.data) {
    if (!Array.isArray(row)) continue;
    if (String(row[tickerIndex] ?? "").toUpperCase() !== ticker) continue;
    return {
      cik: row[cikIndex],
      name: nameIndex >= 0 ? nullableString(row[nameIndex]) : null,
      ticker,
      exchange: exchangeIndex >= 0 ? nullableString(row[exchangeIndex]) : null,
    };
  }
  return null;
}

function buildFilings(submissions, cik) {
  const recent = submissions?.filings?.recent ?? {};
  const count = Array.isArray(recent.accessionNumber) ? recent.accessionNumber.length : 0;
  const rows = [];
  for (let index = 0; index < count; index += 1) {
    const accession = nullableString(recent.accessionNumber?.[index]);
    const form = nullableString(recent.form?.[index]);
    const primaryDocument = nullableString(recent.primaryDocument?.[index]);
    if (!accession || !form) continue;
    rows.push({
      accession_number: accession,
      filing_date: nullableString(recent.filingDate?.[index]),
      report_date: nullableString(recent.reportDate?.[index]),
      form,
      primary_document: primaryDocument,
      primary_document_description: nullableString(recent.primaryDocDescription?.[index]),
      url: primaryDocument ? filingUrl(cik, accession, primaryDocument) : null,
    });
  }
  return {
    latest_10_k: latestForm(rows, "10-K"),
    latest_10_q: latestForm(rows, "10-Q"),
    latest_8_k: latestForm(rows, "8-K"),
  };
}

function latestForm(rows, form) {
  const candidates = rows.filter((row) => row.form === form || row.form === `${form}/A`);
  candidates.sort((a, b) => {
    const amendmentScore = Number(a.form.endsWith("/A")) - Number(b.form.endsWith("/A"));
    if (amendmentScore !== 0) return amendmentScore;
    return String(b.filing_date ?? "").localeCompare(String(a.filing_date ?? ""));
  });
  return candidates[0] ?? null;
}

function filingUrl(cik, accession, primaryDocument) {
  const cikInteger = String(Number(cik));
  const accessionCompact = accession.replace(/-/g, "");
  return `${ARCHIVES_BASE}/${cikInteger}/${accessionCompact}/${encodeURIComponent(primaryDocument)}`;
}

function buildFacts(companyFacts) {
  return {
    revenue: pickFact(companyFacts, "us-gaap", ["RevenueFromContractWithCustomerExcludingAssessedTax", "Revenues", "SalesRevenueNet"], "USD"),
    net_income: pickFact(companyFacts, "us-gaap", ["NetIncomeLoss", "ProfitLoss"], "USD"),
    assets: pickFact(companyFacts, "us-gaap", ["Assets"], "USD"),
    liabilities: pickFact(companyFacts, "us-gaap", ["Liabilities"], "USD"),
    shares_outstanding: pickFact(companyFacts, "dei", ["EntityCommonStockSharesOutstanding"], "shares"),
  };
}

function pickFact(companyFacts, taxonomy, concepts, preferredUnit) {
  const taxonomyFacts = companyFacts?.facts?.[taxonomy];
  if (!taxonomyFacts || typeof taxonomyFacts !== "object") return null;
  for (const concept of concepts) {
    const entry = taxonomyFacts[concept];
    if (!entry?.units || typeof entry.units !== "object") continue;
    const unit = entry.units[preferredUnit] ? preferredUnit : Object.keys(entry.units)[0];
    const rows = Array.isArray(entry.units[unit]) ? entry.units[unit] : [];
    const candidates = rows.filter((row) => ["10-K", "10-Q", "10-K/A", "10-Q/A"].includes(String(row?.form ?? "")) && Number.isFinite(Number(row?.val)));
    candidates.sort((a, b) => {
      const filed = String(b.filed ?? "").localeCompare(String(a.filed ?? ""));
      if (filed !== 0) return filed;
      const end = String(b.end ?? "").localeCompare(String(a.end ?? ""));
      if (end !== 0) return end;
      return String(b.accn ?? "").localeCompare(String(a.accn ?? ""));
    });
    const row = candidates[0];
    if (!row) continue;
    return {
      taxonomy,
      concept,
      unit,
      value: Number(row.val),
      start: nullableString(row.start),
      end: nullableString(row.end),
      filed: nullableString(row.filed),
      form: nullableString(row.form),
      accession_number: nullableString(row.accn),
      fiscal_year: row.fy ?? null,
      fiscal_period: nullableString(row.fp),
      frame: nullableString(row.frame),
    };
  }
  return null;
}

function nullableString(value) {
  if (value === undefined || value === null) return null;
  const text = String(value).trim();
  return text || null;
}

function firstString(value) {
  return Array.isArray(value) ? nullableString(value[0]) : null;
}

function stringArray(value) {
  return Array.isArray(value) ? value.map(nullableString).filter(Boolean) : [];
}
