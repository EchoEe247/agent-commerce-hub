#!/usr/bin/env node
import { createHash } from "node:crypto";
import { chmodSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { loadAtelierAgentAuthKeystore } from "../src/atelier/agent-auth-store.js";
import { AtelierApiClient } from "../src/atelier/api-client.js";
import {
  nextAtelierOrderReceipt,
  readAtelierOrderReceipt,
  writeAtelierOrderReceipt,
  type AtelierOrderReceipt,
} from "../src/atelier/order-state.js";
import { prepareAtelierReadmeOrder } from "../src/atelier/order-runner.js";

if (process.env.ATELIER_ORDER_WORKER_APPROVED !== "yes") {
  console.error("ERROR: explicit Atelier autonomous order-worker approval is required");
  process.exit(2);
}

type JsonObject = Record<string, unknown>;
function asObject(value: unknown): JsonObject {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? (value as JsonObject) : {};
}
async function readPassphrase(): Promise<string> {
  let raw = "";
  for await (const chunk of process.stdin) raw += String(chunk);
  const passphrase = raw.replace(/[\r\n]+$/, "");
  if (passphrase.length < 16) throw new Error("keystore passphrase must be at least 16 characters");
  return passphrase;
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
function readServiceState(path: string): { agentId: string; serviceId: string } {
  const body = asObject(JSON.parse(readFileSync(path, "utf8")) as unknown);
  const agentId = typeof body.agentId === "string" ? body.agentId.trim() : "";
  const serviceId = typeof body.serviceId === "string" ? body.serviceId.trim() : "";
  if (!/^[A-Za-z0-9_-]+$/.test(agentId) || !/^[A-Za-z0-9_-]+$/.test(serviceId)) {
    throw new Error("invalid Atelier service state");
  }
  return { agentId, serviceId };
}
function transition(path: string, previous: AtelierOrderReceipt | null, input: Omit<AtelierOrderReceipt, "updatedAt">): AtelierOrderReceipt {
  const next = nextAtelierOrderReceipt(previous, input);
  writeAtelierOrderReceipt(path, next);
  return next;
}

const root = join(homedir(), ".hermes", "commerce-control");
const authPath = process.env.ATELIER_AGENT_AUTH_KEYSTORE_PATH?.trim() || join(root, "secrets", "atelier-agent-auth.keystore.json");
const serviceStatePath = process.env.ATELIER_SERVICE_STATE_PATH?.trim() || join(root, "state", "atelier-readme-service.json");
const orderRoot = process.env.ATELIER_ORDER_STATE_ROOT?.trim() || join(root, "atelier-orders");
const pollSeconds = Math.max(120, Number(process.env.ATELIER_POLL_SECONDS ?? "120") || 120);

let stopped = false;
process.on("SIGINT", () => { stopped = true; });
process.on("SIGTERM", () => { stopped = true; });

async function processOrder(client: AtelierApiClient, rawOrder: unknown, serviceId: string): Promise<void> {
  const raw = asObject(rawOrder);
  const orderIdRaw = raw.id ?? raw.order_id ?? raw.orderId;
  const statusRaw = raw.status;
  const orderId = typeof orderIdRaw === "string" ? orderIdRaw.trim() : "";
  const status = typeof statusRaw === "string" ? statusRaw.trim() : "";
  if (!/^[A-Za-z0-9_-]+$/.test(orderId)) throw new Error("invalid order id in worker");
  const phase = status === "revision_requested" ? "revision-1" : "initial";
  const dir = join(orderRoot, orderId, phase);
  const receiptPath = join(dir, "receipt.json");
  const reportPath = join(dir, "report.md");
  let receipt = readAtelierOrderReceipt(receiptPath);

  if (receipt?.state === "delivered") {
    console.log(`ORDER_SKIPPED_ALREADY_DELIVERED=${orderId}:${phase}`);
    return;
  }
  if (receipt && ["upload_attempted", "delivery_attempted", "failed"].includes(receipt.state)) {
    console.log(`ORDER_REQUIRES_MANUAL_REVIEW=${orderId}:${phase}:${receipt.state}`);
    return;
  }

  if (!receipt) {
    const prepared = await prepareAtelierReadmeOrder(rawOrder, { expectedServiceId: serviceId });
    const report = `${prepared.reportMarkdown}\n`;
    const hash = sha256(report);
    atomicWrite(reportPath, report);
    receipt = transition(receiptPath, null, {
      orderId,
      serviceId,
      state: "prepared",
      reportSha256: hash,
      deliverableUrl: null,
      deliveryHttpStatus: null,
      note: phase,
    });
    console.log(`ORDER_PREPARED=${orderId}:${phase}:${hash}`);
  }

  if (receipt.state === "prepared") {
    const report = readFileSync(reportPath, "utf8");
    const hash = sha256(report);
    if (hash !== receipt.reportSha256) {
      transition(receiptPath, receipt, { ...receipt, state: "failed", note: "local report hash mismatch", deliveryHttpStatus: null });
      console.log(`ORDER_REQUIRES_MANUAL_REVIEW=${orderId}:${phase}:report_hash_mismatch`);
      return;
    }
    receipt = transition(receiptPath, receipt, {
      orderId,
      serviceId,
      state: "upload_attempted",
      reportSha256: hash,
      deliverableUrl: null,
      deliveryHttpStatus: null,
      note: "upload POST armed; automatic retry forbidden if outcome is ambiguous",
    });
    let uploaded;
    try {
      uploaded = await client.uploadDocument(`${orderId}-${phase}-readme-setup-fix.md`, report);
    } catch (error) {
      console.error(`ORDER_UPLOAD_OUTCOME_AMBIGUOUS=${orderId}:${phase}:${error instanceof Error ? error.message : String(error)}`);
      return;
    }
    receipt = transition(receiptPath, receipt, {
      orderId,
      serviceId,
      state: "published",
      reportSha256: hash,
      deliverableUrl: uploaded.url,
      deliveryHttpStatus: null,
      note: `upload HTTP ${uploaded.response.status}`,
    });
    console.log(`ORDER_PUBLISHED=${orderId}:${phase}:${uploaded.url}`);
  }

  if (receipt.state === "published") {
    if (!receipt.deliverableUrl) throw new Error(`published order ${orderId} is missing deliverable URL`);
    receipt = transition(receiptPath, receipt, {
      orderId,
      serviceId,
      state: "delivery_attempted",
      reportSha256: receipt.reportSha256,
      deliverableUrl: receipt.deliverableUrl,
      deliveryHttpStatus: null,
      note: "delivery POST armed; automatic retry forbidden if outcome is ambiguous",
    });
    let response;
    try {
      response = await client.deliverDocument(orderId, receipt.deliverableUrl);
    } catch (error) {
      console.error(`ORDER_DELIVERY_OUTCOME_AMBIGUOUS=${orderId}:${phase}:${error instanceof Error ? error.message : String(error)}`);
      return;
    }
    if (response.status < 200 || response.status >= 300) {
      transition(receiptPath, receipt, { ...receipt, deliveryHttpStatus: response.status, note: `delivery returned HTTP ${response.status}; no automatic retry` });
      console.log(`ORDER_REQUIRES_MANUAL_REVIEW=${orderId}:${phase}:delivery_http_${response.status}`);
      return;
    }
    transition(receiptPath, receipt, {
      orderId,
      serviceId,
      state: "delivered",
      reportSha256: receipt.reportSha256,
      deliverableUrl: receipt.deliverableUrl,
      deliveryHttpStatus: response.status,
      note: `delivered ${phase}`,
    });
    console.log(`ORDER_DELIVERED=${orderId}:${phase}:${response.status}`);
  }
}

try {
  const passphrase = await readPassphrase();
  const credentials = loadAtelierAgentAuthKeystore(authPath, passphrase);
  const service = readServiceState(serviceStatePath);
  if (service.agentId !== credentials.agentId) throw new Error("Atelier agent/service state mismatch");
  const client = new AtelierApiClient({ apiKey: credentials.apiKey });

  console.log("ATELIER_ORDER_WORKER_AUTHORIZATION_USED=yes");
  console.log(`AGENT_ID=${credentials.agentId}`);
  console.log(`SERVICE_ID=${service.serviceId}`);
  console.log(`POLL_INTERVAL_SECONDS=${pollSeconds}`);
  console.log("AUTOMATIC_POST_RETRY_POLICY=none");
  console.log("UNTRUSTED_REPO_CODE_EXECUTED=no");

  while (!stopped) {
    try {
      const orders = await client.listOrders(credentials.agentId);
      console.log(`POLL_ACTIONABLE_ORDER_COUNT=${orders.length}`);
      for (const order of orders) {
        try { await processOrder(client, order, service.serviceId); }
        catch (error) { console.error(`ORDER_PROCESSING_FAILED=${order.id}:${error instanceof Error ? error.message : String(error)}`); }
      }
    } catch (error) {
      console.error(`ATELIER_POLL_FAILED=${error instanceof Error ? error.message : String(error)}`);
    }
    if (!stopped) await new Promise((resolve) => setTimeout(resolve, pollSeconds * 1000));
  }
  console.log("ATELIER_ORDER_WORKER_STOPPED=yes");
} catch (error) {
  console.error(`ATELIER_ORDER_WORKER_FAILED=${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
