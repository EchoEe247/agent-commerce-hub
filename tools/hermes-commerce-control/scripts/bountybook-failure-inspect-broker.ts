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
  const response = await fetch(url, {
    ...init,
    signal: AbortSignal.timeout(20_000),
  });
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
  const job = body.job;
  return job !== null && typeof job === "object" && !Array.isArray(job)
    ? (job as JsonObject)
    : body;
}

function scalar(value: unknown, limit = 2000): string {
  if (typeof value === "string") return value.replace(/\s+/g, " ").trim().slice(0, limit) || "none";
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (value === null || value === undefined) return "none";
  try {
    return JSON.stringify(value).replace(/\s+/g, " ").slice(0, limit);
  } catch {
    return "unserializable";
  }
}

function first(job: JsonObject, keys: readonly string[]): unknown {
  for (const key of keys) {
    if (key in job) return job[key];
  }
  return undefined;
}

function safeObject(value: unknown): unknown {
  if (Array.isArray(value)) return value.slice(-10).map(safeObject);
  if (value === null || typeof value !== "object") return value;
  const obj = value as JsonObject;
  const out: JsonObject = {};
  for (const [key, val] of Object.entries(obj)) {
    const lower = key.toLowerCase();
    if (/token|signature|secret|private|seed|mnemonic/.test(lower)) continue;
    if (/content|outputdata|output_data|source/.test(lower)) {
      out[key] = typeof val === "string" ? `[redacted ${val.length} chars]` : "[redacted]";
      continue;
    }
    out[key] = safeObject(val);
  }
  return out;
}

function matchingAttempts(value: unknown): unknown[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry) => {
    if (entry === null || typeof entry !== "object" || Array.isArray(entry)) return false;
    const obj = entry as JsonObject;
    const id = scalar(first(obj, ["job_id", "jobId", "bounty_id", "bountyId", "id"]), 200).toLowerCase();
    return id === JOB_ID.toLowerCase();
  });
}

function findContainers(job: JsonObject): Array<{ key: string; value: unknown }> {
  const keys = [
    "attempts",
    "attempt_history",
    "attemptHistory",
    "submissions",
    "verification_attempts",
    "verificationAttempts",
    "previous_attempts",
    "previousAttempts",
    "history",
  ];
  return keys.filter((key) => key in job).map((key) => ({ key, value: job[key] }));
}

async function main(): Promise<void> {
  const session = await getBountyBookSignerToken();
  if (session.address.toLowerCase() !== EXPECTED_ADDRESS.toLowerCase()) {
    throw new Error(`signer broker address mismatch: ${session.address}`);
  }

  const authHeaders = { Authorization: `Bearer ${session.token}` };
  const candidatePaths = [
    `/jobs/${JOB_ID}/attempts`,
    `/jobs/${JOB_ID}/history`,
    `/jobs/${JOB_ID}/submissions`,
    `/jobs/${JOB_ID}/verifications`,
  ] as const;

  const [jobResponse, statusResponse, oracleResponse, reputationResponse, ...candidateResponses] = await Promise.all([
    requestJson(`${API}/jobs/${JOB_ID}`, { headers: authHeaders }),
    requestJson(`${API}/jobs/${JOB_ID}/status`, { headers: authHeaders }),
    requestJson(`${API}/oracle/stats`),
    requestJson(`${API}/reputation/${session.address}`, { headers: authHeaders }),
    ...candidatePaths.map((path) => requestJson(`${API}${path}`, { headers: authHeaders })),
  ]);

  const job = unwrapJob(jobResponse.body);
  const status = statusResponse.body;
  const containers = findContainers(job);

  console.log("BROKER_USED=yes");
  console.log("AUTH_SUCCESS=yes");
  console.log("AUTH_SOURCE=memory_signer_broker");
  console.log(`SIGNER_ADDRESS=${session.address}`);
  console.log(`TOKEN_WAS_CACHED=${session.cached ? "yes" : "no"}`);
  console.log(`JOB_HTTP_STATUS=${jobResponse.status}`);
  console.log(`JOB_STATUS=${scalar(first(job, ["status"]))}`);
  console.log(`EXECUTOR_ADDRESS=${scalar(first(job, ["executor_address", "executorAddress"]))}`);
  console.log(`PAYOUT_STATUS=${scalar(first(job, ["payout_status", "payoutStatus"]))}`);
  console.log(`PAYOUT_TX_HASH=${scalar(first(job, ["payout_tx_hash", "payoutTxHash"]))}`);
  console.log(`LAST_REJECTION=${scalar(first(job, ["last_rejection", "lastRejection"]))}`);
  console.log(`VERIFICATION_RESULT=${scalar(first(job, ["verification_result", "verificationResult"]))}`);
  console.log(`VERIFICATION_STATUS=${scalar(first(job, ["verification_status", "verificationStatus"]))}`);
  console.log(`JOB_KEYS=${Object.keys(job).sort().join(",")}`);

  console.log(`STATUS_HTTP_STATUS=${statusResponse.status}`);
  console.log(`STATUS_KEYS=${Object.keys(status).sort().join(",")}`);
  console.log(`STATUS_STATUS=${scalar(first(status, ["status"]))}`);
  console.log(`STATUS_EXECUTOR_ADDRESS=${scalar(first(status, ["executor_address", "executorAddress"]))}`);
  console.log(`STATUS_VERIFICATION_RESULT=${scalar(first(status, ["verification_result", "verificationResult"]))}`);
  console.log(`STATUS_LAST_REJECTION=${scalar(first(status, ["last_rejection", "lastRejection"]))}`);
  console.log(`STATUS_SANITIZED=${scalar(safeObject(status), 5000)}`);

  console.log(`JOB_ATTEMPT_CONTAINER_COUNT=${containers.length}`);
  for (const container of containers) {
    const total = Array.isArray(container.value) ? container.value.length : "not_array";
    const matches = matchingAttempts(container.value);
    console.log(`CONTAINER_${container.key}_TOTAL=${total}`);
    console.log(`CONTAINER_${container.key}_JOB_MATCH_COUNT=${matches.length}`);
    console.log(`CONTAINER_${container.key}_JOB_MATCHES=${scalar(safeObject(matches), 5000)}`);
    if (container.key !== "history") {
      console.log(`CONTAINER_${container.key}_SANITIZED=${scalar(safeObject(container.value), 5000)}`);
    }
  }

  for (let index = 0; index < candidatePaths.length; index += 1) {
    const path = candidatePaths[index];
    const response = candidateResponses[index];
    if (!path || !response) continue;
    const label = path.split("/").at(-1)?.toUpperCase() ?? `CANDIDATE_${index}`;
    console.log(`${label}_ENDPOINT_HTTP_STATUS=${response.status}`);
    if (response.status >= 200 && response.status < 300) {
      console.log(`${label}_ENDPOINT_KEYS=${Object.keys(response.body).sort().join(",")}`);
      console.log(`${label}_ENDPOINT_SANITIZED=${scalar(safeObject(response.body), 7000)}`);
    }
  }

  const rep = safeObject(reputationResponse.body);
  console.log(`ORACLE_STATS_HTTP_STATUS=${oracleResponse.status}`);
  console.log(`ORACLE_STATS_RAW=${scalar(oracleResponse.body, 5000)}`);
  console.log(`REPUTATION_HTTP_STATUS=${reputationResponse.status}`);
  console.log(`REPUTATION_SANITIZED=${scalar(rep, 7000)}`);
  console.log("NOTE_ATTEMPT_LIMIT=platform_changelog_states_5_submissions_per_agent_per_job");
  console.log("NOTE_GLOBAL_HISTORY=do_not_treat_unfiltered_history_length_as_job_attempt_count");
  console.log("TOKEN_PRINTED=no");
  console.log("WRITE_ACTION_EXECUTED=no");
  console.log("CLAIM_EXECUTED=no");
  console.log("SUBMISSION_EXECUTED=no");
  console.log("DISPUTE_EXECUTED=no");
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`FAILURE_INSPECT_FAILED=${message.slice(0, 500)}`);
  console.error("WRITE_ACTION_EXECUTED=no");
  process.exitCode = 1;
});
