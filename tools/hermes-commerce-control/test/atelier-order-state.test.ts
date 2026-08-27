import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  nextAtelierOrderReceipt,
  readAtelierOrderReceipt,
  writeAtelierOrderReceipt,
} from "../src/atelier/order-state.js";

test("Atelier order receipt persists prepared state", () => {
  const dir = mkdtempSync(join(tmpdir(), "atelier-order-state-"));
  try {
    const path = join(dir, "ord_1.json");
    const receipt = nextAtelierOrderReceipt(null, {
      orderId: "ord_1",
      serviceId: "svc_1",
      state: "prepared",
      reportSha256: "abc123",
      deliverableUrl: null,
      deliveryHttpStatus: null,
      note: null,
    });
    writeAtelierOrderReceipt(path, receipt);
    const loaded = readAtelierOrderReceipt(path);
    assert.equal(loaded?.orderId, "ord_1");
    assert.equal(loaded?.state, "prepared");
    assert.equal(loaded?.reportSha256, "abc123");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("delivered order state cannot regress", () => {
  const delivered = nextAtelierOrderReceipt(null, {
    orderId: "ord_1",
    serviceId: "svc_1",
    state: "delivered",
    reportSha256: "abc123",
    deliverableUrl: "https://cdn.example.com/report.md",
    deliveryHttpStatus: 200,
    note: null,
  });
  assert.throws(
    () => nextAtelierOrderReceipt(delivered, {
      orderId: "ord_1",
      serviceId: "svc_1",
      state: "prepared",
      reportSha256: "abc123",
      deliverableUrl: null,
      deliveryHttpStatus: null,
      note: "retry",
    }),
    /already delivered/,
  );
});
