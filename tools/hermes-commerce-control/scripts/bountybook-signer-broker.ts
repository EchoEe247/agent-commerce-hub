import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { stdin } from "node:process";
import { privateKeyToAccount } from "viem/accounts";
import {
  decryptSecret,
  readEncryptedSecretFile,
} from "../src/security/encrypted-secret-store.js";
import { DEFAULT_BOUNTYBOOK_SIGNER_SOCKET } from "../src/security/bountybook-signer-client.js";

const API = "https://api.bountybook.ai";
const DEFAULT_KEYSTORE = join(
  homedir(),
  ".hermes",
  "commerce-control",
  "secrets",
  "bountybook-auth.keystore.json",
);
const DEFAULT_PID_FILE = join(
  homedir(),
  ".hermes",
  "commerce-control",
  "run",
  "bountybook-signer.pid",
);
const DEFAULT_IDLE_MINUTES = 8 * 60;
const TOKEN_CACHE_MS = 50 * 60 * 1000;

type JsonObject = Record<string, unknown>;

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
  for await (const chunk of stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const raw = Buffer.concat(chunks);
  try {
    const passphrase = raw.toString("utf8").replace(/[\r\n]+$/, "");
    if (!passphrase) throw new Error("signer broker received an empty passphrase");
    return passphrase;
  } finally {
    raw.fill(0);
    for (const chunk of chunks) chunk.fill(0);
  }
}

async function requestJson(url: string, init?: RequestInit): Promise<{ status: number; body: JsonObject }> {
  const response = await fetch(url, {
    ...init,
    signal: AbortSignal.timeout(15_000),
  });
  let value: unknown = {};
  try {
    value = await response.json();
  } catch {
    value = {};
  }
  const body = value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonObject)
    : {};
  return { status: response.status, body };
}

function safeError(error: unknown): string {
  return error instanceof Error ? error.message.slice(0, 400) : String(error).slice(0, 400);
}

async function main(): Promise<void> {
  process.umask(0o077);

  const socketPath = process.env.BOUNTYBOOK_SIGNER_SOCKET?.trim() || DEFAULT_BOUNTYBOOK_SIGNER_SOCKET;
  const pidPath = process.env.BOUNTYBOOK_SIGNER_PID_PATH?.trim() || DEFAULT_PID_FILE;
  const keystorePath = process.env.BOUNTYBOOK_KEYSTORE_PATH?.trim() || DEFAULT_KEYSTORE;
  const idleRaw = Number(process.env.BOUNTYBOOK_SIGNER_IDLE_MINUTES ?? DEFAULT_IDLE_MINUTES);
  const idleTimeoutMinutes = Number.isFinite(idleRaw) && idleRaw >= 10 ? Math.floor(idleRaw) : DEFAULT_IDLE_MINUTES;
  const idleTimeoutMs = idleTimeoutMinutes * 60_000;

  delete process.env.BOUNTYBOOK_SIGNER_SOCKET;
  delete process.env.BOUNTYBOOK_SIGNER_PID_PATH;
  delete process.env.BOUNTYBOOK_KEYSTORE_PATH;
  delete process.env.BOUNTYBOOK_SIGNER_IDLE_MINUTES;

  if (existsSync(socketPath)) {
    throw new Error(`signer socket already exists: ${socketPath}`);
  }

  mkdirSync(dirname(socketPath), { recursive: true, mode: 0o700 });
  chmodSync(dirname(socketPath), 0o700);

  let passphrase = await readPassphraseFromStdin();
  const envelope = readEncryptedSecretFile(keystorePath);
  const metadataAddress = envelope.publicMetadata.address;
  if (
    !metadataAddress ||
    envelope.publicMetadata.chain !== "eip155:8453" ||
    envelope.publicMetadata.purpose !== "bountybook-auth"
  ) {
    passphrase = "";
    throw new Error("keystore metadata does not match a dedicated BountyBook Base identity");
  }

  const secret = decryptSecret(envelope, passphrase);
  passphrase = "";
  let account: ReturnType<typeof privateKeyToAccount>;
  try {
    account = privateKeyToAccount(`0x${secret.toString("hex")}` as `0x${string}`);
  } finally {
    secret.fill(0);
  }

  if (account.address.toLowerCase() !== metadataAddress.toLowerCase()) {
    throw new Error("decrypted signer does not match authenticated keystore metadata");
  }

  let cachedToken: string | null = null;
  let cachedTokenExpiresAt = 0;
  let lastActivityAt = Date.now();
  let shuttingDown = false;

  async function getToken(): Promise<{ token: string; cached: boolean; validForSeconds: number }> {
    const now = Date.now();
    if (cachedToken !== null && cachedTokenExpiresAt - now > 60_000) {
      return {
        token: cachedToken,
        cached: true,
        validForSeconds: Math.max(0, Math.floor((cachedTokenExpiresAt - now) / 1000)),
      };
    }

    const nonceResponse = await requestJson(
      `${API}/auth/nonce?address=${encodeURIComponent(account.address)}`,
    );
    const nonce = nonceResponse.body.nonce;
    if (nonceResponse.status !== 200 || typeof nonce !== "string" || nonce.length === 0) {
      throw new Error(`BountyBook nonce failed HTTP ${nonceResponse.status}`);
    }

    const signature = await account.signMessage({ message: nonce });
    const verifyResponse = await requestJson(`${API}/auth/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ address: account.address, signature }),
    });
    const token = verifyResponse.body.token;
    if (verifyResponse.status !== 200 || typeof token !== "string" || token.length === 0) {
      throw new Error(`BountyBook auth verify failed HTTP ${verifyResponse.status}`);
    }

    cachedToken = token;
    cachedTokenExpiresAt = Date.now() + TOKEN_CACHE_MS;
    return { token, cached: false, validForSeconds: Math.floor(TOKEN_CACHE_MS / 1000) };
  }

  const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    lastActivityAt = Date.now();
    try {
      if (req.method === "GET" && req.url === "/v1/health") {
        const validForSeconds = cachedToken === null
          ? 0
          : Math.max(0, Math.floor((cachedTokenExpiresAt - Date.now()) / 1000));
        writeJson(res, 200, {
          ok: true,
          address: account.address,
          chain: "eip155:8453",
          purpose: "bountybook-auth",
          tokenCached: cachedToken !== null && validForSeconds > 0,
          tokenValidForSeconds: validForSeconds,
          idleTimeoutMinutes,
        });
        return;
      }

      if (req.method === "POST" && req.url === "/v1/bountybook/token") {
        const result = await getToken();
        writeJson(res, 200, {
          address: account.address,
          token: result.token,
          cached: result.cached,
          tokenValidForSeconds: result.validForSeconds,
        });
        return;
      }

      writeJson(res, 404, { error: "unsupported signer broker operation" });
    } catch (error) {
      writeJson(res, 502, { error: safeError(error) });
    }
  });

  async function cleanup(exitCode = 0): Promise<void> {
    if (shuttingDown) return;
    shuttingDown = true;
    cachedToken = null;
    cachedTokenExpiresAt = 0;
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

  console.log(`BOUNTYBOOK_SIGNER_BROKER_READY=yes`);
  console.log(`SIGNER_ADDRESS=${account.address}`);
  console.log(`SOCKET_PATH=${socketPath}`);
  console.log(`IDLE_TIMEOUT_MINUTES=${idleTimeoutMinutes}`);
  console.log(`PRIVATE_KEY_PRINTED=no`);
  console.log(`PASSPHRASE_PERSISTED=no`);
}

main().catch((error: unknown) => {
  console.error(`BOUNTYBOOK_SIGNER_BROKER_FAILED=${safeError(error)}`);
  process.exitCode = 1;
});
