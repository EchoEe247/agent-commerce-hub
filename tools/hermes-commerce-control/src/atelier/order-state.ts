import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

export type AtelierLocalOrderState = "seen" | "prepared" | "upload_attempted" | "published" | "delivery_attempted" | "delivered" | "failed";

export interface AtelierOrderReceipt {
  readonly orderId: string;
  readonly serviceId: string | null;
  readonly state: AtelierLocalOrderState;
  readonly reportSha256: string | null;
  readonly deliverableUrl: string | null;
  readonly deliveryHttpStatus: number | null;
  readonly updatedAt: string;
  readonly note: string | null;
}

type JsonObject = Record<string, unknown>;
function asObject(value: unknown): JsonObject {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? (value as JsonObject) : {};
}
function nullableString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}
function parseState(value: unknown): AtelierLocalOrderState {
  if (["seen", "prepared", "upload_attempted", "published", "delivery_attempted", "delivered", "failed"].includes(String(value))) {
    return value as AtelierLocalOrderState;
  }
  throw new Error("invalid Atelier local order state");
}

export function readAtelierOrderReceipt(path: string): AtelierOrderReceipt | null {
  let raw: string;
  try { raw = readFileSync(path, "utf8"); }
  catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT") return null;
    throw error;
  }
  const body = asObject(JSON.parse(raw) as unknown);
  const orderId = nullableString(body.orderId);
  const updatedAt = nullableString(body.updatedAt);
  if (!orderId || !updatedAt) throw new Error("invalid Atelier order receipt");
  return Object.freeze({
    orderId,
    serviceId: nullableString(body.serviceId),
    state: parseState(body.state),
    reportSha256: nullableString(body.reportSha256),
    deliverableUrl: nullableString(body.deliverableUrl),
    deliveryHttpStatus: typeof body.deliveryHttpStatus === "number" && Number.isInteger(body.deliveryHttpStatus) ? body.deliveryHttpStatus : null,
    updatedAt,
    note: nullableString(body.note),
  });
}

export function writeAtelierOrderReceipt(path: string, receipt: AtelierOrderReceipt): void {
  if (!receipt.orderId.trim()) throw new Error("order receipt requires orderId");
  const parent = dirname(path);
  mkdirSync(parent, { recursive: true, mode: 0o700 });
  const tmp = `${path}.tmp-${process.pid}-${Date.now()}`;
  writeFileSync(tmp, `${JSON.stringify(receipt, null, 2)}\n`, { encoding: "utf8", mode: 0o600, flag: "wx" });
  renameSync(tmp, path);
}

export function nextAtelierOrderReceipt(
  previous: AtelierOrderReceipt | null,
  input: Omit<AtelierOrderReceipt, "updatedAt">,
): AtelierOrderReceipt {
  if (previous?.state === "delivered" && input.state !== "delivered") {
    throw new Error(`order ${input.orderId} is already delivered; refusing state regression`);
  }
  if (previous && previous.orderId !== input.orderId) throw new Error("order receipt id mismatch");
  return Object.freeze({ ...input, updatedAt: new Date().toISOString() });
}
