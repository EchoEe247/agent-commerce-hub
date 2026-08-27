import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  decryptSecret,
  encryptSecret,
  readEncryptedSecretFile,
  writeEncryptedSecretFile,
} from "../src/security/encrypted-secret-store.js";

const PASSPHRASE = "correct horse battery staple";
const SECRET = Buffer.from("0x0123456789abcdef0123456789abcdef", "utf8");

function tempDir(): { root: string; cleanup: () => void } {
  const root = mkdtempSync(join(tmpdir(), "commerce-encrypted-secret-"));
  return {
    root,
    cleanup: () => rmSync(root, { recursive: true, force: true }),
  };
}

test("encrypted store: round-trips secret while keeping public metadata readable", () => {
  const envelope = encryptSecret(SECRET, PASSPHRASE, {
    purpose: "bountybook-auth",
    address: "0x1111111111111111111111111111111111111111",
    chain: "eip155:8453",
  });
  assert.equal(envelope.publicMetadata.purpose, "bountybook-auth");
  assert.equal(envelope.publicMetadata.chain, "eip155:8453");

  const plaintext = decryptSecret(envelope, PASSPHRASE);
  try {
    assert.deepEqual(plaintext, SECRET);
  } finally {
    plaintext.fill(0);
  }
});

test("encrypted store: wrong passphrase fails closed", () => {
  const envelope = encryptSecret(SECRET, PASSPHRASE);
  assert.throws(() => decryptSecret(envelope, "this passphrase is definitely wrong"), /decryption failed/i);
});

test("encrypted store: authenticated metadata cannot be tampered with", () => {
  const envelope = encryptSecret(SECRET, PASSPHRASE, { purpose: "bountybook-auth" });
  const tampered = {
    ...envelope,
    publicMetadata: { ...envelope.publicMetadata, purpose: "other-purpose" },
  };
  assert.throws(() => decryptSecret(tampered, PASSPHRASE), /decryption failed/i);
});

test("encrypted store: serialized keystore never contains plaintext secret", () => {
  const roots = tempDir();
  try {
    const path = join(roots.root, "secrets", "bountybook-auth.keystore.json");
    const envelope = encryptSecret(SECRET, PASSPHRASE, {
      purpose: "bountybook-auth",
      address: "0x1111111111111111111111111111111111111111",
    });
    writeEncryptedSecretFile(path, envelope);

    const serialized = readFileSync(path, "utf8");
    assert.equal(serialized.includes(SECRET.toString("utf8")), false);

    const loaded = readEncryptedSecretFile(path);
    const plaintext = decryptSecret(loaded, PASSPHRASE);
    try {
      assert.deepEqual(plaintext, SECRET);
    } finally {
      plaintext.fill(0);
    }
  } finally {
    roots.cleanup();
  }
});

test("encrypted store: keystore and parent directory are owner-only", () => {
  const roots = tempDir();
  try {
    const parent = join(roots.root, "secrets");
    const path = join(parent, "identity.keystore.json");
    writeEncryptedSecretFile(path, encryptSecret(SECRET, PASSPHRASE));

    assert.equal(statSync(path).mode & 0o777, 0o600);
    assert.equal(statSync(parent).mode & 0o777, 0o700);
  } finally {
    roots.cleanup();
  }
});

test("encrypted store: weak passphrases are rejected before encryption", () => {
  assert.throws(() => encryptSecret(SECRET, "too-short"), /at least 16 characters/i);
});
