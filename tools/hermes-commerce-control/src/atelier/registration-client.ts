import { ATELIER_API_BASE, buildSolanaRegistrationPayload, type AtelierRegistrationPayload } from "./marketplace-contract.js";
import { signAtelierWalletAuthMessage } from "./solana-auth.js";

type JsonObject = Record<string, unknown>;

export interface AtelierRegistrationCredentials {
  readonly agentId: string;
  readonly apiKey: string;
  readonly webhookSecret: string | null;
}

export interface AtelierRegistrationResult {
  readonly status: number;
  readonly credentials: AtelierRegistrationCredentials;
  readonly responseBody: unknown;
}

function asObject(value: unknown): JsonObject {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonObject)
    : {};
}

function nonEmptyText(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function boundedBody(value: unknown): string {
  if (typeof value === "string") return value.replace(/\s+/g, " ").slice(0, 800);
  try {
    return JSON.stringify(value).slice(0, 800);
  } catch {
    return "unreadable response body";
  }
}

export function parseAtelierRegistrationCredentials(body: unknown): AtelierRegistrationCredentials {
  const root = asObject(body);
  const data = asObject(root.data ?? body);
  const agent = asObject(data.agent ?? root.agent);

  const agentId = nonEmptyText(
    data.agent_id ?? data.agentId ?? data.id ?? agent.id ?? root.agent_id ?? root.agentId,
  );
  const apiKey = nonEmptyText(data.api_key ?? data.apiKey ?? root.api_key ?? root.apiKey);
  const webhookSecret = nonEmptyText(
    data.webhook_secret ?? data.webhookSecret ?? root.webhook_secret ?? root.webhookSecret,
  );

  if (!agentId || !/^[A-Za-z0-9_-]+$/.test(agentId)) {
    throw new Error("Atelier registration response is missing a valid agent id");
  }
  if (!apiKey || !/^atelier_[A-Za-z0-9_-]+$/.test(apiKey)) {
    throw new Error("Atelier registration response is missing a valid API key");
  }

  return Object.freeze({ agentId, apiKey, webhookSecret });
}

export function buildSignedAtelierRegistrationPayload(input: {
  readonly privateKeyPkcs8: Uint8Array;
  readonly address: string;
  readonly timestamp?: number;
}): AtelierRegistrationPayload {
  const signature = signAtelierWalletAuthMessage(
    input.privateKeyPkcs8,
    input.address,
    input.timestamp ?? Date.now(),
  );
  return buildSolanaRegistrationPayload({
    ownerWallet: signature.address,
    walletSignature: signature.signatureBase58,
    walletSignatureTimestamp: signature.timestamp,
  });
}

export async function registerAtelierAgent(
  payload: AtelierRegistrationPayload,
  options: {
    readonly baseUrl?: string;
    readonly fetchImpl?: typeof fetch;
  } = {},
): Promise<AtelierRegistrationResult> {
  const baseUrl = (options.baseUrl ?? ATELIER_API_BASE).replace(/\/+$/, "");
  const fetchImpl = options.fetchImpl ?? fetch;
  const response = await fetchImpl(`${baseUrl}/api/agents/register`, {
    method: "POST",
    redirect: "manual",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(20_000),
  });

  const raw = await response.text();
  let body: unknown = null;
  if (raw.trim()) {
    try {
      body = JSON.parse(raw) as unknown;
    } catch {
      body = raw.slice(0, 20_000);
    }
  }

  if (response.status < 200 || response.status >= 300) {
    throw new Error(`Atelier registration failed HTTP ${response.status}: ${boundedBody(body)}`);
  }

  return Object.freeze({
    status: response.status,
    credentials: parseAtelierRegistrationCredentials(body),
    responseBody: body,
  });
}
