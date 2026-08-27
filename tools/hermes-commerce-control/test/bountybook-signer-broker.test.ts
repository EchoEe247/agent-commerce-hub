import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import {
  encryptSecret,
  writeEncryptedSecretFile,
} from "../src/security/encrypted-secret-store.js";
import {
  getBountyBookSignerHealth,
  isBountyBookSignerBrokerAvailable,
} from "../src/security/bountybook-signer-client.js";

const PASSPHRASE = "broker test passphrase 12345";

test("signer broker: unlocks once, exposes only owner-only local health socket", async () => {
  const root = mkdtempSync(join(tmpdir(), "commerce-bountybook-broker-"));
  const socketPath = join(root, "run", "signer.sock");
  const pidPath = join(root, "run", "signer.pid");
  const keystorePath = join(root, "secrets", "bountybook-auth.keystore.json");
  const key = generatePrivateKey();
  const account = privateKeyToAccount(key);

  writeEncryptedSecretFile(
    keystorePath,
    encryptSecret(Buffer.from(key.slice(2), "hex"), PASSPHRASE, {
      purpose: "bountybook-auth",
      chain: "eip155:8453",
      address: account.address,
    }),
  );

  const child = spawn(
    process.execPath,
    ["--import", "tsx", "scripts/bountybook-signer-broker.ts"],
    {
      cwd: process.cwd(),
      env: {
        ...process.env,
        BOUNTYBOOK_SIGNER_SOCKET: socketPath,
        BOUNTYBOOK_SIGNER_PID_PATH: pidPath,
        BOUNTYBOOK_KEYSTORE_PATH: keystorePath,
        BOUNTYBOOK_SIGNER_IDLE_MINUTES: "10",
      },
      stdio: ["pipe", "pipe", "pipe"],
    },
  );

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
      if (await isBountyBookSignerBrokerAvailable({ socketPath, timeoutMs: 250 })) {
        ready = true;
        break;
      }
      if (child.exitCode !== null) break;
      await sleep(50);
    }

    assert.equal(ready, true, `broker failed to start: ${stderr}`);
    const health = await getBountyBookSignerHealth({ socketPath });
    assert.equal(health.ok, true);
    assert.equal(health.address.toLowerCase(), account.address.toLowerCase());
    assert.equal(health.chain, "eip155:8453");
    assert.equal(health.purpose, "bountybook-auth");
    assert.equal(health.tokenCached, false);
    assert.equal(statSync(socketPath).mode & 0o777, 0o600);
    assert.equal(stdout.includes(key), false);
    assert.equal(stdout.includes(PASSPHRASE), false);
    assert.equal(stderr.includes(key), false);
    assert.equal(stderr.includes(PASSPHRASE), false);
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
