import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, rmSync } from "node:fs";
import { buildApp } from "../src/app.mjs";
import { LIMITS } from "../src/dataset/limits.mjs";

const FIXTURE = {
  format: "json",
  records: [
    { id: 1, email: "a@example.com", age: 22 },
    { id: 2, email: null, age: "23" },
  ],
};

function unpaidApp(options = {}) {
  return buildApp({ config: { serviceVersion: "0.1.0" }, paymentPlugin: async () => {}, ...options });
}

test("GET /health returns service identity without payment", async () => {
  const app = unpaidApp();
  const response = await app.inject({ method: "GET", url: "/health" });
  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), {
    ok: true,
    service: "data-quality-profiler",
    version: "0.1.0",
  });
  await app.close();
});

test("POST /v1/profile returns the approved envelope", async () => {
  const app = unpaidApp();
  const response = await app.inject({ method: "POST", url: "/v1/profile", payload: FIXTURE });
  assert.equal(response.statusCode, 200);
  const body = response.json();
  assert.equal(body.schema_version, "1.0");
  assert.equal(body.scoring_version, "1.0", "scoring_version must be in the public envelope");
  assert.match(body.request_id, /^prof_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  assert.ok(Number.isInteger(body.quality_score) && body.quality_score >= 0 && body.quality_score <= 100);
  assert.ok(body.score_breakdown);
  assert.equal(body.dataset.record_count, 2);
  assert.equal(body.dataset.field_count, 3);
  assert.match(body.dataset.schema_fingerprint, /^sha256:/);
  assert.equal(body.fields.age.inferred_type, "mixed");
  assert.ok(Array.isArray(body.warnings));
  assert.ok(body.processing_ms >= 0);
  await app.close();
});

test("structured error: invalid dataset returns 400", async () => {
  const app = unpaidApp();
  const response = await app.inject({ method: "POST", url: "/v1/profile", payload: { format: "json", records: "nope" } });
  assert.equal(response.statusCode, 400);
  assert.equal(response.json().error.code, "INVALID_DATASET");
  await app.close();
});

test("structured error: too many records returns 413", async () => {
  const app = unpaidApp();
  const records = Array.from({ length: LIMITS.records + 1 }, (_, i) => ({ id: i }));
  const response = await app.inject({ method: "POST", url: "/v1/profile", payload: { format: "json", records } });
  assert.equal(response.statusCode, 413);
  assert.equal(response.json().error.code, "TOO_MANY_RECORDS");
  await app.close();
});

test("structured error: 1 MiB body limit returns 413", async () => {
  const app = unpaidApp();
  const bigValue = "x".repeat(LIMITS.bodyBytes);
  const response = await app.inject({
    method: "POST",
    url: "/v1/profile",
    payload: { format: "json", records: [{ id: 1, note: bigValue }] },
  });
  // Note: fastify enforces bodyLimit at the transport layer (413) for payloads
  // larger than bodyBytes. Some body encoders reject before routing.
  assert.equal(response.statusCode, 413);
  await app.close();
});

test("processing timeout crosses deadline and returns 408", async () => {
  // Injectable clock whose value grows by a large step per call, so the
  // per-record deadline check (deadline = now() + deadlineMs) is exceeded
  // during iteration without waiting real seconds.
  let n = 0;
  const app = unpaidApp({ clock: { now: () => Date.now() + ++n * 10_000 } });
  const response = await app.inject({ method: "POST", url: "/v1/profile", payload: FIXTURE });
  assert.equal(response.statusCode, 408);
  assert.equal(response.json().error.code, "PROCESSING_TIMEOUT");
  await app.close();
});

test("determinism: same dataset profiled 20 times yields identical results", async () => {
  const app = unpaidApp();
  const samples = [];
  for (let i = 0; i < 20; i++) {
    const response = await app.inject({ method: "POST", url: "/v1/profile", payload: FIXTURE });
    assert.equal(response.statusCode, 200);
    const body = response.json();
    const { request_id, processing_ms, ...stable } = body;
    samples.push(stable);
  }
  for (let i = 1; i < samples.length; i++) {
    assert.deepEqual(samples[i], samples[0]);
  }
  await app.close();
});

test("security: path/url/shell/html strings remain inert data", async () => {
  const marker = "/tmp/profiler-owned";
  rmSync(marker, { force: true });
  const app = unpaidApp();
  const response = await app.inject({
    method: "POST",
    url: "/v1/profile",
    payload: {
      format: "json",
      records: [
        { path: "../../../../etc/passwd", url: "https://127.0.0.1:8081/wallet", shell: "$(touch /tmp/profiler-owned)", html: "<script>alert(1)</script>" },
      ],
    },
  });
  assert.equal(response.statusCode, 200);
  assert.equal(existsSync(marker), false, "shell-like string must not create a file");
  assert.equal(response.json().fields.shell.inferred_type, "string");
  await app.close();
});

test("legal maximum-size dataset is processed successfully", async () => {
  // The 1 MiB body cap is the binding constraint (1000 records x 250 fields
  // does not fit under 1 MiB). Use the largest payload that stays legal and
  // verify both structural caps are respected end to end.
  const app = unpaidApp();
  const fieldNames = Array.from({ length: 70 }, (_, i) => `f${i}`);
  const records = Array.from({ length: LIMITS.records }, (_, r) =>
    Object.fromEntries(fieldNames.map((f, i) => [f, i === 0 ? r : r * 1000 + i]))
  );
  const response = await app.inject({ method: "POST", url: "/v1/profile", payload: { format: "json", records } });
  assert.equal(response.statusCode, 200);
  const body = response.json();
  assert.equal(body.dataset.record_count, LIMITS.records);
  assert.equal(body.dataset.field_count, fieldNames.length);
  await app.close();
});

test("all-null field at API level returns no NaN/Infinity in profile", async () => {
  const app = unpaidApp();
  const response = await app.inject({
    method: "POST",
    url: "/v1/profile",
    payload: {
      format: "json",
      records: [
        { id: 1, empty: null },
        { id: 2, empty: null },
        { id: 3, empty: null },
      ],
    },
  });
  assert.equal(response.statusCode, 200);
  const body = response.json();
  const field = body.fields.empty;
  assert.equal(field.null_count, 3);
  assert.equal(field.null_pct, 100);
  assert.equal(field.inferred_type, "null");
  // Must not contain NaN or Infinity anywhere in the field profile
  const json = JSON.stringify(field);
  assert.ok(!json.includes("NaN"), "field profile must not contain NaN");
  assert.ok(!json.includes("Infinity"), "field profile must not contain Infinity");
  await app.close();
});