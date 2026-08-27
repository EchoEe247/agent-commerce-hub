import { request } from "node:http";
import { homedir } from "node:os";
import { join } from "node:path";
import type { AtelierRegistrationCredentials } from "../atelier/registration-client.js";

export const DEFAULT_ATELIER_ACCESS_SOCKET = join(
  homedir(),
  ".hermes",
  "commerce-control",
  "run",
  "atelier-access.sock",
);

export interface AtelierAccessHealth {
  readonly ok: boolean;
  readonly address: string;
  readonly chain: string;
  readonly purpose: string;
  readonly agentAuthLoaded: boolean;
  readonly agentId: string | null;
  readonly idleTimeoutMinutes: number;
  readonly genericSigningEnabled: boolean;
}

export interface AtelierRegistrationSignature {
  readonly address: string;
  readonly timestamp: number;
  readonly signatureBase58: string;
  readonly messageTemplate: string;
}

export interface AtelierApiSession {
  readonly agentId: string;
  readonly apiKey: string;
}

interface BrokerRequestOptions {
  readonly socketPath?: string;
  readonly timeoutMs?: number;
}

type JsonObject = Record<string, unknown>;

function parseJsonObject(text: string): JsonObject {
  const value: unknown = JSON.parse(text);
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Atelier access broker returned non-object JSON");
  }
  return value as JsonObject;
}

function stringField(body: JsonObject, key: string): string {
  const value = body[key];
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Atelier access broker response missing ${key}`);
  }
  return value;
}

function nullableStringField(body: JsonObject, key: string): string | null {
  const value = body[key];
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") throw new Error(`Atelier access broker response has invalid ${key}`);
  return value;
}

function booleanField(body: JsonObject, key: string): boolean {
  const value = body[key];
  if (typeof value !== "boolean") throw new Error(`Atelier access broker response missing ${key}`);
  return value;
}

function numberField(body: JsonObject, key: string): number {
  const value = body[key];
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`Atelier access broker response missing ${key}`);
  }
  return value;
}

async function brokerRequest(
  method: "GET" | "POST",
  path: string,
  body: unknown,
  options: BrokerRequestOptions = {},
): Promise<JsonObject> {
  const socketPath = options.socketPath ?? DEFAULT_ATELIER_ACCESS_SOCKET;
  const timeoutMs = options.timeoutMs ?? 5_000;
  const serialized = body === undefined ? null : JSON.stringify(body);

  return await new Promise<JsonObject>((resolve, reject) => {
    const req = request(
      {
        method,
        path,
        socketPath,
        headers: {
          Accept: "application/json",
          ...(serialized === null
            ? {}
            : {
                "Content-Type": "application/json",
                "Content-Length": Buffer.byteLength(serialized),
              }),
        },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer | string) => {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        });
        res.once("error", reject);
        res.once("end", () => {
          const bodyText = Buffer.concat(chunks).toString("utf8");
          const status = res.statusCode ?? 0;
          if (status < 200 || status >= 300) {
            reject(new Error(`Atelier access broker HTTP ${status}: ${bodyText.slice(0, 300)}`));
            return;
          }
          try {
            resolve(parseJsonObject(bodyText));
          } catch (error) {
            reject(error);
          }
        });
      },
    );
    req.setTimeout(timeoutMs, () => req.destroy(new Error("Atelier access broker request timed out")));
    req.once("error", reject);
    if (serialized !== null) req.write(serialized);
    req.end();
  });
}

export async function getAtelierAccessHealth(options: BrokerRequestOptions = {}): Promise<AtelierAccessHealth> {
  const body = await brokerRequest("GET", "/v1/health", undefined, options);
  return {
    ok: booleanField(body, "ok"),
    address: stringField(body, "address"),
    chain: stringField(body, "chain"),
    purpose: stringField(body, "purpose"),
    agentAuthLoaded: booleanField(body, "agentAuthLoaded"),
    agentId: nullableStringField(body, "agentId"),
    idleTimeoutMinutes: numberField(body, "idleTimeoutMinutes"),
    genericSigningEnabled: booleanField(body, "genericSigningEnabled"),
  };
}

export async function getAtelierRegistrationSignature(
  options: BrokerRequestOptions = {},
): Promise<AtelierRegistrationSignature> {
  const body = await brokerRequest("POST", "/v1/atelier/registration-signature", {}, options);
  return {
    address: stringField(body, "address"),
    timestamp: numberField(body, "timestamp"),
    signatureBase58: stringField(body, "signatureBase58"),
    messageTemplate: stringField(body, "messageTemplate"),
  };
}

export async function storeAtelierAgentAuth(
  credentials: AtelierRegistrationCredentials,
  options: BrokerRequestOptions = {},
): Promise<{ agentId: string }> {
  const body = await brokerRequest("POST", "/v1/atelier/store-agent-auth", credentials, options);
  return { agentId: stringField(body, "agentId") };
}

export async function getAtelierApiSession(options: BrokerRequestOptions = {}): Promise<AtelierApiSession> {
  const body = await brokerRequest("POST", "/v1/atelier/api-session", {}, options);
  return {
    agentId: stringField(body, "agentId"),
    apiKey: stringField(body, "apiKey"),
  };
}

export async function isAtelierAccessBrokerAvailable(options: BrokerRequestOptions = {}): Promise<boolean> {
  try {
    const health = await getAtelierAccessHealth({ ...options, timeoutMs: options.timeoutMs ?? 1_500 });
    return health.ok;
  } catch {
    return false;
  }
}
