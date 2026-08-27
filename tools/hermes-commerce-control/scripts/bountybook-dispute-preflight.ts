import { getBountyBookSignerToken } from "../src/security/bountybook-signer-client.js";

const API = "https://api.bountybook.ai";
const JOB_ID = "733d4731-7e60-4bb8-9233-ba3771c779d3";
const EXPECTED_ADDRESS = "0x24c1eDF600815c29726F7B7719096314a76C12E5";
const ATTEMPT_IDS = new Set([
  "e5e0f903-31f7-4a95-9dbe-093cd6de5b1e",
  "278ad3c9-8b93-426b-8461-32803b3e077d",
]);

type JsonObject = Record<string, unknown>;

interface HttpResult {
  readonly status: number;
  readonly body: unknown;
  readonly allow: string | null;
}

async function request(
  method: "GET" | "OPTIONS",
  url: string,
  token?: string,
): Promise<HttpResult> {
  const response = await fetch(url, {
    method,
    headers: {
      Accept: "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    signal: AbortSignal.timeout(20_000),
  });

  let body: unknown = null;
  const text = await response.text();
  if (text.trim()) {
    try {
      body = JSON.parse(text) as unknown;
    } catch {
      body = text.slice(0, 3000);
    }
  }
  return { status: response.status, body, allow: response.headers.get("allow") };
}

function sanitize(value: unknown, depth = 0): unknown {
  if (depth > 7) return "[depth-limited]";
  if (Array.isArray(value)) return value.slice(0, 200).map((entry) => sanitize(entry, depth + 1));
  if (value !== null && typeof value === "object") {
    const out: JsonObject = {};
    for (const [key, child] of Object.entries(value as JsonObject)) {
      if (/token|signature|private|secret|passphrase|key/i.test(key)) continue;
      if (/content|outputdata|output_data|files/i.test(key)) {
        out[key] = "[redacted-deliverable]";
        continue;
      }
      out[key] = sanitize(child, depth + 1);
    }
    return out;
  }
  if (typeof value === "string") return value.replace(/\s+/g, " ").slice(0, 3000);
  return value;
}

function recordMatches(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === "string") {
    const normalized = value.toLowerCase();
    return (
      normalized === JOB_ID.toLowerCase() ||
      normalized === EXPECTED_ADDRESS.toLowerCase() ||
      ATTEMPT_IDS.has(value)
    );
  }
  if (Array.isArray(value)) return value.some(recordMatches);
  if (typeof value === "object") return Object.values(value as JsonObject).some(recordMatches);
  return false;
}

function collectMatchingRecords(value: unknown): unknown[] {
  const matches: unknown[] = [];
  const visit = (node: unknown): void => {
    if (Array.isArray(node)) {
      for (const child of node) visit(child);
      return;
    }
    if (node !== null && typeof node === "object") {
      const obj = node as JsonObject;
      if (recordMatches(obj)) matches.push(sanitize(obj));
      for (const child of Object.values(obj)) visit(child);
    }
  };
  visit(value);
  return matches.slice(0, 100);
}

function unwrapJob(value: unknown): JsonObject {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return {};
  const body = value as JsonObject;
  const job = body.job;
  return job !== null && typeof job === "object" && !Array.isArray(job)
    ? (job as JsonObject)
    : body;
}

async function main(): Promise<void> {
  const session = await getBountyBookSignerToken();
  if (session.address.toLowerCase() !== EXPECTED_ADDRESS.toLowerCase()) {
    throw new Error(`signer broker address mismatch: ${session.address}`);
  }

  const auth = session.token;
  const primaryRoute = `${API}/bounties/${JOB_ID}/dispute`;
  const alternateRoute = `${API}/jobs/${JOB_ID}/dispute`;

  const [
    jobResponse,
    statusResponse,
    disputesAll,
    disputesOpen,
    disputesJobFilter,
    disputesBountyFilter,
    primaryOptions,
    alternateOptions,
    oracleStats,
  ] = await Promise.all([
    request("GET", `${API}/jobs/${JOB_ID}`, auth),
    request("GET", `${API}/jobs/${JOB_ID}/status`, auth),
    request("GET", `${API}/disputes?status=all`, auth),
    request("GET", `${API}/disputes?status=open`, auth),
    request("GET", `${API}/disputes?status=all&job_id=${encodeURIComponent(JOB_ID)}`, auth),
    request("GET", `${API}/disputes?status=all&bounty_id=${encodeURIComponent(JOB_ID)}`, auth),
    request("OPTIONS", primaryRoute, auth),
    request("OPTIONS", alternateRoute, auth),
    request("GET", `${API}/oracle/stats`),
  ]);

  const job = unwrapJob(jobResponse.body);
  const attempts = Array.isArray(job.attempts)
    ? job.attempts.filter(
        (entry): entry is JsonObject =>
          entry !== null && typeof entry === "object" && !Array.isArray(entry),
      )
    : [];
  const signerAttempts = attempts.filter((entry) => {
    const address = entry.executor_address ?? entry.executorAddress;
    return typeof address === "string" && address.toLowerCase() === EXPECTED_ADDRESS.toLowerCase();
  });

  const allDisputeBodies = [
    disputesAll.body,
    disputesOpen.body,
    disputesJobFilter.body,
    disputesBountyFilter.body,
  ];
  const matchingDisputes = allDisputeBodies.flatMap(collectMatchingRecords);
  const uniqueMatches = [
    ...new Map(matchingDisputes.map((record) => [JSON.stringify(record), record])).values(),
  ];

  const draft = [
    "The oracle appears to have falsely failed this bounty twice due to verifier/platform errors.",
    "Attempt 1 failed before any checks with an ipfs_fetch JavaScript exception.",
    "Attempt 2 used the live code_test contract's required file urlcheck.go and the exact preflighted artifact (3559 bytes, 160 lines), but the verifier reported 'Code output too small: 0 lines'.",
    "The platform's visible attempt history currently contains no successful attempts and shows systemic ipfs_fetch/sufficient_code failures.",
    "Please manually review attempt 278ad3c9-8b93-426b-8461-32803b3e077d and uphold the dispute if the submitted file matches the bounty's test contract.",
  ].join(" ");

  console.log("AUTH_SOURCE=memory_signer_broker");
  console.log(`TOKEN_WAS_CACHED=${session.cached ? "yes" : "no"}`);
  console.log(`JOB_ID=${JOB_ID}`);
  console.log(`SIGNER_ADDRESS=${session.address}`);
  console.log(`JOB_HTTP_STATUS=${jobResponse.status}`);
  console.log(`JOB_STATUS=${String(job.status ?? "unknown")}`);
  console.log(`JOB_EXECUTOR_ADDRESS=${String(job.executor_address ?? job.executorAddress ?? "none")}`);
  console.log(`JOB_PAYOUT_STATUS=${String(job.payout_status ?? job.payoutStatus ?? "none")}`);
  console.log(`SIGNER_ATTEMPT_COUNT=${signerAttempts.length}`);
  console.log(`SIGNER_ATTEMPTS=${JSON.stringify(sanitize(signerAttempts)).slice(0, 12000)}`);
  console.log(`STATUS_HTTP_STATUS=${statusResponse.status}`);
  console.log(`STATUS_SANITIZED=${JSON.stringify(sanitize(statusResponse.body)).slice(0, 5000)}`);

  console.log(`DISPUTES_ALL_HTTP_STATUS=${disputesAll.status}`);
  console.log(`DISPUTES_ALL_SANITIZED=${JSON.stringify(sanitize(disputesAll.body)).slice(0, 10000)}`);
  console.log(`DISPUTES_OPEN_HTTP_STATUS=${disputesOpen.status}`);
  console.log(`DISPUTES_JOB_FILTER_HTTP_STATUS=${disputesJobFilter.status}`);
  console.log(`DISPUTES_JOB_FILTER_SANITIZED=${JSON.stringify(sanitize(disputesJobFilter.body)).slice(0, 8000)}`);
  console.log(`DISPUTES_BOUNTY_FILTER_HTTP_STATUS=${disputesBountyFilter.status}`);
  console.log(`DISPUTES_BOUNTY_FILTER_SANITIZED=${JSON.stringify(sanitize(disputesBountyFilter.body)).slice(0, 8000)}`);
  console.log(`MATCHING_DISPUTE_RECORD_COUNT=${uniqueMatches.length}`);
  console.log(`MATCHING_DISPUTE_RECORDS=${JSON.stringify(uniqueMatches).slice(0, 12000)}`);

  console.log(`PRIMARY_DISPUTE_ROUTE=${primaryRoute}`);
  console.log(`PRIMARY_DISPUTE_OPTIONS_HTTP_STATUS=${primaryOptions.status}`);
  console.log(`PRIMARY_DISPUTE_ALLOW=${primaryOptions.allow ?? "none"}`);
  console.log(`PRIMARY_DISPUTE_OPTIONS_BODY=${JSON.stringify(sanitize(primaryOptions.body)).slice(0, 3000)}`);
  console.log(`ALTERNATE_DISPUTE_ROUTE=${alternateRoute}`);
  console.log(`ALTERNATE_DISPUTE_OPTIONS_HTTP_STATUS=${alternateOptions.status}`);
  console.log(`ALTERNATE_DISPUTE_ALLOW=${alternateOptions.allow ?? "none"}`);
  console.log(`ALTERNATE_DISPUTE_OPTIONS_BODY=${JSON.stringify(sanitize(alternateOptions.body)).slice(0, 3000)}`);

  console.log(`ORACLE_STATS_HTTP_STATUS=${oracleStats.status}`);
  console.log(`ORACLE_STATS_RAW=${JSON.stringify(sanitize(oracleStats.body)).slice(0, 5000)}`);
  console.log(`DISPUTE_DRAFT=${draft}`);
  console.log(`DISPUTE_DRAFT_LENGTH=${draft.length}`);
  console.log("DISPUTE_BODY_SCHEMA_CONFIRMED=no");
  console.log("DISPUTE_ELIGIBILITY_CONFIRMED=no");
  console.log("DISPUTE_EXECUTED=no");
  console.log("WRITE_ACTION_EXECUTED=no");
  console.log("FINANCIAL_ACTION_EXECUTED=no");
  console.log("BLOCKCHAIN_TX_EXECUTED=no");
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`DISPUTE_PREFLIGHT_FAILED=${message.slice(0, 1000)}`);
  console.error("DISPUTE_EXECUTED=no");
  console.error("WRITE_ACTION_EXECUTED=no");
  process.exitCode = 1;
});
