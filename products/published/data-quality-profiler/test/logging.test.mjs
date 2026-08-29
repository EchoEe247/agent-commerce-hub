import test from "node:test";
import assert from "node:assert/strict";
import { buildRequestLog } from "../src/logging.mjs";

test("redacts customer payloads from operational log entries", () => {
  const entry = buildRequestLog({
    requestId: "prof_00000000-0000-0000-0000-000000000000",
    timestamp: "2026-08-18T00:00:00.000Z",
    requestBytes: 128,
    recordCount: 2,
    fieldCount: 3,
    processingMs: 4,
    status: 200,
  });
  const serialized = JSON.stringify(entry);
  assert.ok(!serialized.includes("CUSTOMER_PAYLOAD_SENTINEL_7c8e"));
  assert.ok(!serialized.includes("person@example.com"));
});

test("log entries contain only allowed fields", () => {
  const entry = buildRequestLog({
    requestId: "prof_x",
    requestBytes: 10,
    recordCount: 5,
    fieldCount: 2,
    processingMs: 3,
    status: 402,
    errorCode: "PAYMENT_REQUIRED",
    paymentRef: "settle-abc",
    // These must be dropped even if passed:
    records: [{ secret: "CUSTOMER_PAYLOAD_SENTINEL_7c8e" }],
    data: "id,name\n1,person@example.com",
  });
  const allowed = ["request_id", "timestamp", "request_bytes", "record_count", "field_count", "processing_ms", "status", "error_code", "payment_ref"];
  assert.deepEqual(Object.keys(entry).sort(), allowed.sort());
});

test("payment_ref is optional and omitted when absent", () => {
  const entry = buildRequestLog({ requestId: "prof_x", status: 200 });
  assert.ok(!("payment_ref" in entry));
});

test("never logs payment signatures or raw payload", () => {
  const entry = buildRequestLog({
    requestId: "prof_x",
    status: 200,
    requestBytes: 0,
  });
  const serialized = JSON.stringify(entry);
  assert.ok(!serialized.includes("signature"));
  assert.ok(!serialized.includes("0xabc"));
});