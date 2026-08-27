import test from "node:test";
import assert from "node:assert/strict";
import {
  base58Decode,
  buildAtelierWalletAuthMessage,
  generateAtelierSolanaWalletMaterial,
  signAtelierWalletAuthMessage,
  verifyAtelierWalletAuthSignature,
} from "../src/atelier/solana-auth.js";

test("Atelier Solana auth signs exact documented UTF-8 message", () => {
  const wallet = generateAtelierSolanaWalletMaterial();
  try {
    assert.equal(base58Decode(wallet.address).length, 32);
    const timestamp = 1_787_834_985_123;
    const signed = signAtelierWalletAuthMessage(wallet.privateKeyPkcs8, wallet.address, timestamp);
    assert.equal(signed.message, `atelier:${wallet.address}:${timestamp}`);
    assert.equal(signed.message, buildAtelierWalletAuthMessage(wallet.address, timestamp));
    assert.equal(base58Decode(signed.signatureBase58).length, 64);
    assert.equal(verifyAtelierWalletAuthSignature(signed), true);
  } finally {
    wallet.privateKeyPkcs8.fill(0);
  }
});

test("Atelier Solana auth rejects address/key mismatch", () => {
  const first = generateAtelierSolanaWalletMaterial();
  const second = generateAtelierSolanaWalletMaterial();
  try {
    assert.throws(
      () => signAtelierWalletAuthMessage(first.privateKeyPkcs8, second.address, Date.now()),
      /does not match address/,
    );
  } finally {
    first.privateKeyPkcs8.fill(0);
    second.privateKeyPkcs8.fill(0);
  }
});
