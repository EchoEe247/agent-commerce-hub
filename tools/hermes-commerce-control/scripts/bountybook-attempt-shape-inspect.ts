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

function asObject(value: unknown): JsonObject | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonObject)
    : null;
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

function passedOf(entry: JsonObject): boolean | null {
  const verification = asObject(entry.verification_result ?? entry.verificationResult);
  const raw = verification?.passed ?? entry.passed;
  return typeof raw === "boolean" ? raw : null;
}

function reasonOf(entry: JsonObject): string {
  const verification = asObject(entry.verification_result ?? entry.verificationResult);
  const raw = verification?.reason ?? entry.reason;
  return typeof raw === "string" ? raw.replace(/\s+/g, " ").slice(0, 800) : "none";
}

function checksOf(entry: JsonObject): { run: unknown; failed: unknown } {
  const verification = asObject(entry.verification_result ?? entry.verificationResult);
  const details = asObject(verification?.details);
  return {
    run: details?.checksRun ?? details?.checks_run ?? null,
    failed: details?.checksFailed ?? details?.checks_failed ?? null,
  };
}

function stringShape(value: string): JsonObject {
  return {
    type: "string",
    chars: value.length,
    bytes: Buffer.byteLength(value, "utf8"),
    lines: value.length === 0 ? 0 : value.split(/\r?\n/).length,
    empty: value.length === 0,
  };
}

function safeShape(value: unknown, depth = 0): unknown {
  if (depth > 4) return { type: "depth_limited" };
  if (typeof value === "string") return stringShape(value);
  if (typeof value === "number" || typeof value === "boolean" || value === null) {
    return { type: value === null ? "null" : typeof value };
  }
  if (Array.isArray(value)) {
    return {
      type: "array",
      length: value.length,
      itemTypes: [...new Set(value.slice(0, 20).map((item) => (item === null ? "null" : Array.isArray(item) ? "array" : typeof item)))],
    };
  }
  const obj = asObject(value);
  if (obj) {
    const keys = Object.keys(obj).sort();
    const out: JsonObject = { type: "object", keys };
    if ("files" in obj) {
      const files = asObject(obj.files);
      if (files) {
        out.files = Object.fromEntries(
          Object.entries(files)
            .slice(0, 20)
            .map(([name, child]) => [name, safeShape(child, depth + 1)]),
        );
      } else {
        out.files = safeShape(obj.files, depth + 1);
      }
    }
    for (const key of ["content", "code", "text", "result", "output", "filename", "language"] as const) {
      if (key in obj) out[key] = safeShape(obj[key], depth + 1);
    }
    return out;
  }
  return { type: typeof value };
}

function attemptShape(entry: JsonObject): JsonObject {
  const candidateNames = [
    "output_data",
    "outputData",
    "output",
    "result",
    "content",
    "code",
    "files",
    "submission",
    "deliverable",
  ] as const;
  const payloadShapes: JsonObject = {};
  for (const key of candidateNames) {
    if (key in entry) payloadShapes[key] = safeShape(entry[key]);
  }

  const checks = checksOf(entry);
  return {
    id: typeof entry.id === "string" ? entry.id : "unknown",
    created_at: createdAtOf(entry),
    executor_address: addressOf(entry) || "unknown",
    passed: passedOf(entry),
    reason: reasonOf(entry),
    checksRun: checks.run,
    checksFailed: checks.failed,
    entryKeys: Object.keys(entry).sort(),
    payloadFieldNames: Object.keys(payloadShapes),
    payloadShapes,
  };
}

async function main(): Promise<void> {
  const session = await getBountyBookSignerToken();
  if (session.address.toLowerCase() !== EXPECTED_ADDRESS.toLowerCase()) {
    throw new Error(`signer broker address mismatch: ${session.address}`);
  }

  const jobResponse = await requestJson(`${API}/jobs/${JOB_ID}`, {
    headers: { Authorization: `Bearer ${session.token}` },
  });
  if (jobResponse.status !== 200) throw new Error(`job GET failed HTTP ${jobResponse.status}`);

  const job = unwrapJob(jobResponse.body);
  const rawAttempts = Array.isArray(job.attempts) ? job.attempts : [];
  const attempts = rawAttempts.filter(
    (entry): entry is JsonObject => entry !== null && typeof entry === "object" && !Array.isArray(entry),
  );
  const chronological = [...attempts].sort((a, b) => createdAtOf(a) - createdAtOf(b));
  const signerAttempts = chronological.filter((entry) => addressOf(entry) === EXPECTED_ADDRESS.toLowerCase());
  const recentPassed = chronological.filter((entry) => passedOf(entry) === true).slice(-20);
  const recentFailed = chronological.filter((entry) => passedOf(entry) === false).slice(-20);

  const passedReasonCounts = new Map<string, number>();
  const failedReasonCounts = new Map<string, number>();
  for (const entry of chronological) {
    const map = passedOf(entry) === true ? passedReasonCounts : passedOf(entry) === false ? failedReasonCounts : null;
    if (!map) continue;
    const reason = reasonOf(entry);
    map.set(reason, (map.get(reason) ?? 0) + 1);
  }

  console.log("AUTH_SOURCE=memory_signer_broker");
  console.log(`TOKEN_WAS_CACHED=${session.cached ? "yes" : "no"}`);
  console.log(`JOB_HTTP_STATUS=${jobResponse.status}`);
  console.log(`GLOBAL_ATTEMPT_COUNT=${attempts.length}`);
  console.log(`GLOBAL_PASS_COUNT=${chronological.filter((entry) => passedOf(entry) === true).length}`);
  console.log(`GLOBAL_FAIL_COUNT=${chronological.filter((entry) => passedOf(entry) === false).length}`);
  console.log(`SIGNER_ATTEMPT_COUNT=${signerAttempts.length}`);
  console.log(`SIGNER_ATTEMPT_SHAPES=${JSON.stringify(signerAttempts.map(attemptShape)).slice(0, 20000)}`);
  console.log(`RECENT_PASSED_ATTEMPT_SHAPES=${JSON.stringify(recentPassed.map(attemptShape)).slice(0, 30000)}`);
  console.log(`RECENT_FAILED_ATTEMPT_SHAPES=${JSON.stringify(recentFailed.map(attemptShape)).slice(0, 30000)}`);
  console.log(`PASSED_REASON_COUNTS=${JSON.stringify(Object.fromEntries(passedReasonCounts))}`);
  console.log(`FAILED_REASON_COUNTS=${JSON.stringify(Object.fromEntries(failedReasonCounts))}`);
  console.log("NOTE_CONTENT_VALUES_PRINTED=no");
  console.log("NOTE_ONLY_PAYLOAD_STRUCTURE_AND_LENGTHS_PRINTED=yes");
  console.log("WRITE_ACTION_EXECUTED=no");
  console.log("CLAIM_EXECUTED=no");
  console.log("SUBMISSION_EXECUTED=no");
  console.log("DISPUTE_EXECUTED=no");
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`ATTEMPT_SHAPE_INSPECT_FAILED=${message.slice(0, 800)}`);
  console.error("WRITE_ACTION_EXECUTED=no");
  process.exitCode = 1;
});
