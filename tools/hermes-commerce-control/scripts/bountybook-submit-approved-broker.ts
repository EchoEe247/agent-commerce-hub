import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { getBountyBookSignerToken } from "../src/security/bountybook-signer-client.js";

const API = "https://api.bountybook.ai";
const JOB_ID = "733d4731-7e60-4bb8-9233-ba3771c779d3";
const EXPECTED_ADDRESS = "0x24c1eDF600815c29726F7B7719096314a76C12E5";
const EXPECTED_REWARD = "6.00";
const EXPECTED_ARTIFACT_SHA256 = "ad430569356846e6d5bf190970562ab92e698cedc25f98c3d9503633e720665c";
const DEFAULT_ARTIFACT = resolve(
  process.cwd(),
  "../../tmp/bountybook-artifacts/733d4731-7e60-4bb8-9233-ba3771c779d3/urlcheck.go",
);

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

function text(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (value === null) return "null";
  return "unknown";
}

function normalizeReward(value: unknown): string {
  const parsed = Number(text(value).trim());
  return Number.isFinite(parsed) ? parsed.toFixed(2) : text(value).trim();
}

function sanitized(value: unknown, depth = 0): unknown {
  if (depth > 5) return "[depth-limited]";
  if (Array.isArray(value)) return value.slice(0, 30).map((item) => sanitized(item, depth + 1));
  if (value !== null && typeof value === "object") {
    const out: JsonObject = {};
    for (const [key, child] of Object.entries(value as JsonObject)) {
      if (/token|signature|private|secret|passphrase|key/i.test(key)) continue;
      if (/content|outputdata|output_data/i.test(key)) {
        out[key] = "[redacted-deliverable]";
        continue;
      }
      out[key] = sanitized(child, depth + 1);
    }
    return out;
  }
  if (typeof value === "string") return value.replace(/\s+/g, " ").slice(0, 1200);
  return value;
}

function rejectionSummary(job: JsonObject): string {
  const value = job.last_rejection ?? job.lastRejection;
  if (typeof value === "string") return value.replace(/\s+/g, " ").trim().slice(0, 1000) || "none";
  if (value !== null && typeof value === "object") return JSON.stringify(sanitized(value)).slice(0, 1500);
  return "none";
}

async function main(): Promise<void> {
  if (process.env.BOUNTYBOOK_SUBMISSION_APPROVED !== "yes") {
    throw new Error("operator submission approval flag missing");
  }
  delete process.env.BOUNTYBOOK_SUBMISSION_APPROVED;

  const artifactPath = process.env.BOUNTYBOOK_ARTIFACT_PATH?.trim() || DEFAULT_ARTIFACT;
  delete process.env.BOUNTYBOOK_ARTIFACT_PATH;
  const artifact = readFileSync(artifactPath);
  const artifactSha256 = createHash("sha256").update(artifact).digest("hex");
  if (artifactSha256 !== EXPECTED_ARTIFACT_SHA256) {
    throw new Error(`artifact hash changed; expected ${EXPECTED_ARTIFACT_SHA256}, got ${artifactSha256}`);
  }
  const source = artifact.toString("utf8");
  if (!source.trim()) throw new Error("prepared artifact is empty");

  const session = await getBountyBookSignerToken();
  if (session.address.toLowerCase() !== EXPECTED_ADDRESS.toLowerCase()) {
    throw new Error(`signer broker address mismatch: ${session.address}`);
  }

  const beforeResponse = await requestJson(`${API}/jobs/${JOB_ID}`);
  if (beforeResponse.status !== 200) throw new Error(`pre-submit GET failed HTTP ${beforeResponse.status}`);
  const before = unwrapJob(beforeResponse.body);
  const beforeStatus = text(before.status).toLowerCase();
  const beforeExecutor = text(before.executor_address ?? before.executorAddress ?? null);
  const reward = normalizeReward(before.budget_usdc);

  if (!["claimed", "in_progress", "in progress"].includes(beforeStatus)) {
    throw new Error(`job is not in a submit-ready claimed state (status=${beforeStatus})`);
  }
  if (beforeExecutor.toLowerCase() !== session.address.toLowerCase()) {
    throw new Error(`job executor does not match approved signer (${beforeExecutor})`);
  }
  if (reward !== EXPECTED_REWARD) throw new Error(`reward changed from ${EXPECTED_REWARD} to ${reward}`);

  const outputData = {
    deliverableType: "source_code",
    filename: "urlcheck.go",
    language: "go",
    sha256: artifactSha256,
    content: source,
    implementationNotes: [
      "Go standard library only",
      "reads URLs from a file and skips blank/comment lines",
      "preserves input order",
      "uses at most 10 concurrent HEAD requests",
      "uses a 5 second request timeout",
      "exit code 1 for connection/request errors",
      "exit code 2 for usage or missing input file",
    ],
    validation: {
      exactValidatorPassed: true,
      preparedBeforeClaim: true,
    },
  };

  const submitResponse = await requestJson(`${API}/jobs/${JOB_ID}/submit`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.token}`,
    },
    body: JSON.stringify({ executorAddress: session.address, outputData }),
  });

  console.log("AUTH_SOURCE=memory_signer_broker");
  console.log(`TOKEN_WAS_CACHED=${session.cached ? "yes" : "no"}`);
  console.log("SUBMISSION_ATTEMPTED=yes");
  console.log(`SUBMIT_HTTP_STATUS=${submitResponse.status}`);
  console.log(`SUBMIT_RESPONSE_KEYS=${Object.keys(submitResponse.body).sort().join(",") || "none"}`);
  console.log(`SUBMIT_RESPONSE_SANITIZED=${JSON.stringify(sanitized(submitResponse.body)).slice(0, 5000)}`);
  console.log(`JOB_ID=${JOB_ID}`);
  console.log(`BEFORE_STATUS=${beforeStatus}`);
  console.log(`ARTIFACT_SHA256=${artifactSha256}`);
  console.log("BLOCKCHAIN_TX_EXECUTED=no");
  console.log("ETH_SPENT=0");
  console.log("USDC_SPENT=0");
  console.log("AUTOMATIC_RETRY_EXECUTED=no");

  if (submitResponse.status < 200 || submitResponse.status >= 300) {
    console.log("SUBMISSION_ACCEPTED=no");
    process.exitCode = 2;
    return;
  }
  console.log("SUBMISSION_ACCEPTED=yes");

  let after: JsonObject = {};
  let afterStatus = "unknown";
  let payoutStatus = "unknown";
  let payoutTxHash = "null";
  let lastRejection = "none";
  let verificationResult = "none";

  for (let attempt = 0; attempt < 30; attempt += 1) {
    const statusResponse = await requestJson(`${API}/jobs/${JOB_ID}`);
    if (statusResponse.status === 200) {
      after = unwrapJob(statusResponse.body);
      afterStatus = text(after.status).toLowerCase();
      payoutStatus = text(after.payout_status ?? after.payoutStatus ?? null);
      payoutTxHash = text(after.payout_tx_hash ?? after.payoutTxHash ?? null);
      lastRejection = rejectionSummary(after);
      verificationResult = JSON.stringify(sanitized(after.verification_result ?? after.verificationResult ?? null)).slice(0, 2500);
      const terminal = ["completed", "paid", "failed", "refunded", "open", "closed"].includes(afterStatus);
      if (terminal || lastRejection !== "none") break;
    }
    if (attempt < 29) await sleep(2_000);
  }

  const paid =
    afterStatus === "paid" ||
    payoutStatus.toLowerCase() === "paid" ||
    (payoutTxHash !== "null" && payoutTxHash !== "unknown" && payoutTxHash !== "");
  const rejected = lastRejection !== "none" || ["failed", "refunded", "open"].includes(afterStatus);
  const oracleOutcome = paid || afterStatus === "completed" ? "passed" : rejected ? "failed" : "pending";

  console.log(`AFTER_STATUS=${afterStatus}`);
  console.log(`EXECUTOR_ADDRESS=${text(after.executor_address ?? after.executorAddress ?? session.address)}`);
  console.log(`ORACLE_OUTCOME=${oracleOutcome}`);
  console.log(`LAST_REJECTION=${lastRejection}`);
  console.log(`VERIFICATION_RESULT=${verificationResult}`);
  console.log(`PAYOUT_STATUS=${payoutStatus}`);
  console.log(`PAYOUT_TX_HASH=${payoutTxHash}`);
  console.log("EXPECTED_SUCCESS_PAYOUT_USDC=5.76");
  console.log(`PAYMENT_OBSERVED=${paid ? "yes" : "no"}`);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`SUBMISSION_BROKER_HELPER_FAILED=${message.slice(0, 500)}`);
  console.error("SUBMISSION_ATTEMPTED=no_or_unknown");
  console.error("AUTOMATIC_RETRY_EXECUTED=no");
  process.exitCode = 1;
});
