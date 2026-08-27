#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { AtelierApiClient } from "../src/atelier/api-client.js";
import { executeAtelierReadmeOrderOnce } from "../src/atelier/order-executor.js";
import { getAtelierApiSession } from "../src/security/atelier-access-client.js";

if (process.env.ATELIER_ORDER_WORKER_APPROVED !== "yes") {
  console.error("ERROR: explicit Atelier autonomous order-worker approval is required");
  process.exit(2);
}

type JsonObject = Record<string, unknown>;
function asObject(value: unknown): JsonObject {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? (value as JsonObject) : {};
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

const root = join(homedir(), ".hermes", "commerce-control");
const serviceStatePath = process.env.ATELIER_SERVICE_STATE_PATH?.trim() || join(root, "state", "atelier-readme-service.json");
const orderRoot = process.env.ATELIER_ORDER_STATE_ROOT?.trim() || join(root, "atelier-orders");
const pollSeconds = Math.max(120, Number(process.env.ATELIER_POLL_SECONDS ?? "120") || 120);

let stopped = false;
process.on("SIGINT", () => { stopped = true; });
process.on("SIGTERM", () => { stopped = true; });

try {
  const credentials = await getAtelierApiSession();
  const service = readServiceState(serviceStatePath);
  if (service.agentId !== credentials.agentId) throw new Error("Atelier agent/service state mismatch");
  const client = new AtelierApiClient({ apiKey: credentials.apiKey });

  console.log("ATELIER_ORDER_WORKER_AUTHORIZATION_USED=yes");
  console.log("AUTH_SOURCE=atelier_access_broker");
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
        try {
          const outcome = await executeAtelierReadmeOrderOnce({
            client,
            rawOrder: order,
            serviceId: service.serviceId,
            stateRoot: orderRoot,
          });
          console.log(`ORDER_OUTCOME=${outcome.orderId}:${outcome.phase}:${outcome.state}:${outcome.action}`);
        } catch (error) {
          console.error(`ORDER_PROCESSING_FAILED=${order.id}:${error instanceof Error ? error.message : String(error)}`);
        }
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
