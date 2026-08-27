import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { loadAtelierAgentAuthKeystore, writeAtelierAgentAuthKeystore } from "../src/atelier/agent-auth-store.js";

test("Atelier agent auth keystore encrypts one-time API credentials", () => {
  const dir = mkdtempSync(join(tmpdir(), "atelier-auth-test-"));
  const path = join(dir, "agent-auth.keystore.json");
  const passphrase = "correct horse battery staple 456";
  try {
    writeAtelierAgentAuthKeystore(path, passphrase, {
      agentId: "ext_setup_patch",
      apiKey: "atelier_supersecret123",
      webhookSecret: "whsec_secret456",
    });
    const raw = readFileSync(path, "utf8");
    assert.match(raw, /ext_setup_patch/);
    assert.doesNotMatch(raw, /atelier_supersecret123/);
    assert.doesNotMatch(raw, /whsec_secret456/);
    assert.deepEqual(loadAtelierAgentAuthKeystore(path, passphrase), {
      agentId: "ext_setup_patch",
      apiKey: "atelier_supersecret123",
      webhookSecret: "whsec_secret456",
    });
    assert.throws(
      () => writeAtelierAgentAuthKeystore(path, passphrase, { agentId: "x", apiKey: "atelier_x", webhookSecret: null }),
      /already exists/,
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
