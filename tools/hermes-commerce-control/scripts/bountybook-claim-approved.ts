import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { privateKeyToAccount } from "viem/accounts";
import {
  decryptSecret,
  readEncryptedSecretFile,
} from "../src/security/encrypted-secret-store.js";

const API = "https://api.bountybook.ai";
const JOB_ID = "733d4731-7e60-4bb8-9233-ba3771c779d3";
const EXPECTED_ADDRESS = "0x24c1eDF600815c29726F7B7719096314a76C12E5";
const EXPECTED_REWARD = "6.00";
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
    signal: AbortSignal.timeout(15_000),
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

async function main(): Promise<void> {
  if (process.env.BOUNTYBOOK_CLAIM_APPROVED !== "yes") {
    throw new Error("operator claim approval flag missing");
  }
  delete process.env.BOUNTYBOOK_CLAIM_APPROVED;

  const passphrase = process.env.BOUNTYBOOK_KEYSTORE_PASSPHRASE;
  delete process.env.BOUNTYBOOK_KEYSTORE_PASSPHRASE;
  if (!passphrase) throw new Error("BOUNTYBOOK_KEYSTORE_PASSPHRASE is required");

  const keystorePath = process.env.BOUNTYBOOK_KEYSTORE_PATH?.trim() || DEFAULT_KEYSTORE;
  const artifactPath = process.env.BOUNTYBOOK_ARTIFACT_PATH?.trim() || DEFAULT_ARTIFACT;
  delete process.env.BOUNTYBOOK_KEYSTORE_PATH;
  delete process.env.BOUNTYBOOK_ARTIFACT_PATH;

  const artifact = readFileSync(artifactPath);
  const artifactSha256 = createHash("sha256").update(artifact).digest("hex");

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
    throw new Error(`pre-claim GET failed HTTP ${beforeResponse.status}`);
  }
  const before = unwrapJob(beforeResponse.body);
  const beforeStatus = text(before.status).toLowerCase();
  const beforeExecutor = before.executor_address ?? before.executorAddress ?? null;
  const reward = normalizeReward(before.budget_usdc);

  if (beforeStatus !== "open") throw new Error(`job is no longer open (status=${beforeStatus})`);
  if (!(beforeExecutor === null || beforeExecutor === "")) {
    throw new Error("job already has an executor");
  }
  if (reward !== EXPECTED_REWARD) throw new Error(`reward changed from ${EXPECTED_REWARD} to ${reward}`);

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

  // BountyBook's current public docs explicitly use txHash:"0x" for the free,
  // HTTP-only agent claim path. This is not a blockchain transaction hash and
  // this helper never creates or broadcasts a chain transaction.
  const claimResponse = await requestJson(`${API}/jobs/${JOB_ID}/claim`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ executorAddress: account.address, txHash: "0x" }),
  });

  if (claimResponse.status < 200 || claimResponse.status >= 300) {
    console.log("CLAIM_ATTEMPTED=yes");
    console.log("CLAIM_SUCCESS=no");
    console.log(`JOB_ID=${JOB_ID}`);
    console.log(`BEFORE_STATUS=${beforeStatus}`);
    console.log(`CLAIM_HTTP_STATUS=${claimResponse.status}`);
    console.log(`CLAIM_ERROR=${sanitizeApiError(claimResponse.body)}`);
    console.log("BLOCKCHAIN_TX_EXECUTED=no");
    console.log("ETH_SPENT=0");
    console.log("USDC_SPENT=0");
    console.log(`ARTIFACT_SHA256=${artifactSha256}`);
    console.log("SUBMISSION_EXECUTED=no");
    console.log("READY_FOR_SUBMISSION_APPROVAL=no");
    process.exitCode = 2;
    return;
  }

  const afterResponse = await requestJson(`${API}/jobs/${JOB_ID}`);
  if (afterResponse.status !== 200) {
    throw new Error(`post-claim GET failed HTTP ${afterResponse.status}`);
  }
  const after = unwrapJob(afterResponse.body);
  const afterStatus = text(after.status).toLowerCase();
  const afterExecutor = text(after.executor_address ?? after.executorAddress ?? null);
  const payoutStatus = text(after.payout_status ?? after.payoutStatus ?? null);
  const executorMatches = afterExecutor.toLowerCase() === account.address.toLowerCase();
  const claimedState = ["claimed", "in_progress", "in progress"].includes(afterStatus);
  const claimSuccess = executorMatches && claimedState;

  console.log("CLAIM_ATTEMPTED=yes");
  console.log(`CLAIM_SUCCESS=${claimSuccess ? "yes" : "no"}`);
  console.log(`JOB_ID=${JOB_ID}`);
  console.log(`BEFORE_STATUS=${beforeStatus}`);
  console.log(`AFTER_STATUS=${afterStatus}`);
  console.log(`EXECUTOR_ADDRESS=${afterExecutor}`);
  console.log(`CLAIM_HTTP_STATUS=${claimResponse.status}`);
  console.log("BLOCKCHAIN_TX_EXECUTED=no");
  console.log("ETH_SPENT=0");
  console.log("USDC_SPENT=0");
  console.log(`PAYOUT_STATUS=${payoutStatus}`);
  console.log(`ARTIFACT_SHA256=${artifactSha256}`);
  console.log("SUBMISSION_EXECUTED=no");
  console.log(`READY_FOR_SUBMISSION_APPROVAL=${claimSuccess ? "yes" : "no"}`);

  if (!claimSuccess) process.exitCode = 3;
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`CLAIM_HELPER_FAILED=${message}`);
  console.error("CLAIM_ATTEMPTED=no_or_unknown");
  console.error("SUBMISSION_EXECUTED=no");
  process.exitCode = 1;
});
