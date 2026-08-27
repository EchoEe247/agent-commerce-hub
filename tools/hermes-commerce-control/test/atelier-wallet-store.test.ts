import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createAtelierWalletKeystore, loadAtelierWalletKeystore } from "../src/atelier/wallet-store.js";
import { deriveSolanaAddressFromPrivateKey } from "../src/atelier/solana-auth.js";

test("Atelier wallet keystore encrypts private key and preserves public address metadata", () => {
  const dir = mkdtempSync(join(tmpdir(), "atelier-wallet-test-"));
  const path = join(dir, "wallet.keystore.json");
  const passphrase = "correct horse battery staple 123";
  try {
    const created = createAtelierWalletKeystore(path, passphrase);
    const raw = readFileSync(path, "utf8");
    assert.match(raw, new RegExp(created.address));
    assert.doesNotMatch(raw, /privateKeyPkcs8Base64/);
    const loaded = loadAtelierWalletKeystore(path, passphrase);
    try {
      assert.equal(loaded.address, created.address);
      assert.equal(deriveSolanaAddressFromPrivateKey(loaded.privateKeyPkcs8), created.address);
    } finally {
      loaded.privateKeyPkcs8.fill(0);
    }
    assert.throws(() => createAtelierWalletKeystore(path, passphrase), /already exists/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
