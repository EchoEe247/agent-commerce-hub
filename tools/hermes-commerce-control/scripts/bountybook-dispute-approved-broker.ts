#!/usr/bin/env node
import { mkdirSync, writeFileSync, appendFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { getBountyBookSignerToken } from "../src/security/bountybook-signer-client.js";

const API = "https://api.bountybook.ai";
const JOB_ID = "733d4731-7e60-4bb8-9233-ba3771c779d3";
const EXPECTED_ADDRESS = "0x24c1eDF600815c29726F7B7719096314a76C12E5";
const EXPECTED_REWARD = "6.00";
const ATTEMPT_1 = "e5e0f903-31f7-4a95-9dbe-093cd6de5b1e";
const ATTEMPT_2 = "278ad3c9-8b93-426b-8461-32803b3e077d";
const EXPECTED_ATTEMPT_2_REASON = "Code output too small: 0 lines";
const DISPUTE_ROUTE = `${API}/jobs/${JOB_ID}/dispute`;
const DISPUTE_REASON = [
  "The oracle appears to have falsely failed this bounty due to verifier/platform errors.",
  `Attempt ${ATTEMPT_1} failed before any checks with an internal ipfs_fetch exception.`,
  `Attempt ${ATTEMPT_2} then submitted the exact preflighted urlcheck.go artifact (3559 bytes, 160 lines), matching the live code_test contract, but the verifier reported 'Code output too small: 0 lines' after output_parse, file_contents, and sufficient_code.`,
  `Please manually review attempt ${ATTEMPT_2} and its submitted urlcheck.go file.`,
  "If the stored file matches the bounty contract, please uphold the dispute.",
].join(" ");

type JsonObject = Record<string, unknown>;

interface HttpResult {
  readonly status: number;
  readonly body: unknown;
  readonly location: string | null;
}

async function request(
  method: "GET" | "POST",
  url: string,
  token: string,
  body?: unknown,
): Promise<HttpResult> {
  const response = await fetch(url, {
    method,
    redirect: "manual",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${token}`,
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(20_000),
  });

  const raw = await response.text();
  let parsed: unknown = null;
  if (raw.trim()) {
    try {
      parsed = JSON.parse(raw) as unknown;
    } catch {
      parsed = raw.slice(0, 6000);
    }
  }
  return {
    status: response.status,
    body: parsed,
    location: response.headers.get("location"),
  };
}

function asObject(value: unknown): JsonObject {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonObject)
    : {};
}

function unwrapJob(value: unknown): JsonObject {
  const body = asObject(value);
  return asObject(body.job).id ? asObject(body.job) : body;
}

function text(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (value === null) return "null";
  return "unknown";
}

function reward(value: unknown): string {
  const parsed = Number(text(value).trim());
  return Number.isFinite(parsed) ? parsed.toFixed(2) : text(value).trim();
}

function sanitize(value: unknown, depth = 0): unknown {
  if (depth > 7) return "[depth-limited]";
  if (Array.isArray(value)) return value.slice(0, 100).map((entry) => sanitize(entry, depth + 1));
  if (value !== null && typeof value === "object") {
    const out: JsonObject = {};
    for (const [key, child] of Object.entries(value as JsonObject)) {
      if (/token|signature|private|secret|passphrase|mnemonic|seed/i.test(key)) continue;
      if (/content|outputdata|output_data|files/i.test(key)) {
        out[key] = "[redacted-deliverable]";
        continue;
      }
      out[key] = sanitize(child, depth + 1);
    }
    return out;
  }
  if (typeof value === "string") return value.replace(/\s+/g, " ").slice(0, 4000);
  return value;
}

function attemptId(entry: JsonObject): string {
  return text(entry.id);
}

function attemptReason(entry: JsonObject): string {
  const verification = asObject(entry.verification_result ?? entry.verificationResult);
  return text(verification.reason);
}

function attemptPassed(entry: JsonObject): boolean | null {
  if (typeof entry.passed === "boolean") return entry.passed;
  const verification = asObject(entry.verification_result ?? entry.verificationResult);
  return typeof verification.passed === "boolean" ? verification.passed : null;
}

function signerAddress(entry: JsonObject): string {
  return text(entry.executor_address ?? entry.executorAddress).toLowerCase();
}

function hasMatchingDispute(value: unknown): boolean {
  const visit = (node: unknown): boolean => {
    if (Array.isArray(node)) return node.some(visit);
    if (node !== null && typeof node === "object") {
      const obj = node as JsonObject;
      const values = Object.values(obj);
      if (
        values.some(
          (entry) =>
            typeof entry === "string" &&
            [JOB_ID, EXPECTED_ADDRESS, ATTEMPT_1, ATTEMPT_2].some(
              (needle) => entry.toLowerCase() === needle.toLowerCase(),
            ),
        )
      ) {
        return true;
      }
      return values.some(visit);
    }
    return false;
  };
  return visit(value);
}

async function main(): Promise<void> {
  if (process.env.BOUNTYBOOK_DISPUTE_APPROVED !== "yes") {
    throw new Error("operator dispute approval flag missing");
  }
  delete process.env.BOUNTYBOOK_DISPUTE_APPROVED;

  if (DISPUTE_REASON.length < 20) throw new Error("dispute reason is below the live frontend minimum");

  const session = await getBountyBookSignerToken();
  if (session.address.toLowerCase() !== EXPECTED_ADDRESS.toLowerCase()) {
    throw new Error(`signer broker address mismatch: ${session.address}`);
  }

  const [jobResponse, existingDisputes] = await Promise.all([
    request("GET", `${API}/jobs/${JOB_ID}`, session.token),
    request("GET", `${API}/disputes?status=all&job_id=${encodeURIComponent(JOB_ID)}`, session.token),
  ]);

  if (jobResponse.status !== 200) throw new Error(`job preflight failed HTTP ${jobResponse.status}`);
  if (existingDisputes.status !== 200) {
    throw new Error(`dispute-list preflight failed HTTP ${existingDisputes.status}`);
  }
  if (hasMatchingDispute(existingDisputes.body)) {
    throw new Error("a matching dispute already exists; refusing duplicate POST");
  }

  const job = unwrapJob(jobResponse.body);
  if (text(job.id) !== JOB_ID) throw new Error(`unexpected job id ${text(job.id)}`);
  if (text(job.status).toLowerCase() !== "open") {
    throw new Error(`job state changed; expected open, got ${text(job.status)}`);
  }
  if (reward(job.budget_usdc) !== EXPECTED_REWARD) {
    throw new Error(`reward changed; expected ${EXPECTED_REWARD}, got ${reward(job.budget_usdc)}`);
  }
  const payoutStatus = text(job.payout_status ?? job.payoutStatus).toLowerCase();
  if (!["none", "null", "unknown", ""].includes(payoutStatus)) {
    throw new Error(`unexpected payout state ${payoutStatus}`);
  }

  const attempts = Array.isArray(job.attempts)
    ? job.attempts.filter(
        (entry): entry is JsonObject =>
          entry !== null && typeof entry === "object" && !Array.isArray(entry),
      )
    : [];
  const ours = attempts.filter((entry) => signerAddress(entry) === EXPECTED_ADDRESS.toLowerCase());
  const first = ours.find((entry) => attemptId(entry) === ATTEMPT_1);
  const second = ours.find((entry) => attemptId(entry) === ATTEMPT_2);
  if (!first || !second) throw new Error("expected two dedicated-signer failed attempts are not both present");
  if (attemptPassed(first) !== false || attemptPassed(second) !== false) {
    throw new Error("attempt verdict changed; refusing dispute POST");
  }
  if (attemptReason(second) !== EXPECTED_ATTEMPT_2_REASON) {
    throw new Error(`latest failure reason changed: ${attemptReason(second)}`);
  }

  const receiptDir = join(homedir(), ".hermes", "commerce-control", "receipts");
  mkdirSync(receiptDir, { recursive: true, mode: 0o700 });
  const receiptPath = join(receiptDir, `bountybook-dispute-${JOB_ID}.used`);
  const armedAt = new Date().toISOString();
  writeFileSync(
    receiptPath,
    JSON.stringify({ jobId: JOB_ID, route: DISPUTE_ROUTE, armedAt, status: "armed-before-post" }) + "\n",
    { flag: "wx", mode: 0o600 },
  );

  console.log("AUTH_SOURCE=memory_signer_broker");
  console.log(`TOKEN_WAS_CACHED=${session.cached ? "yes" : "no"}`);
  console.log(`JOB_ID=${JOB_ID}`);
  console.log(`SIGNER_ADDRESS=${session.address}`);
  console.log(`DISPUTE_ROUTE=${DISPUTE_ROUTE}`);
  console.log("DISPUTE_BODY_SCHEMA=reason_only");
  console.log(`DISPUTE_REASON_LENGTH=${DISPUTE_REASON.length}`);
  console.log(`ATTEMPT_1_CONFIRMED=${ATTEMPT_1}`);
  console.log(`ATTEMPT_2_CONFIRMED=${ATTEMPT_2}`);
  console.log("DISPUTE_AUTHORIZATION_USED=yes");
  console.log("ONE_SHOT_RECEIPT_ARMED=yes");
  console.log("DISPUTE_ATTEMPTED=yes");

  let disputeResponse: HttpResult;
  try {
    disputeResponse = await request("POST", DISPUTE_ROUTE, session.token, { reason: DISPUTE_REASON });
  } catch (error) {
    appendFileSync(
      receiptPath,
      JSON.stringify({ finishedAt: new Date().toISOString(), result: "network-or-runtime-error" }) + "\n",
    );
    throw error;
  }

  appendFileSync(
    receiptPath,
    JSON.stringify({
      finishedAt: new Date().toISOString(),
      httpStatus: disputeResponse.status,
      location: disputeResponse.location,
      result: disputeResponse.status >= 200 && disputeResponse.status < 300 ? "accepted" : "not-accepted",
    }) + "\n",
  );

  console.log(`DISPUTE_HTTP_STATUS=${disputeResponse.status}`);
  console.log(`DISPUTE_REDIRECT_LOCATION=${disputeResponse.location ?? "none"}`);
  console.log(`DISPUTE_RESPONSE_SANITIZED=${JSON.stringify(sanitize(disputeResponse.body)).slice(0, 8000)}`);
  console.log(`DISPUTE_ACCEPTED=${disputeResponse.status >= 200 && disputeResponse.status < 300 ? "yes" : "no"}`);
  console.log(`PAYMENT_REQUIRED_RESPONSE=${disputeResponse.status === 402 ? "yes" : "no"}`);
  console.log("AUTOMATIC_RETRY_EXECUTED=no");
  console.log("FALLBACK_ROUTE_POST_EXECUTED=no");
  console.log("FINANCIAL_ACTION_EXECUTED=no");
  console.log("BLOCKCHAIN_TX_EXECUTED=no");
  console.log("ETH_SPENT=0");
  console.log("USDC_SPENT=0");

  if (disputeResponse.status < 200 || disputeResponse.status >= 300) {
    process.exitCode = disputeResponse.status === 402 ? 3 : 2;
    return;
  }

  const [afterDisputes, afterStatus] = await Promise.all([
    request("GET", `${API}/disputes?status=all&job_id=${encodeURIComponent(JOB_ID)}`, session.token),
    request("GET", `${API}/jobs/${JOB_ID}/status`, session.token),
  ]);

  console.log(`AFTER_DISPUTES_HTTP_STATUS=${afterDisputes.status}`);
  console.log(`AFTER_DISPUTES_SANITIZED=${JSON.stringify(sanitize(afterDisputes.body)).slice(0, 10000)}`);
  console.log(`AFTER_STATUS_HTTP_STATUS=${afterStatus.status}`);
  console.log(`AFTER_STATUS_SANITIZED=${JSON.stringify(sanitize(afterStatus.body)).slice(0, 6000)}`);
  console.log(`DISPUTE_RECORD_OBSERVED=${hasMatchingDispute(afterDisputes.body) ? "yes" : "unknown"}`);
  console.log("THIRD_ATTEMPT_EXECUTED=no");
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`DISPUTE_HELPER_FAILED=${message.slice(0, 1200)}`);
  console.error("AUTOMATIC_RETRY_EXECUTED=no");
  console.error("FALLBACK_ROUTE_POST_EXECUTED=no");
  console.error("FINANCIAL_ACTION_EXECUTED=no");
  console.error("BLOCKCHAIN_TX_EXECUTED=no");
  process.exitCode = 1;
});
