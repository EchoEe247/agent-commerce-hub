import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
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
  if (depth > 4) return "[depth-limited]";
  if (Array.isArray(value)) return value.slice(0, 20).map((item) => sanitized(item, depth + 1));
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
  if (typeof value === "string") return value.replace(/\s+/g, " ").slice(0, 1000);
  return value;
}

async function main(): Promise<void> {
  if (process.env.BOUNTYBOOK_CLAIM_APPROVED !== "yes") {
    throw new Error("operator claim approval flag missing");
  }
  delete process.env.BOUNTYBOOK_CLAIM_APPROVED;

  const artifactPath = process.env.BOUNTYBOOK_ARTIFACT_PATH?.trim() || DEFAULT_ARTIFACT;
  delete process.env.BOUNTYBOOK_ARTIFACT_PATH;
  const artifact = readFileSync(artifactPath);
  const artifactSha256 = createHash("sha256").update(artifact).digest("hex");
  if (artifactSha256 !== EXPECTED_ARTIFACT_SHA256) {
    throw new Error(`artifact hash changed; expected ${EXPECTED_ARTIFACT_SHA256}, got ${artifactSha256}`);
  }

  const session = await getBountyBookSignerToken();
  if (session.address.toLowerCase() !== EXPECTED_ADDRESS.toLowerCase()) {
    throw new Error(`signer broker address mismatch: ${session.address}`);
  }

  const beforeResponse = await requestJson(`${API}/jobs/${JOB_ID}`);
  if (beforeResponse.status !== 200) throw new Error(`pre-claim GET failed HTTP ${beforeResponse.status}`);
  const before = unwrapJob(beforeResponse.body);
  const beforeStatus = text(before.status).toLowerCase();
  const beforeExecutor = before.executor_address ?? before.executorAddress ?? null;
  const reward = normalizeReward(before.budget_usdc);

  if (beforeStatus !== "open") throw new Error(`job is no longer open (status=${beforeStatus})`);
  if (!(beforeExecutor === null || beforeExecutor === "")) throw new Error("job already has an executor");
  if (reward !== EXPECTED_REWARD) throw new Error(`reward changed from ${EXPECTED_REWARD} to ${reward}`);

  const claimResponse = await requestJson(`${API}/jobs/${JOB_ID}/claim`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.token}`,
    },
    body: JSON.stringify({ executorAddress: session.address, txHash: "0x" }),
  });

  console.log("AUTH_SOURCE=memory_signer_broker");
  console.log(`TOKEN_WAS_CACHED=${session.cached ? "yes" : "no"}`);
  console.log("CLAIM_ATTEMPTED=yes");
  console.log(`CLAIM_HTTP_STATUS=${claimResponse.status}`);
  console.log(`CLAIM_RESPONSE_SANITIZED=${JSON.stringify(sanitized(claimResponse.body)).slice(0, 3000)}`);
  console.log(`JOB_ID=${JOB_ID}`);
  console.log(`BEFORE_STATUS=${beforeStatus}`);
  console.log(`ARTIFACT_SHA256=${artifactSha256}`);
  console.log("BLOCKCHAIN_TX_EXECUTED=no");
  console.log("ETH_SPENT=0");
  console.log("USDC_SPENT=0");
  console.log("SUBMISSION_EXECUTED=no");

  if (claimResponse.status < 200 || claimResponse.status >= 300) {
    console.log("CLAIM_SUCCESS=no");
    console.log("READY_FOR_SUBMISSION_APPROVAL=no");
    process.exitCode = 2;
    return;
  }

  const afterResponse = await requestJson(`${API}/jobs/${JOB_ID}`);
  if (afterResponse.status !== 200) throw new Error(`post-claim GET failed HTTP ${afterResponse.status}`);
  const after = unwrapJob(afterResponse.body);
  const afterStatus = text(after.status).toLowerCase();
  const afterExecutor = text(after.executor_address ?? after.executorAddress ?? null);
  const payoutStatus = text(after.payout_status ?? after.payoutStatus ?? null);
  const claimSuccess =
    afterExecutor.toLowerCase() === session.address.toLowerCase() &&
    ["claimed", "in_progress", "in progress"].includes(afterStatus);

  console.log(`CLAIM_SUCCESS=${claimSuccess ? "yes" : "no"}`);
  console.log(`AFTER_STATUS=${afterStatus}`);
  console.log(`EXECUTOR_ADDRESS=${afterExecutor}`);
  console.log(`PAYOUT_STATUS=${payoutStatus}`);
  console.log(`READY_FOR_SUBMISSION_APPROVAL=${claimSuccess ? "yes" : "no"}`);
  if (!claimSuccess) process.exitCode = 3;
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`CLAIM_BROKER_HELPER_FAILED=${message.slice(0, 500)}`);
  console.error("CLAIM_ATTEMPTED=no_or_unknown");
  console.error("SUBMISSION_EXECUTED=no");
  process.exitCode = 1;
});
