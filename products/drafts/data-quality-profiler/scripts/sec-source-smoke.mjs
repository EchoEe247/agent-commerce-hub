import { createSecCompanySnapshot } from "../src/sec-company-snapshot.mjs";

// Live dependency check for Product #11 using only official SEC sources.
const started = Date.now();
const snapshot = createSecCompanySnapshot();
const result = await snapshot({ ticker: "AAPL" });

if (result?.company?.cik !== "0000320193") {
  throw new Error(`Unexpected AAPL CIK: ${result?.company?.cik ?? "missing"}`);
}
if (!result?.company?.name) throw new Error("SEC submissions response did not provide a company name");
if (!result?.filings?.latest_10_k && !result?.filings?.latest_10_q) {
  throw new Error("SEC submissions response did not provide a recent 10-K or 10-Q");
}

console.log(JSON.stringify({
  smoke: "SEC_SOURCE_OK",
  provider: result.source?.provider,
  cik: result.company.cik,
  name: result.company.name,
  latest_10_k_filed: result.filings.latest_10_k?.filing_date ?? null,
  latest_10_q_filed: result.filings.latest_10_q?.filing_date ?? null,
  facts_available: Object.values(result.facts ?? {}).filter(Boolean).length,
  elapsed_ms: Date.now() - started,
}));