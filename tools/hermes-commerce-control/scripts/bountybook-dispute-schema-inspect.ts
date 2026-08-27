#!/usr/bin/env node
/**
 * Read-only BountyBook dispute schema inspector.
 *
 * Purpose: discover the production frontend's dispute route/body field names
 * without issuing any mutating request. This script performs GET requests only
 * against public BountyBook frontend assets/docs and prints bounded snippets.
 *
 * It never authenticates, claims, submits, disputes, signs, spends, or moves value.
 */

const JOB_ID = "733d4731-7e60-4bb8-9233-ba3771c779d3";
const FRONTEND = "https://www.bountybook.ai";
const JOB_URL = `${FRONTEND}/job/${JOB_ID}`;
const MAX_ASSETS = 60;
const MAX_TEXT_BYTES = 2_000_000;

interface FetchResult {
  readonly url: string;
  readonly status: number;
  readonly text: string;
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function bounded(value: string, limit = 1200): string {
  const cleaned = normalizeWhitespace(value);
  return cleaned.length <= limit ? cleaned : `${cleaned.slice(0, limit)}…`;
}

export function extractScriptSources(html: string, baseUrl: string): string[] {
  const out = new Set<string>();
  const re = /<script\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi;
  for (const match of html.matchAll(re)) {
    const raw = match[1];
    if (!raw) continue;
    try {
      const url = new URL(raw, baseUrl);
      if (url.origin !== new URL(baseUrl).origin) continue;
      if (!/\.js(?:\?|$)/i.test(url.pathname + url.search)) continue;
      out.add(url.toString());
    } catch {
      // Ignore malformed public asset references.
    }
  }
  return [...out].slice(0, MAX_ASSETS);
}

export function disputeSnippets(text: string): string[] {
  const needles = [
    "/dispute",
    "dispute",
    "min 20",
    "20 characters",
    "explanation",
    "reason",
    "attemptId",
    "attempt_id",
    "verificationId",
    "verification_id",
  ];
  const snippets = new Set<string>();
  const lower = text.toLowerCase();

  for (const needle of needles) {
    const n = needle.toLowerCase();
    let from = 0;
    let hits = 0;
    while (hits < 8) {
      const index = lower.indexOf(n, from);
      if (index < 0) break;
      const start = Math.max(0, index - 500);
      const end = Math.min(text.length, index + needle.length + 800);
      snippets.add(bounded(text.slice(start, end)));
      from = index + n.length;
      hits += 1;
    }
  }
  return [...snippets].slice(0, 40);
}

async function getText(url: string): Promise<FetchResult> {
  const response = await fetch(url, {
    method: "GET",
    redirect: "follow",
    headers: {
      Accept: "text/html,text/plain,application/javascript,application/json;q=0.9,*/*;q=0.8",
      "User-Agent": "agent-commerce-hub-readonly-dispute-schema-inspector/1.0",
    },
  });

  const contentLength = Number(response.headers.get("content-length") ?? "0");
  if (Number.isFinite(contentLength) && contentLength > MAX_TEXT_BYTES) {
    return { url, status: response.status, text: `[skipped: content-length ${contentLength}]` };
  }

  const raw = await response.text();
  return { url, status: response.status, text: raw.slice(0, MAX_TEXT_BYTES) };
}

function printJson(label: string, value: unknown): void {
  process.stdout.write(`${label}=${JSON.stringify(value)}\n`);
}

const page = await getText(JOB_URL);
process.stdout.write(`JOB_PAGE_HTTP_STATUS=${page.status}\n`);
const scripts = extractScriptSources(page.text, JOB_URL);
process.stdout.write(`SCRIPT_ASSET_COUNT=${scripts.length}\n`);
printJson("SCRIPT_ASSETS", scripts);

const docsUrls = [
  `${FRONTEND}/llms.txt`,
  `${FRONTEND}/llms-full.txt`,
  `${FRONTEND}/docs`,
  `${FRONTEND}/faq`,
  `${FRONTEND}/changelog`,
];

const findings: Array<{ source: string; status: number; snippets: string[] }> = [];

for (const url of docsUrls) {
  try {
    const result = await getText(url);
    const snippets = disputeSnippets(result.text);
    if (snippets.length > 0) findings.push({ source: url, status: result.status, snippets });
    process.stdout.write(`DOC_GET=${url} HTTP_STATUS=${result.status} DISPUTE_SNIPPETS=${snippets.length}\n`);
  } catch (error) {
    process.stdout.write(`DOC_GET=${url} ERROR=${bounded(String(error), 300)}\n`);
  }
}

for (const url of scripts) {
  try {
    const result = await getText(url);
    const snippets = disputeSnippets(result.text);
    if (snippets.length > 0) findings.push({ source: url, status: result.status, snippets });
  } catch (error) {
    findings.push({ source: url, status: 0, snippets: [`fetch error: ${bounded(String(error), 300)}`] });
  }
}

const routePatterns = new Set<string>();
const bodyKeyPatterns = new Set<string>();
for (const finding of findings) {
  for (const snippet of finding.snippets) {
    for (const match of snippet.matchAll(/\/(?:bounties|jobs)\/(?:[^\s"'`]+|\$\{[^}]+\})\/dispute/gi)) {
      routePatterns.add(match[0]);
    }
    for (const match of snippet.matchAll(/(?:JSON\.stringify\s*\(\s*)?\{([^{}]{0,800})\}/g)) {
      const objectText = match[1] ?? "";
      if (!/disput|reason|explanation|attempt|verification/i.test(objectText)) continue;
      for (const keyMatch of objectText.matchAll(/(?:^|[,;])\s*([A-Za-z_$][\w$]*)\s*:/g)) {
        bodyKeyPatterns.add(keyMatch[1]!);
      }
    }
  }
}

printJson("ROUTE_PATTERNS", [...routePatterns]);
printJson("POSSIBLE_BODY_KEYS", [...bodyKeyPatterns].sort());
printJson("FINDINGS", findings);

const routeConfirmed = [...routePatterns].some((route) => /\/bounties\/.+\/dispute/i.test(route));
const hasExplanationLikeKey = [...bodyKeyPatterns].some((key) => /reason|explanation|message|details/i.test(key));

process.stdout.write(`DISPUTE_ROUTE_FRONTEND_EVIDENCE=${routeConfirmed ? "yes" : "unknown"}\n`);
process.stdout.write(`DISPUTE_BODY_KEY_EVIDENCE=${hasExplanationLikeKey ? "yes" : "unknown"}\n`);
process.stdout.write("HTTP_METHODS_USED=GET_ONLY\n");
process.stdout.write("AUTHENTICATION_USED=no\n");
process.stdout.write("WRITE_ACTION_EXECUTED=no\n");
process.stdout.write("DISPUTE_EXECUTED=no\n");
process.stdout.write("CLAIM_EXECUTED=no\n");
process.stdout.write("SUBMISSION_EXECUTED=no\n");
process.stdout.write("FINANCIAL_ACTION_EXECUTED=no\n");
process.stdout.write("BLOCKCHAIN_TX_EXECUTED=no\n");
