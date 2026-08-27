import { request } from "node:http";
import { homedir } from "node:os";
import { join } from "node:path";

export const DEFAULT_BOUNTYBOOK_SIGNER_SOCKET = join(
  homedir(),
  ".hermes",
  "commerce-control",
  "run",
  "bountybook-signer.sock",
);

export interface BountyBookSignerHealth {
  readonly ok: boolean;
  readonly address: string;
  readonly chain: string;
  readonly purpose: string;
  readonly tokenCached: boolean;
  readonly tokenValidForSeconds: number;
  readonly idleTimeoutMinutes: number;
}

export interface BountyBookSignerToken {
  readonly address: string;
  readonly token: string;
  readonly cached: boolean;
  readonly tokenValidForSeconds: number;
}

interface BrokerRequestOptions {
  readonly socketPath?: string;
  readonly timeoutMs?: number;
}

function parseJsonObject(text: string): Record<string, unknown> {
  const value: unknown = JSON.parse(text);
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("signer broker returned non-object JSON");
  }
  return value as Record<string, unknown>;
}

function stringField(body: Record<string, unknown>, key: string): string {
  const value = body[key];
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`signer broker response missing ${key}`);
  }
  return value;
}

function booleanField(body: Record<string, unknown>, key: string): boolean {
  const value = body[key];
  if (typeof value !== "boolean") throw new Error(`signer broker response missing ${key}`);
  return value;
}

function numberField(body: Record<string, unknown>, key: string): number {
  const value = body[key];
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`signer broker response missing ${key}`);
  }
  return value;
}

async function brokerRequest(
  method: "GET" | "POST",
  path: string,
  options: BrokerRequestOptions = {},
): Promise<Record<string, unknown>> {
  const socketPath = options.socketPath ?? DEFAULT_BOUNTYBOOK_SIGNER_SOCKET;
  const timeoutMs = options.timeoutMs ?? 5_000;

  return await new Promise<Record<string, unknown>>((resolve, reject) => {
    const req = request(
      {
        method,
        path,
        socketPath,
        headers: { Accept: "application/json" },
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
            reject(new Error(`signer broker HTTP ${status}: ${bodyText.slice(0, 300)}`));
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

    req.setTimeout(timeoutMs, () => {
      req.destroy(new Error("signer broker request timed out"));
    });
    req.once("error", reject);
    req.end();
  });
}

export async function getBountyBookSignerHealth(
  options: BrokerRequestOptions = {},
): Promise<BountyBookSignerHealth> {
  const body = await brokerRequest("GET", "/v1/health", options);
  return {
    ok: booleanField(body, "ok"),
    address: stringField(body, "address"),
    chain: stringField(body, "chain"),
    purpose: stringField(body, "purpose"),
    tokenCached: booleanField(body, "tokenCached"),
    tokenValidForSeconds: numberField(body, "tokenValidForSeconds"),
    idleTimeoutMinutes: numberField(body, "idleTimeoutMinutes"),
  };
}

export async function getBountyBookSignerToken(
  options: BrokerRequestOptions = {},
): Promise<BountyBookSignerToken> {
  const body = await brokerRequest("POST", "/v1/bountybook/token", options);
  return {
    address: stringField(body, "address"),
    token: stringField(body, "token"),
    cached: booleanField(body, "cached"),
    tokenValidForSeconds: numberField(body, "tokenValidForSeconds"),
  };
}

export async function isBountyBookSignerBrokerAvailable(
  options: BrokerRequestOptions = {},
): Promise<boolean> {
  try {
    const health = await getBountyBookSignerHealth({ ...options, timeoutMs: options.timeoutMs ?? 1_500 });
    return health.ok;
  } catch {
    return false;
  }
}
