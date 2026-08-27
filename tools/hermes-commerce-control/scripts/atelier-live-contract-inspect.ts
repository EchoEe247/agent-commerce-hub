#!/usr/bin/env node
/**
 * GET-only source inspector for two remaining Atelier integration contracts:
 * 1) exact wallet-signature auth message format
 * 2) /api/upload request/response shape
 *
 * Public frontend/docs assets only. Never authenticates, signs, uploads, registers, or writes.
 */
const ORIGINS = ["https://app.useatelier.ai", "https://useatelier.ai"] as const;
const ENTRY_URLS = [
  "https://app.useatelier.ai/",
  "https://app.useatelier.ai/register",
  "https://app.useatelier.ai/agents/register",
  "https://app.useatelier.ai/register-agent",
  "https://useatelier.ai/docs/guides/register-an-agent",
  "https://useatelier.ai/docs/reference/authentication",
  "https://useatelier.ai/docs/guides/fulfill-orders",
  "https://useatelier.ai/docs/reference/rest-api",
] as const;
const MAX_BYTES = 2_500_000;
const MAX_ASSETS = 100;

type FetchResult = { readonly url: string; readonly status: number; readonly text: string; readonly location: string | null };

async function get(url: string): Promise<FetchResult> {
  const response = await fetch(url, {
    method: "GET",
    redirect: "manual",
    headers: {
      Accept: "text/html,text/plain,application/javascript,application/json;q=0.8,*/*;q=0.5",
      "User-Agent": "agent-commerce-hub-readonly-atelier-contract-inspector/1.0",
    },
    signal: AbortSignal.timeout(20_000),
  });
  const raw = await response.text();
  return {
    url,
    status: response.status,
    text: raw.slice(0, MAX_BYTES),
    location: response.headers.get("location"),
  };
}

function scriptsFromHtml(html: string, baseUrl: string): string[] {
  const urls = new Set<string>();
  for (const match of html.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi)) {
    const raw = match[1];
    if (!raw) continue;
    try {
      const url = new URL(raw, baseUrl);
      if (!ORIGINS.includes(url.origin as (typeof ORIGINS)[number])) continue;
      if (!/\.js(?:\?|$)/i.test(url.pathname + url.search)) continue;
      urls.add(url.toString());
    } catch {
      // Ignore malformed public asset references.
    }
  }
  return [...urls].slice(0, MAX_ASSETS);
}

function around(text: string, needle: string, radius = 900): string[] {
  const snippets = new Set<string>();
  const lower = text.toLowerCase();
  const target = needle.toLowerCase();
  let offset = 0;
  while (snippets.size < 12) {
    const index = lower.indexOf(target, offset);
    if (index < 0) break;
    const start = Math.max(0, index - radius);
    const end = Math.min(text.length, index + target.length + radius);
    snippets.add(text.slice(start, end).replace(/\s+/g, " ").slice(0, radius * 2 + target.length));
    offset = index + target.length;
  }
  return [...snippets];
}

const pages: FetchResult[] = [];
for (const url of ENTRY_URLS) {
  try {
    pages.push(await get(url));
  } catch (error) {
    pages.push({ url, status: 0, text: `fetch error: ${String(error).slice(0, 500)}`, location: null });
  }
}
for (const page of pages) {
  console.log(`ENTRY_GET=${page.url} HTTP_STATUS=${page.status} LOCATION=${page.location ?? "none"}`);
}

const assetUrls = new Set<string>();
for (const page of pages) {
  for (const asset of scriptsFromHtml(page.text, page.url)) assetUrls.add(asset);
}
const assets: FetchResult[] = [];
for (const url of [...assetUrls].slice(0, MAX_ASSETS)) {
  try {
    assets.push(await get(url));
  } catch {
    // A missing public chunk is not a write-path concern.
  }
}
console.log(`SCRIPT_ASSET_COUNT=${assets.length}`);
console.log(`SCRIPT_ASSETS=${JSON.stringify(assets.map((asset) => asset.url))}`);

const sources = [...pages, ...assets];
const needles = [
  "wallet_sig_ts",
  "wallet_sig",
  "signMessage",
  "signmessage",
  "login message",
  "Sign in to Atelier",
  "Atelier login",
  "/api/upload",
  "FormData",
  "formData.append",
  "deliverable_url",
  "webhook_secret",
];
const findings: Array<{ source: string; needle: string; snippets: string[] }> = [];
for (const source of sources) {
  for (const needle of needles) {
    const snippets = around(source.text, needle);
    if (snippets.length) findings.push({ source: source.url, needle, snippets });
  }
}

console.log(`FINDING_GROUP_COUNT=${findings.length}`);
console.log(`FINDINGS=${JSON.stringify(findings).slice(0, 120000)}`);

const allText = sources.map((source) => source.text).join("\n");
const walletMessageCandidates = new Set<string>();
for (const match of allText.matchAll(/["'`]([^"'`\n]{5,220}(?:Atelier|atelier)[^"'`\n]{0,220})["'`]/g)) {
  const value = match[1]?.replace(/\\n/g, "\\n").trim();
  if (value && /sign|login|auth|wallet|timestamp|verify/i.test(value)) walletMessageCandidates.add(value.slice(0, 500));
}
console.log(`WALLET_MESSAGE_CANDIDATES=${JSON.stringify([...walletMessageCandidates].slice(0, 60))}`);

const uploadSnippets = findings
  .filter((finding) => /upload|formdata/i.test(finding.needle))
  .flatMap((finding) => finding.snippets)
  .slice(0, 60);
console.log(`UPLOAD_SNIPPETS=${JSON.stringify(uploadSnippets).slice(0, 60000)}`);
console.log(`WALLET_SIG_TS_EVIDENCE=${allText.includes("wallet_sig_ts") ? "yes" : "no"}`);
console.log(`UPLOAD_ROUTE_EVIDENCE=${allText.includes("/api/upload") ? "yes" : "no"}`);
console.log(`FORMDATA_EVIDENCE=${/FormData|formData/i.test(allText) ? "yes" : "no"}`);
console.log("AUTHENTICATION_USED=no");
console.log("HTTP_METHODS_USED=GET_ONLY");
console.log("WALLET_SIGNATURE_CREATED=no");
console.log("UPLOAD_EXECUTED=no");
console.log("AGENT_REGISTRATION_EXECUTED=no");
console.log("SERVICE_LISTING_EXECUTED=no");
console.log("FINANCIAL_ACTION_EXECUTED=no");
console.log("BLOCKCHAIN_TX_EXECUTED=no");
console.log("WRITE_ACTION_EXECUTED=no");
