import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { chmodSync, existsSync, mkdirSync, unlinkSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { stdin } from "node:process";
import {
  loadAtelierAgentAuthKeystore,
  writeAtelierAgentAuthKeystore,
} from "../src/atelier/agent-auth-store.js";
import type { AtelierRegistrationCredentials } from "../src/atelier/registration-client.js";
import { signAtelierWalletAuthMessage } from "../src/atelier/solana-auth.js";
import { loadAtelierWalletKeystore } from "../src/atelier/wallet-store.js";
import { DEFAULT_ATELIER_ACCESS_SOCKET } from "../src/security/atelier-access-client.js";

const DEFAULT_ROOT = join(homedir(), ".hermes", "commerce-control");
const DEFAULT_WALLET_KEYSTORE = join(DEFAULT_ROOT, "secrets", "atelier-solana-wallet.keystore.json");
const DEFAULT_AGENT_AUTH_KEYSTORE = join(DEFAULT_ROOT, "secrets", "atelier-agent-auth.keystore.json");
const DEFAULT_PID_FILE = join(DEFAULT_ROOT, "run", "atelier-access.pid");
const DEFAULT_IDLE_MINUTES = 8 * 60;
const MAX_BODY_BYTES = 16 * 1024;

type JsonObject = Record<string, unknown>;

function safeError(error: unknown): string {
  return error instanceof Error ? error.message.slice(0, 400) : String(error).slice(0, 400);
}

function writeJson(res: ServerResponse, status: number, body: JsonObject): void {
  const serialized = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(serialized),
    "Cache-Control": "no-store",
  });
  res.end(serialized);
}

async function readPassphraseFromStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of stdin) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  const raw = Buffer.concat(chunks);
  try {
    const passphrase = raw.toString("utf8").replace(/[\r\n]+$/, "");
    if (passphrase.length < 16) throw new Error("Atelier access broker passphrase must be at least 16 characters");
    return passphrase;
  } finally {
    raw.fill(0);
    for (const chunk of chunks) chunk.fill(0);
  }
}

async function readJsonBody(req: IncomingMessage): Promise<JsonObject> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += buffer.length;
    if (total > MAX_BODY_BYTES) throw new Error("request body exceeds broker limit");
    chunks.push(buffer);
  }
  const raw = Buffer.concat(chunks);
  try {
    if (raw.length === 0) return {};
    const parsed: unknown = JSON.parse(raw.toString("utf8"));
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("request body must be a JSON object");
    return parsed as JsonObject;
  } finally {
    raw.fill(0);
    for (const chunk of chunks) chunk.fill(0);
  }
}

function parseCredentials(body: JsonObject): AtelierRegistrationCredentials {
  const agentId = typeof body.agentId === "string" ? body.agentId.trim() : "";
  const apiKey = typeof body.apiKey === "string" ? body.apiKey.trim() : "";
  const webhookSecret = typeof body.webhookSecret === "string" && body.webhookSecret.trim()
    ? body.webhookSecret.trim()
    : null;
  if (!/^[A-Za-z0-9_-]+$/.test(agentId)) throw new Error("invalid Atelier agent id");
  if (!/^atelier_[A-Za-z0-9_-]+$/.test(apiKey)) throw new Error("invalid Atelier API key");
  return Object.freeze({ agentId, apiKey, webhookSecret });
}

async function main(): Promise<void> {
  process.umask(0o077);

  const socketPath = process.env.ATELIER_ACCESS_SOCKET?.trim() || DEFAULT_ATELIER_ACCESS_SOCKET;
  const pidPath = process.env.ATELIER_ACCESS_PID_PATH?.trim() || DEFAULT_PID_FILE;
  const walletPath = process.env.ATELIER_WALLET_KEYSTORE_PATH?.trim() || DEFAULT_WALLET_KEYSTORE;
  const authPath = process.env.ATELIER_AGENT_AUTH_KEYSTORE_PATH?.trim() || DEFAULT_AGENT_AUTH_KEYSTORE;
  const idleRaw = Number(process.env.ATELIER_ACCESS_IDLE_MINUTES ?? DEFAULT_IDLE_MINUTES);
  const idleTimeoutMinutes = Number.isFinite(idleRaw) && idleRaw >= 10 ? Math.floor(idleRaw) : DEFAULT_IDLE_MINUTES;
  const idleTimeoutMs = idleTimeoutMinutes * 60_000;

  delete process.env.ATELIER_ACCESS_SOCKET;
  delete process.env.ATELIER_ACCESS_PID_PATH;
  delete process.env.ATELIER_WALLET_KEYSTORE_PATH;
  delete process.env.ATELIER_AGENT_AUTH_KEYSTORE_PATH;
  delete process.env.ATELIER_ACCESS_IDLE_MINUTES;

  if (existsSync(socketPath)) throw new Error(`Atelier access socket already exists: ${socketPath}`);
  mkdirSync(dirname(socketPath), { recursive: true, mode: 0o700 });
  chmodSync(dirname(socketPath), 0o700);

  let passphraseForAuthStore: string | null = await readPassphraseFromStdin();
  const wallet = loadAtelierWalletKeystore(walletPath, passphraseForAuthStore);
  let credentials: AtelierRegistrationCredentials | null = null;
  if (existsSync(authPath)) {
    credentials = loadAtelierAgentAuthKeystore(authPath, passphraseForAuthStore);
    passphraseForAuthStore = null;
  }

  let lastActivityAt = Date.now();
  let shuttingDown = false;

  const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    lastActivityAt = Date.now();
    try {
      if (req.method === "GET" && req.url === "/v1/health") {
        writeJson(res, 200, {
          ok: true,
          address: wallet.address,
          chain: "solana",
          purpose: "atelier-owner-payout",
          agentAuthLoaded: credentials !== null,
          agentId: credentials?.agentId ?? null,
          idleTimeoutMinutes,
          genericSigningEnabled: false,
        });
        return;
      }

      if (req.method === "POST" && req.url === "/v1/atelier/registration-signature") {
        if (credentials !== null || existsSync(authPath)) {
          writeJson(res, 409, { error: "Atelier agent auth already exists; refusing another registration signature" });
          return;
        }
        const signature = signAtelierWalletAuthMessage(wallet.privateKeyPkcs8, wallet.address, Date.now());
        writeJson(res, 200, {
          address: signature.address,
          timestamp: signature.timestamp,
          signatureBase58: signature.signatureBase58,
          messageTemplate: "atelier:${address}:${timestamp}",
        });
        return;
      }

      if (req.method === "POST" && req.url === "/v1/atelier/store-agent-auth") {
        if (credentials !== null || existsSync(authPath)) {
          writeJson(res, 409, { error: "Atelier agent auth already stored" });
          return;
        }
        if (passphraseForAuthStore === null) throw new Error("broker no longer retains an auth-store wrapping passphrase");
        const body = await readJsonBody(req);
        const parsed = parseCredentials(body);
        writeAtelierAgentAuthKeystore(authPath, passphraseForAuthStore, parsed);
        credentials = parsed;
        passphraseForAuthStore = null;
        writeJson(res, 200, { stored: true, agentId: parsed.agentId });
        return;
      }

      if (req.method === "POST" && req.url === "/v1/atelier/api-session") {
        if (credentials === null) {
          writeJson(res, 409, { error: "Atelier agent auth is not loaded" });
          return;
        }
        writeJson(res, 200, { agentId: credentials.agentId, apiKey: credentials.apiKey });
        return;
      }

      writeJson(res, 404, { error: "unsupported Atelier access broker operation" });
    } catch (error) {
      writeJson(res, 502, { error: safeError(error) });
    }
  });

  async function cleanup(exitCode = 0): Promise<void> {
    if (shuttingDown) return;
    shuttingDown = true;
    credentials = null;
    passphraseForAuthStore = null;
    wallet.privateKeyPkcs8.fill(0);
    await new Promise<void>((resolve) => server.close(() => resolve()));
    try { unlinkSync(socketPath); } catch {}
    try { unlinkSync(pidPath); } catch {}
    process.exitCode = exitCode;
  }

  process.once("SIGINT", () => { void cleanup(0); });
  process.once("SIGTERM", () => { void cleanup(0); });

  const idleTimer = setInterval(() => {
    if (Date.now() - lastActivityAt >= idleTimeoutMs) void cleanup(0);
  }, 60_000);
  idleTimer.unref();

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(socketPath, () => resolve());
  });

  chmodSync(socketPath, 0o600);
  mkdirSync(dirname(pidPath), { recursive: true, mode: 0o700 });
  chmodSync(dirname(pidPath), 0o700);
  writeFileSync(pidPath, `${process.pid}\n`, { encoding: "utf8", mode: 0o600 });
  chmodSync(pidPath, 0o600);

  console.log("ATELIER_ACCESS_BROKER_READY=yes");
  console.log(`WALLET_ADDRESS=${wallet.address}`);
  console.log(`SOCKET_PATH=${socketPath}`);
  console.log(`AGENT_AUTH_LOADED=${credentials !== null ? "yes" : "no"}`);
  console.log(`IDLE_TIMEOUT_MINUTES=${idleTimeoutMinutes}`);
  console.log("GENERIC_SIGNING_ENABLED=no");
  console.log("PRIVATE_KEY_PRINTED=no");
  console.log("PASSPHRASE_PERSISTED_TO_DISK=no");
}

main().catch((error: unknown) => {
  console.error(`ATELIER_ACCESS_BROKER_FAILED=${safeError(error)}`);
  process.exitCode = 1;
});
