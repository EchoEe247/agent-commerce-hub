import { createHash } from "node:crypto";
import { chmodSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { AtelierApiClient } from "./api-client.js";
import {
  nextAtelierOrderReceipt,
  readAtelierOrderReceipt,
  writeAtelierOrderReceipt,
  type AtelierOrderReceipt,
} from "./order-state.js";
import { prepareAtelierReadmeOrder, type PreparedAtelierReadmeOrder } from "./order-runner.js";

type JsonObject = Record<string, unknown>;

export interface AtelierOrderExecutionOutcome {
  readonly orderId: string;
  readonly phase: "initial" | "revision-1";
  readonly state: AtelierOrderReceipt["state"];
  readonly action: "delivered" | "skipped" | "manual_review";
  readonly note: string;
}

export interface AtelierOrderExecutionClient {
  uploadDocument: AtelierApiClient["uploadDocument"];
  deliverDocument: AtelierApiClient["deliverDocument"];
}

function asObject(value: unknown): JsonObject {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? (value as JsonObject) : {};
}
function sha256(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}
function atomicWrite(path: string, content: string): void {
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  chmodSync(dirname(path), 0o700);
  const tmp = `${path}.tmp-${process.pid}-${Date.now()}`;
  writeFileSync(tmp, content, { encoding: "utf8", mode: 0o600, flag: "wx" });
  renameSync(tmp, path);
  chmodSync(path, 0o600);
}
function transition(path: string, previous: AtelierOrderReceipt | null, input: Omit<AtelierOrderReceipt, "updatedAt">): AtelierOrderReceipt {
  const next = nextAtelierOrderReceipt(previous, input);
  writeAtelierOrderReceipt(path, next);
  return next;
}
function identify(rawOrder: unknown): { orderId: string; phase: "initial" | "revision-1" } {
  const raw = asObject(rawOrder);
  const orderIdRaw = raw.id ?? raw.order_id ?? raw.orderId;
  const statusRaw = raw.status;
  const orderId = typeof orderIdRaw === "string" ? orderIdRaw.trim() : "";
  const status = typeof statusRaw === "string" ? statusRaw.trim() : "";
  if (!/^[A-Za-z0-9_-]+$/.test(orderId)) throw new Error("invalid Atelier order id in executor");
  return { orderId, phase: status === "revision_requested" ? "revision-1" : "initial" };
}

export async function executeAtelierReadmeOrderOnce(input: {
  readonly client: AtelierOrderExecutionClient;
  readonly rawOrder: unknown;
  readonly serviceId: string;
  readonly stateRoot: string;
  readonly prepare?: typeof prepareAtelierReadmeOrder;
}): Promise<AtelierOrderExecutionOutcome> {
  if (!/^[A-Za-z0-9_-]+$/.test(input.serviceId)) throw new Error("invalid Atelier service id in executor");
  const { orderId, phase } = identify(input.rawOrder);
  const dir = join(input.stateRoot, orderId, phase);
  const receiptPath = join(dir, "receipt.json");
  const reportPath = join(dir, "report.md");
  let receipt = readAtelierOrderReceipt(receiptPath);

  if (receipt?.state === "delivered") {
    return Object.freeze({ orderId, phase, state: receipt.state, action: "skipped", note: "already delivered" });
  }
  if (receipt && ["upload_attempted", "delivery_attempted", "failed"].includes(receipt.state)) {
    return Object.freeze({ orderId, phase, state: receipt.state, action: "manual_review", note: "ambiguous or failed prior write; automatic retry forbidden" });
  }

  if (!receipt) {
    const prepare = input.prepare ?? prepareAtelierReadmeOrder;
    const prepared: PreparedAtelierReadmeOrder = await prepare(input.rawOrder, { expectedServiceId: input.serviceId });
    const report = `${prepared.reportMarkdown}\n`;
    const hash = sha256(report);
    atomicWrite(reportPath, report);
    receipt = transition(receiptPath, null, {
      orderId,
      serviceId: input.serviceId,
      state: "prepared",
      reportSha256: hash,
      deliverableUrl: null,
      deliveryHttpStatus: null,
      note: phase,
    });
  }

  if (receipt.state === "prepared") {
    const report = readFileSync(reportPath, "utf8");
    const hash = sha256(report);
    if (hash !== receipt.reportSha256) {
      receipt = transition(receiptPath, receipt, {
        orderId,
        serviceId: input.serviceId,
        state: "failed",
        reportSha256: receipt.reportSha256,
        deliverableUrl: null,
        deliveryHttpStatus: null,
        note: "local report hash mismatch",
      });
      return Object.freeze({ orderId, phase, state: receipt.state, action: "manual_review", note: receipt.note ?? "hash mismatch" });
    }

    receipt = transition(receiptPath, receipt, {
      orderId,
      serviceId: input.serviceId,
      state: "upload_attempted",
      reportSha256: hash,
      deliverableUrl: null,
      deliveryHttpStatus: null,
      note: "upload POST armed; automatic retry forbidden if outcome is ambiguous",
    });

    let uploaded;
    try {
      uploaded = await input.client.uploadDocument(`${orderId}-${phase}-readme-setup-fix.md`, report);
    } catch (error) {
      return Object.freeze({
        orderId,
        phase,
        state: receipt.state,
        action: "manual_review",
        note: `upload outcome ambiguous: ${error instanceof Error ? error.message : String(error)}`,
      });
    }

    receipt = transition(receiptPath, receipt, {
      orderId,
      serviceId: input.serviceId,
      state: "published",
      reportSha256: hash,
      deliverableUrl: uploaded.url,
      deliveryHttpStatus: null,
      note: `upload HTTP ${uploaded.response.status}`,
    });
  }

  if (receipt.state === "published") {
    if (!receipt.deliverableUrl) throw new Error(`published order ${orderId} is missing deliverable URL`);
    receipt = transition(receiptPath, receipt, {
      orderId,
      serviceId: input.serviceId,
      state: "delivery_attempted",
      reportSha256: receipt.reportSha256,
      deliverableUrl: receipt.deliverableUrl,
      deliveryHttpStatus: null,
      note: "delivery POST armed; automatic retry forbidden if outcome is ambiguous",
    });

    let response;
    try {
      response = await input.client.deliverDocument(orderId, receipt.deliverableUrl);
    } catch (error) {
      return Object.freeze({
        orderId,
        phase,
        state: receipt.state,
        action: "manual_review",
        note: `delivery outcome ambiguous: ${error instanceof Error ? error.message : String(error)}`,
      });
    }
    if (response.status < 200 || response.status >= 300) {
      receipt = transition(receiptPath, receipt, {
        orderId,
        serviceId: input.serviceId,
        state: "delivery_attempted",
        reportSha256: receipt.reportSha256,
        deliverableUrl: receipt.deliverableUrl,
        deliveryHttpStatus: response.status,
        note: `delivery returned HTTP ${response.status}; no automatic retry`,
      });
      return Object.freeze({ orderId, phase, state: receipt.state, action: "manual_review", note: receipt.note ?? "delivery failed" });
    }

    receipt = transition(receiptPath, receipt, {
      orderId,
      serviceId: input.serviceId,
      state: "delivered",
      reportSha256: receipt.reportSha256,
      deliverableUrl: receipt.deliverableUrl,
      deliveryHttpStatus: response.status,
      note: `delivered ${phase}`,
    });
  }

  return Object.freeze({ orderId, phase, state: receipt.state, action: "delivered", note: receipt.note ?? "delivered" });
}
