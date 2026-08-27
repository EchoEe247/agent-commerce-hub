import { homedir } from "node:os";
import { join } from "node:path";
import { privateKeyToAccount } from "viem/accounts";
import {
  decryptSecret,
  readEncryptedSecretFile,
} from "../src/security/encrypted-secret-store.js";

const API = "https://api.bountybook.ai";
const JOB_ID = "733d4731-7e60-4bb8-9233-ba3771c779d3";
const EXPECTED_ADDRESS = "0x24c1eDF600815c29726F7B7719096314a76C12E5";
const DEFAULT_KEYSTORE = join(
  homedir(),
  ".hermes",
  "commerce-control",
  "secrets",
  "bountybook-auth.keystore.json",
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
  const job = body.job;
  return job !== null && typeof job === "object" && !Array.isArray(job)
    ? (job as JsonObject)
    : body;
}

function scalar(value: unknown): string {
  if (typeof value === "string") return value.replace(/\s+/g, " ").trim().slice(0, 1200) || "none";
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (value === null || value === undefined) return "none";
  try {
    return JSON.stringify(value).replace(/\s+/g, " ").slice(0, 1200);
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

function safeAttemptMetadata(value: unknown): unknown {
  if (!Array.isArray(value)) return value;
  return value.slice(-5).map((entry) => {
    if (entry === null || typeof entry !== "object" || Array.isArray(entry)) return entry;
    const obj = entry as JsonObject;
    const out: JsonObject = {};
    for (const [key, val] of Object.entries(obj)) {
      const lower = key.toLowerCase();
      if (/output|content|private|token|signature|secret|key/.test(lower)) continue;
      if (/id|status|reason|error|reject|fail|verif|check|result|score|address|created|updated|time|attempt/.test(lower)) {
        out[key] = val;
      }
    }
    return out;
  });
}

function findAttemptContainer(job: JsonObject): { key: string; value: unknown } | null {
  for (const key of [
    "attempts",
    "attempt_history",
    "attemptHistory",
    "submissions",
    "verification_attempts",
    "verificationAttempts",
    "history",
  ]) {
    if (key in job) return { key, value: job[key] };
  }
  return null;
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
  const passphrase = process.env.BOUNTYBOOK_KEYSTORE_PASSPHRASE;
  delete process.env.BOUNTYBOOK_KEYSTORE_PASSPHRASE;
  if (!passphrase) throw new Error("BOUNTYBOOK_KEYSTORE_PASSPHRASE is required");

  const keystorePath = process.env.BOUNTYBOOK_KEYSTORE_PATH?.trim() || DEFAULT_KEYSTORE;
  delete process.env.BOUNTYBOOK_KEYSTORE_PATH;

  const envelope = readEncryptedSecretFile(keystorePath);
  if (
    envelope.publicMetadata.address?.toLowerCase() !== EXPECTED_ADDRESS.toLowerCase() ||
    envelope.publicMetadata.chain !== "eip155:8453" ||
    envelope.publicMetadata.purpose !== "bountybook-auth"
  ) {
    throw new Error("keystore metadata does not match the dedicated BountyBook signer");
  }

  const secret = decryptSecret(envelope, passphrase);
  let account: ReturnType<typeof privateKeyToAccount>;
  try {
    account = privateKeyToAccount(`0x${secret.toString("hex")}` as `0x${string}`);
  } finally {
    secret.fill(0);
  }
  if (account.address.toLowerCase() !== EXPECTED_ADDRESS.toLowerCase()) {
    throw new Error("decrypted signer does not match expected address");
  }

  const token = await authenticate(account);
  const [jobResponse, oracleResponse, reputationResponse] = await Promise.all([
    requestJson(`${API}/jobs/${JOB_ID}`, {
      headers: { Authorization: `Bearer ${token}` },
    }),
    requestJson(`${API}/oracle/stats`),
    requestJson(`${API}/reputation/${account.address}`),
  ]);

  const job = unwrapJob(jobResponse.body);
  const attemptContainer = findAttemptContainer(job);
  const attempts = attemptContainer?.value;
  const attemptCount = Array.isArray(attempts) ? attempts.length : "unknown";

  console.log(`JOB_HTTP_STATUS=${jobResponse.status}`);
  console.log(`JOB_STATUS=${scalar(first(job, ["status"]))}`);
  console.log(`EXECUTOR_ADDRESS=${scalar(first(job, ["executor_address", "executorAddress"]))}`);
  console.log(`PAYOUT_STATUS=${scalar(first(job, ["payout_status", "payoutStatus"]))}`);
  console.log(`PAYOUT_TX_HASH=${scalar(first(job, ["payout_tx_hash", "payoutTxHash"]))}`);
  console.log(`LAST_REJECTION=${scalar(first(job, ["last_rejection", "lastRejection"]))}`);
  console.log(`VERIFICATION_RESULT=${scalar(first(job, ["verification_result", "verificationResult"]))}`);
  console.log(`VERIFICATION_STATUS=${scalar(first(job, ["verification_status", "verificationStatus"]))}`);
  console.log(`ATTEMPT_CONTAINER=${attemptContainer?.key ?? "none"}`);
  console.log(`ATTEMPT_COUNT=${attemptCount}`);
  console.log(`ATTEMPT_METADATA=${scalar(safeAttemptMetadata(attempts))}`);
  console.log(`ORACLE_STATS_HTTP_STATUS=${oracleResponse.status}`);
  console.log(`ORACLE_STATS=${scalar(oracleResponse.body)}`);
  console.log(`REPUTATION_HTTP_STATUS=${reputationResponse.status}`);
  console.log(`REPUTATION=${scalar(reputationResponse.body)}`);
  console.log("WRITE_ACTION_EXECUTED=no");
  console.log("CLAIM_EXECUTED=no");
  console.log("SUBMISSION_EXECUTED=no");
  console.log("DISPUTE_EXECUTED=no");
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`FAILURE_INSPECT_FAILED=${message}`);
  console.error("WRITE_ACTION_EXECUTED=no");
  process.exitCode = 1;
});
