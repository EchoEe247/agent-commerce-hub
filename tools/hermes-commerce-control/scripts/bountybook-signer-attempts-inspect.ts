import { getBountyBookSignerToken } from "../src/security/bountybook-signer-client.js";

const API = "https://api.bountybook.ai";
const JOB_ID = "733d4731-7e60-4bb8-9233-ba3771c779d3";
const EXPECTED_ADDRESS = "0x24c1eDF600815c29726F7B7719096314a76C12E5";

type JsonObject = Record<string, unknown>;

interface HttpJson {
  readonly status: number;
  readonly body: JsonObject;
}

async function requestJson(url: string, init?: RequestInit): Promise<HttpJson> {
  const response = await fetch(url, { ...init, signal: AbortSignal.timeout(20_000) });
  let body: unknown = {};
  try {
    body = await response.json();
  } catch {
    body = {};
  }
  if (body === null || typeof body !== "object" || Array.isArray(body)) body = {};
  return { status: response.status, body: body as JsonObject };
}

function unwrapJob(body: JsonObject): JsonObject {
  const candidate = body.job;
  return candidate !== null && typeof candidate === "object" && !Array.isArray(candidate)
    ? (candidate as JsonObject)
    : body;
}

function sanitize(value: unknown, depth = 0): unknown {
  if (depth > 6) return "[depth-limited]";
  if (Array.isArray(value)) return value.map((entry) => sanitize(entry, depth + 1));
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
  if (typeof value === "string") return value.replace(/\s+/g, " ").slice(0, 2000);
  return value;
}

function addressOf(entry: JsonObject): string {
  const raw = entry.executor_address ?? entry.executorAddress ?? entry.address;
  return typeof raw === "string" ? raw.toLowerCase() : "";
}

function createdAtOf(entry: JsonObject): number {
  const raw = entry.created_at ?? entry.createdAt ?? entry.timestamp;
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  if (typeof raw === "string") {
    const numeric = Number(raw);
    if (Number.isFinite(numeric)) return numeric;
    const parsed = Date.parse(raw);
    if (Number.isFinite(parsed)) return Math.floor(parsed / 1000);
  }
  return 0;
}

async function main(): Promise<void> {
  const session = await getBountyBookSignerToken();
  if (session.address.toLowerCase() !== EXPECTED_ADDRESS.toLowerCase()) {
    throw new Error(`signer broker address mismatch: ${session.address}`);
  }

  const [jobResponse, statusResponse, reputationResponse, oracleResponse] = await Promise.all([
    requestJson(`${API}/jobs/${JOB_ID}`, {
      headers: { Authorization: `Bearer ${session.token}` },
    }),
    requestJson(`${API}/jobs/${JOB_ID}/status`, {
      headers: { Authorization: `Bearer ${session.token}` },
    }),
    requestJson(`${API}/reputation/${session.address}`),
    requestJson(`${API}/oracle/stats`),
  ]);

  const job = unwrapJob(jobResponse.body);
  const attemptsRaw = job.attempts;
  const attempts = Array.isArray(attemptsRaw)
    ? attemptsRaw.filter(
        (entry): entry is JsonObject =>
          entry !== null && typeof entry === "object" && !Array.isArray(entry),
      )
    : [];

  const signerAttempts = attempts
    .filter((entry) => addressOf(entry) === EXPECTED_ADDRESS.toLowerCase())
    .sort((a, b) => createdAtOf(a) - createdAtOf(b));

  console.log("AUTH_SOURCE=memory_signer_broker");
  console.log(`TOKEN_WAS_CACHED=${session.cached ? "yes" : "no"}`);
  console.log(`JOB_HTTP_STATUS=${jobResponse.status}`);
  console.log(`JOB_STATUS=${String(job.status ?? "unknown")}`);
  console.log(`JOB_EXECUTOR_ADDRESS=${String(job.executor_address ?? job.executorAddress ?? "none")}`);
  console.log(`JOB_VERIFICATION_RESULT=${JSON.stringify(sanitize(job.verification_result ?? job.verificationResult ?? null)).slice(0, 4000)}`);
  console.log(`GLOBAL_ATTEMPT_COUNT=${attempts.length}`);
  console.log(`SIGNER_ATTEMPT_COUNT=${signerAttempts.length}`);
  console.log(`SIGNER_ATTEMPTS=${JSON.stringify(sanitize(signerAttempts)).slice(0, 12000)}`);
  console.log(`STATUS_HTTP_STATUS=${statusResponse.status}`);
  console.log(`STATUS_SANITIZED=${JSON.stringify(sanitize(statusResponse.body)).slice(0, 5000)}`);
  console.log(`REPUTATION_HTTP_STATUS=${reputationResponse.status}`);
  console.log(`REPUTATION_SANITIZED=${JSON.stringify(sanitize(reputationResponse.body)).slice(0, 5000)}`);
  console.log(`ORACLE_STATS_HTTP_STATUS=${oracleResponse.status}`);
  console.log(`ORACLE_STATS_RAW=${JSON.stringify(sanitize(oracleResponse.body)).slice(0, 5000)}`);
  console.log("NOTE_SIGNER_SCOPE=fresh_dedicated_signer_has_only_been_used_for_this_bounty");
  console.log("WRITE_ACTION_EXECUTED=no");
  console.log("CLAIM_EXECUTED=no");
  console.log("SUBMISSION_EXECUTED=no");
  console.log("DISPUTE_EXECUTED=no");
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`SIGNER_ATTEMPT_INSPECT_FAILED=${message.slice(0, 800)}`);
  console.error("WRITE_ACTION_EXECUTED=no");
  process.exitCode = 1;
});
