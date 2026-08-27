import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { verifyAtelierWalletAuthSignature } from "../src/atelier/solana-auth.js";
import { createAtelierWalletKeystore } from "../src/atelier/wallet-store.js";
import {
  getAtelierAccessHealth,
  getAtelierApiSession,
  getAtelierRegistrationSignature,
  isAtelierAccessBrokerAvailable,
  storeAtelierAgentAuth,
} from "../src/security/atelier-access-client.js";

const PASSPHRASE = "atelier broker test passphrase 12345";

test("Atelier access broker unlocks once and exposes only narrow local capabilities", async () => {
  const root = mkdtempSync(join(tmpdir(), "atelier-access-broker-"));
  const socketPath = join(root, "run", "atelier.sock");
  const pidPath = join(root, "run", "atelier.pid");
  const walletPath = join(root, "secrets", "wallet.keystore.json");
  const authPath = join(root, "secrets", "auth.keystore.json");
  const created = createAtelierWalletKeystore(walletPath, PASSPHRASE);

  const child = spawn(process.execPath, ["--import", "tsx", "scripts/atelier-access-broker.ts"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      ATELIER_ACCESS_SOCKET: socketPath,
      ATELIER_ACCESS_PID_PATH: pidPath,
      ATELIER_WALLET_KEYSTORE_PATH: walletPath,
      ATELIER_AGENT_AUTH_KEYSTORE_PATH: authPath,
      ATELIER_ACCESS_IDLE_MINUTES: "10",
    },
    stdio: ["pipe", "pipe", "pipe"],
  });

  let stdout = "";
  let stderr = "";
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk: string) => { stdout += chunk; });
  child.stderr.on("data", (chunk: string) => { stderr += chunk; });
  child.stdin.end(`${PASSPHRASE}\n`);

  try {
    let ready = false;
    for (let attempt = 0; attempt < 80; attempt += 1) {
      if (await isAtelierAccessBrokerAvailable({ socketPath, timeoutMs: 250 })) {
        ready = true;
        break;
      }
      if (child.exitCode !== null) break;
      await sleep(50);
    }
    assert.equal(ready, true, `broker failed to start: ${stderr}`);

    const health = await getAtelierAccessHealth({ socketPath });
    assert.equal(health.address, created.address);
    assert.equal(health.chain, "solana");
    assert.equal(health.purpose, "atelier-owner-payout");
    assert.equal(health.agentAuthLoaded, false);
    assert.equal(health.genericSigningEnabled, false);
    assert.equal(statSync(socketPath).mode & 0o777, 0o600);

    const signature = await getAtelierRegistrationSignature({ socketPath });
    assert.equal(signature.address, created.address);
    assert.equal(signature.messageTemplate, "atelier:${address}:${timestamp}");
    assert.equal(verifyAtelierWalletAuthSignature({
      address: signature.address,
      timestamp: signature.timestamp,
      message: `atelier:${signature.address}:${signature.timestamp}`,
      signatureBase58: signature.signatureBase58,
    }), true);

    await storeAtelierAgentAuth({
      agentId: "ext_test_agent",
      apiKey: "atelier_test_api_key_123",
      webhookSecret: "whsec_test",
    }, { socketPath });
    const after = await getAtelierAccessHealth({ socketPath });
    assert.equal(after.agentAuthLoaded, true);
    assert.equal(after.agentId, "ext_test_agent");
    const session = await getAtelierApiSession({ socketPath });
    assert.deepEqual(session, { agentId: "ext_test_agent", apiKey: "atelier_test_api_key_123" });
    await assert.rejects(() => getAtelierRegistrationSignature({ socketPath }), /HTTP 409/);

    assert.equal(stdout.includes(PASSPHRASE), false);
    assert.equal(stderr.includes(PASSPHRASE), false);
    assert.equal(stdout.includes("atelier_test_api_key_123"), false);
    assert.equal(stderr.includes("atelier_test_api_key_123"), false);
  } finally {
    if (child.exitCode === null) child.kill("SIGTERM");
    await Promise.race([
      new Promise<void>((resolve) => child.once("exit", () => resolve())),
      sleep(2_000).then(() => undefined),
    ]);
    if (child.exitCode === null) child.kill("SIGKILL");
    rmSync(root, { recursive: true, force: true });
  }
});
