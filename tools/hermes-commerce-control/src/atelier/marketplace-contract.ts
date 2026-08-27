import { ATELIER_README_SETUP_SERVICE } from "./readme-setup-service.js";

export const ATELIER_API_BASE = "https://api.useatelier.ai" as const;

export const ATELIER_AGENT_PROFILE = Object.freeze({
  name: "SetupPatch",
  description:
    "Autonomous public-repository setup documentation specialist. Checks README instructions against repository manifests and returns a corrected setup section without executing project code or requiring customer credentials.",
  capabilities: Object.freeze(["coding"] as const),
});

export interface AtelierRequirementField {
  readonly key: string;
  readonly label: string;
  readonly required: boolean;
  readonly description: string;
}

export interface AtelierServiceCreatePayload {
  readonly category: "coding";
  readonly title: string;
  readonly description: string;
  readonly price_usd: string;
  readonly price_type: "fixed";
  readonly turnaround_hours: number;
  readonly deliverables: readonly ["document"];
  readonly max_revisions: number;
  readonly requirement_fields: readonly AtelierRequirementField[];
}

export function buildReadmeSetupServicePayload(): AtelierServiceCreatePayload {
  const service = ATELIER_README_SETUP_SERVICE;
  return Object.freeze({
    category: "coding",
    title: service.title,
    description: service.description,
    price_usd: service.priceUsd.toFixed(2),
    price_type: "fixed",
    turnaround_hours: service.turnaroundHours,
    deliverables: Object.freeze(["document"] as const),
    max_revisions: service.maxRevisions,
    requirement_fields: Object.freeze(
      service.requirements.map((field) =>
        Object.freeze({
          key: field.key,
          label: field.label,
          required: field.required,
          description: field.description,
        }),
      ),
    ),
  });
}

export interface AtelierSolanaRegistrationOwnership {
  readonly ownerWallet: string;
  readonly walletSignature: string;
  readonly walletSignatureTimestamp: number;
}

export interface AtelierRegistrationPayload {
  readonly name: string;
  readonly description: string;
  readonly capabilities: readonly ["coding"];
  readonly owner_wallet: string;
  readonly wallet: string;
  readonly wallet_chain: "solana";
  readonly wallet_sig: string;
  readonly wallet_sig_ts: number;
}

function requireText(value: string, label: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(`${label} is required`);
  return normalized;
}

export function buildSolanaRegistrationPayload(
  ownership: AtelierSolanaRegistrationOwnership,
): AtelierRegistrationPayload {
  const ownerWallet = requireText(ownership.ownerWallet, "owner wallet");
  const walletSignature = requireText(ownership.walletSignature, "wallet signature");
  if (!Number.isSafeInteger(ownership.walletSignatureTimestamp) || ownership.walletSignatureTimestamp <= 0) {
    throw new Error("wallet signature timestamp must be a positive integer");
  }
  if (ownerWallet.startsWith("0x")) {
    throw new Error("zero-cost marketable registration is pinned to the documented Solana wallet-signature path");
  }

  return Object.freeze({
    name: ATELIER_AGENT_PROFILE.name,
    description: ATELIER_AGENT_PROFILE.description,
    capabilities: Object.freeze(["coding"] as const),
    owner_wallet: ownerWallet,
    wallet: ownerWallet,
    wallet_chain: "solana",
    wallet_sig: walletSignature,
    wallet_sig_ts: ownership.walletSignatureTimestamp,
  });
}

export type AtelierActionableOrderStatus = "paid" | "in_progress" | "revision_requested";
export const ATELIER_ACTIONABLE_ORDER_STATUSES = Object.freeze([
  "paid",
  "in_progress",
  "revision_requested",
] as const);

export interface AtelierOrderEnvelope {
  readonly id: string;
  readonly status: string;
  readonly serviceId: string | null;
  readonly brief: unknown;
  readonly revisionFeedback: string | null;
}

type JsonObject = Record<string, unknown>;
function asObject(value: unknown): JsonObject {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? (value as JsonObject) : {};
}
function stringField(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed || null;
}

export function parseAtelierOrder(value: unknown): AtelierOrderEnvelope {
  const order = asObject(value);
  const id = stringField(order.id ?? order.order_id ?? order.orderId);
  const status = stringField(order.status);
  if (!id) throw new Error("Atelier order is missing id");
  if (!status) throw new Error(`Atelier order ${id} is missing status`);

  const service = asObject(order.service);
  const serviceId = stringField(order.service_id ?? order.serviceId ?? service.id);
  const revision = asObject(order.revision ?? order.revision_request ?? order.revisionRequest);
  const revisionFeedback = stringField(
    order.revision_feedback ?? order.revisionFeedback ?? order.feedback ?? revision.feedback ?? revision.content ?? revision.message,
  );

  return Object.freeze({
    id,
    status,
    serviceId,
    brief: order.brief ?? order.requirements ?? order.requirement_values ?? null,
    revisionFeedback,
  });
}

export interface AtelierDeliverDocumentPayload {
  readonly deliverable_url: string;
  readonly deliverable_media_type: "document";
}

export function buildDocumentDeliveryPayload(deliverableUrl: string): AtelierDeliverDocumentPayload {
  let url: URL;
  try { url = new URL(deliverableUrl.trim()); }
  catch { throw new Error("deliverable URL must be a valid URL"); }
  if (url.protocol !== "https:") throw new Error("deliverable URL must use HTTPS");
  return Object.freeze({ deliverable_url: url.toString(), deliverable_media_type: "document" });
}
