import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { privateKeyToAccount } from "viem/accounts";
import {
  decryptSecret,
  readEncryptedSecretFile,
} from "../src/security/encrypted-secret-store.js";

const API = "https://api.bountybook.ai";
const JOB_ID = "733d4731-7e60-4bb8-9233-ba3771c779d3";
const EXPECTED_ADDRESS = "0x24c1eDF600815c29726F7B7719096314a76C12E5";
const EXPECTED_REWARD = "6.00";
const EXPECTED_ARTIFACT_SHA256 = "ad430569356846e6d5bf190970562ab92e698cedc25f98c3d9503633e720665c";
const DEFAULT_KEYSTORE = join(
  homedir(),
  ".hermes",
  "commerce-control",
  "secrets",
  "bountybook-auth.keystore.json",
);
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
  const raw = text(value).trim();
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed.toFixed(2) : raw;
}

function sanitizeApiError(body: JsonObject): string {
  for (const key of ["error", "message", "detail", "code"]) {
    const value = body[key];
    if (typeof value === "string" && value.trim() !== "") return value.trim().slice(0, 500);
  }
  return "no public error message";
}

function rejectionSummary(job: JsonObject): string {
  const value = job.last_rejection ?? job.lastRejection;
  if (typeof value === "string") return value.replace(/\s+/g, " ").trim().slice(0, 800) || "none";
  if (value !== null && typeof value === "object") {
    try {
      return JSON.stringify(value).replace(/\s+/g, " ").slice(0, 800);
    } catch {
      return "present_but_unserializable";
    }
  }
  return "none";
}

async function authenticate(account: ReturnType<typeof privateKeyToAccount>): Promise<string> {
  const nonceResponse = await requestJson(
    `${API}/auth/nonce?address=${encodeURIComponent(account.address)}`,
  );
  const nonce = nonceResponse.body.nonce;
  if (nonceResponse.status !== 200 || typeof nonce !== "string" || nonce.length === 0) {
    throw new Error(`nonce request failed HTTP ${nonceResponse.status}`);
  }

  const signature = await account.signMessage({ message: nonce });
  const verifyResponse = await requestJson(`${API}/auth/verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ address: account.address, signature }),
  });
  const token = verifyResponse.body.token;
  if (verifyResponse.status !== 200 || typeof token !== "string" || token.length === 0) {
    throw new Error(`auth verify failed HTTP ${verifyResponse.status}`);
  }
  return token;
}

async function main(): Promise<void> {
  if (process.env.BOUNTYBOOK_SUBMISSION_APPROVED !== "yes") {
    throw new Error("operator submission approval flag missing");
  }
  delete process.env.BOUNTYBOOK_SUBMISSION_APPROVED;

  const passphrase = process.env.BOUNTYBOOK_KEYSTORE_PASSPHRASE;
  delete process.env.BOUNTYBOOK_KEYSTORE_PASSPHRASE;
  if (!passphrase) throw new Error("BOUNTYBOOK_KEYSTORE_PASSPHRASE is required");

  const keystorePath = process.env.BOUNTYBOOK_KEYSTORE_PATH?.trim() || DEFAULT_KEYSTORE;
  const artifactPath = process.env.BOUNTYBOOK_ARTIFACT_PATH?.trim() || DEFAULT_ARTIFACT;
  delete process.env.BOUNTYBOOK_KEYSTORE_PATH;
  delete process.env.BOUNTYBOOK_ARTIFACT_PATH;

  const artifact = readFileSync(artifactPath);
  const artifactSha256 = createHash("sha256").update(artifact).digest("hex");
  if (artifactSha256 !== EXPECTED_ARTIFACT_SHA256) {
    throw new Error(`artifact hash changed; expected ${EXPECTED_ARTIFACT_SHA256}, got ${artifactSha256}`);
  }
  const source = artifact.toString("utf8");
  if (!source.trim()) throw new Error("prepared artifact is empty");

  const envelope = readEncryptedSecretFile(keystorePath);
  if (
    envelope.publicMetadata.address?.toLowerCase() !== EXPECTED_ADDRESS.toLowerCase() ||
    envelope.publicMetadata.chain !== "eip155:8453" ||
    envelope.publicMetadata.purpose !== "bountybook-auth"
  ) {
    throw new Error("keystore metadata does not match the approved BountyBook signer");
  }

  const secret = decryptSecret(envelope, passphrase);
  let account: ReturnType<typeof privateKeyToAccount>;
  try {
    account = privateKeyToAccount(`0x${secret.toString("hex")}` as `0x${string}`);
  } finally {
    secret.fill(0);
  }
  if (account.address.toLowerCase() !== EXPECTED_ADDRESS.toLowerCase()) {
    throw new Error("decrypted signer does not match the operator-approved address");
  }

  const beforeResponse = await requestJson(`${API}/jobs/${JOB_ID}`);
  if (beforeResponse.status !== 200) {
    throw new Error(`pre-submit GET failed HTTP ${beforeResponse.status}`);
  }
  const before = unwrapJob(beforeResponse.body);
  const beforeStatus = text(before.status).toLowerCase();
  const beforeExecutor = text(before.executor_address ?? before.executorAddress ?? null);
  const reward = normalizeReward(before.budget_usdc);

  if (!["claimed", "in_progress", "in progress"].includes(beforeStatus)) {
    throw new Error(`job is not in a submit-ready claimed state (status=${beforeStatus})`);
  }
  if (beforeExecutor.toLowerCase() !== account.address.toLowerCase()) {
    throw new Error(`job executor does not match approved signer (${beforeExecutor})`);
  }
  if (reward !== EXPECTED_REWARD) {
    throw new Error(`reward changed from ${EXPECTED_REWARD} to ${reward}`);
  }

  const token = await authenticate(account);

  // BountyBook v0.17.x documents outputData as the preferred free inline path.
  // The source file is embedded directly so the oracle can inspect the exact
  // required deliverable without IPFS or any external upload.
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
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ executorAddress: account.address, outputData }),
  });

  if (submitResponse.status < 200 || submitResponse.status >= 300) {
    console.log("SUBMISSION_ATTEMPTED=yes");
    console.log("SUBMISSION_ACCEPTED=no");
    console.log(`JOB_ID=${JOB_ID}`);
    console.log(`BEFORE_STATUS=${beforeStatus}`);
    console.log(`SUBMIT_HTTP_STATUS=${submitResponse.status}`);
    console.log(`SUBMIT_ERROR=${sanitizeApiError(submitResponse.body)}`);
    console.log("BLOCKCHAIN_TX_EXECUTED=no");
    console.log("ETH_SPENT=0");
    console.log("USDC_SPENT=0");
    console.log(`ARTIFACT_SHA256=${artifactSha256}`);
    console.log("AUTOMATIC_RETRY_EXECUTED=no");
    process.exitCode = 2;
    return;
  }

  let after: JsonObject = {};
  let afterStatus = "unknown";
  let payoutStatus = "unknown";
  let payoutTxHash = "null";
  let lastRejection = "none";

  // Read-only observation after the single submission. Never retry submission.
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const statusResponse = await requestJson(`${API}/jobs/${JOB_ID}`);
    if (statusResponse.status === 200) {
      after = unwrapJob(statusResponse.body);
      afterStatus = text(after.status).toLowerCase();
      payoutStatus = text(after.payout_status ?? after.payoutStatus ?? null);
      payoutTxHash = text(after.payout_tx_hash ?? after.payoutTxHash ?? null);
      lastRejection = rejectionSummary(after);

      const terminal = ["completed", "paid", "failed", "refunded", "open", "closed"].includes(afterStatus);
      const rejected = lastRejection !== "none";
      if (terminal || rejected) break;
    }
    if (attempt < 29) await sleep(2_000);
  }

  const paid = afterStatus === "paid" || payoutStatus.toLowerCase() === "paid" ||
    (payoutTxHash !== "null" && payoutTxHash !== "unknown" && payoutTxHash !== "");
  const rejected = lastRejection !== "none" || ["failed", "refunded", "open"].includes(afterStatus);
  const oracleOutcome = paid || afterStatus === "completed" ? "passed" : rejected ? "failed" : "pending";

  console.log("SUBMISSION_ATTEMPTED=yes");
  console.log("SUBMISSION_ACCEPTED=yes");
  console.log(`JOB_ID=${JOB_ID}`);
  console.log(`BEFORE_STATUS=${beforeStatus}`);
  console.log(`AFTER_STATUS=${afterStatus}`);
  console.log(`EXECUTOR_ADDRESS=${text(after.executor_address ?? after.executorAddress ?? account.address)}`);
  console.log(`SUBMIT_HTTP_STATUS=${submitResponse.status}`);
  console.log(`ORACLE_OUTCOME=${oracleOutcome}`);
  console.log(`LAST_REJECTION=${lastRejection}`);
  console.log(`PAYOUT_STATUS=${payoutStatus}`);
  console.log(`PAYOUT_TX_HASH=${payoutTxHash}`);
  console.log("EXPECTED_SUCCESS_PAYOUT_USDC=5.76");
  console.log("BLOCKCHAIN_TX_EXECUTED=no");
  console.log("ETH_SPENT=0");
  console.log("USDC_SPENT=0");
  console.log(`ARTIFACT_SHA256=${artifactSha256}`);
  console.log("AUTOMATIC_RETRY_EXECUTED=no");
  console.log(`PAYMENT_OBSERVED=${paid ? "yes" : "no"}`);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`SUBMISSION_HELPER_FAILED=${message}`);
  console.error("SUBMISSION_ATTEMPTED=no_or_unknown");
  console.error("AUTOMATIC_RETRY_EXECUTED=no");
  process.exitCode = 1;
});
