import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  buildCodeTestOutputData,
  readCodeTestContract,
} from "../src/bountybook/code-test-submission.js";

const API = "https://api.bountybook.ai";
const JOB_ID = "733d4731-7e60-4bb8-9233-ba3771c779d3";
const EXPECTED_REWARD = "6.00";
const EXPECTED_FILENAME = "urlcheck.go";
const EXPECTED_ARTIFACT_SHA256 = "ad430569356846e6d5bf190970562ab92e698cedc25f98c3d9503633e720665c";
const DEFAULT_ARTIFACT = resolve(
  process.cwd(),
  "../../tmp/bountybook-artifacts/733d4731-7e60-4bb8-9233-ba3771c779d3/urlcheck.go",
);

type JsonObject = Record<string, unknown>;

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

async function main(): Promise<void> {
  const artifactPath = process.env.BOUNTYBOOK_ARTIFACT_PATH?.trim() || DEFAULT_ARTIFACT;
  delete process.env.BOUNTYBOOK_ARTIFACT_PATH;
  const artifact = readFileSync(artifactPath);
  const artifactSha256 = createHash("sha256").update(artifact).digest("hex");
  const source = artifact.toString("utf8");

  const response = await fetch(`${API}/jobs/${JOB_ID}`, { signal: AbortSignal.timeout(20_000) });
  let raw: unknown = {};
  try {
    raw = await response.json();
  } catch {
    raw = {};
  }
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) raw = {};
  if (response.status !== 200) throw new Error(`job GET failed HTTP ${response.status}`);

  const job = unwrapJob(raw as JsonObject);
  const reward = normalizeReward(job.budget_usdc);
  if (reward !== EXPECTED_REWARD) throw new Error(`reward changed from ${EXPECTED_REWARD} to ${reward}`);
  if (artifactSha256 !== EXPECTED_ARTIFACT_SHA256) {
    throw new Error(`artifact hash changed; expected ${EXPECTED_ARTIFACT_SHA256}, got ${artifactSha256}`);
  }

  const contract = readCodeTestContract(job, EXPECTED_FILENAME);
  const outputData = buildCodeTestOutputData(EXPECTED_FILENAME, source);
  const files = outputData.files;
  const fileContents = files[EXPECTED_FILENAME] ?? "";

  console.log(`JOB_ID=${JOB_ID}`);
  console.log(`JOB_STATUS=${text(job.status).toLowerCase()}`);
  console.log(`EXECUTOR_ADDRESS=${text(job.executor_address ?? job.executorAddress ?? null)}`);
  console.log(`REWARD_USDC=${reward}`);
  console.log(`SUCCESS_CONDITION_TYPE=${contract.type}`);
  console.log(`REQUIRED_FILES=${contract.requiredFiles.join(",")}`);
  console.log(`TEST_LANGUAGE=${contract.language ?? "unknown"}`);
  console.log("PLANNED_OUTPUT_DATA_SHAPE=files_map");
  console.log(`PLANNED_OUTPUT_FILE=${EXPECTED_FILENAME}`);
  console.log(`PLANNED_OUTPUT_FILE_BYTES=${Buffer.byteLength(fileContents, "utf8")}`);
  console.log(`PLANNED_OUTPUT_FILE_LINES=${fileContents.split(/\r?\n/).length}`);
  console.log(`ARTIFACT_SHA256=${artifactSha256}`);
  console.log(`ARTIFACT_HASH_MATCH=${artifactSha256 === EXPECTED_ARTIFACT_SHA256 ? "yes" : "no"}`);
  console.log("PREFLIGHT_PASS=yes");
  console.log("WRITE_ACTION_EXECUTED=no");
  console.log("CLAIM_EXECUTED=no");
  console.log("SUBMISSION_EXECUTED=no");
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`PREFLIGHT_PASS=no`);
  console.error(`PREFLIGHT_ERROR=${message.slice(0, 800)}`);
  console.error("WRITE_ACTION_EXECUTED=no");
  process.exitCode = 1;
});
