import { existsSync } from "node:fs";
import {
  decryptSecret,
  encryptSecret,
  readEncryptedSecretFile,
  writeEncryptedSecretFile,
} from "../security/encrypted-secret-store.js";
import {
  deriveSolanaAddressFromPrivateKey,
  generateAtelierSolanaWalletMaterial,
} from "./solana-auth.js";

export const ATELIER_WALLET_PURPOSE = "atelier-owner-payout" as const;
export const ATELIER_WALLET_CHAIN = "solana" as const;

export interface StoredAtelierWallet {
  readonly address: string;
  readonly privateKeyPkcs8: Buffer;
}

type WalletSecretV1 = {
  readonly version: 1;
  readonly privateKeyPkcs8Base64: string;
};

function encodeSecret(privateKeyPkcs8: Uint8Array): Buffer {
  const body: WalletSecretV1 = {
    version: 1,
    privateKeyPkcs8Base64: Buffer.from(privateKeyPkcs8).toString("base64"),
  };
  return Buffer.from(JSON.stringify(body), "utf8");
}

function decodeSecret(raw: Uint8Array): Buffer {
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(raw).toString("utf8")) as unknown;
  } catch {
    throw new Error("invalid Atelier wallet secret payload");
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("invalid Atelier wallet secret payload");
  }
  const body = parsed as Partial<WalletSecretV1>;
  if (body.version !== 1 || typeof body.privateKeyPkcs8Base64 !== "string") {
    throw new Error("unsupported Atelier wallet secret payload");
  }
  const key = Buffer.from(body.privateKeyPkcs8Base64, "base64");
  if (key.length < 32) throw new Error("invalid Atelier wallet private key");
  return key;
}

export function createAtelierWalletKeystore(
  path: string,
  passphrase: string,
): Readonly<{ address: string; path: string }> {
  if (existsSync(path)) throw new Error("Atelier wallet keystore already exists; refusing overwrite");
  const material = generateAtelierSolanaWalletMaterial();
  const secret = encodeSecret(material.privateKeyPkcs8);
  try {
    const envelope = encryptSecret(secret, passphrase, {
      address: material.address,
      chain: ATELIER_WALLET_CHAIN,
      purpose: ATELIER_WALLET_PURPOSE,
    });
    writeEncryptedSecretFile(path, envelope);
    return Object.freeze({ address: material.address, path });
  } finally {
    material.privateKeyPkcs8.fill(0);
    secret.fill(0);
  }
}

export function loadAtelierWalletKeystore(path: string, passphrase: string): StoredAtelierWallet {
  const envelope = readEncryptedSecretFile(path);
  if (envelope.publicMetadata.chain !== ATELIER_WALLET_CHAIN) {
    throw new Error("Atelier wallet keystore chain mismatch");
  }
  if (envelope.publicMetadata.purpose !== ATELIER_WALLET_PURPOSE) {
    throw new Error("Atelier wallet keystore purpose mismatch");
  }
  const expectedAddress = envelope.publicMetadata.address;
  if (!expectedAddress) throw new Error("Atelier wallet keystore is missing public address metadata");

  const decrypted = decryptSecret(envelope, passphrase);
  let privateKeyPkcs8: Buffer | null = null;
  try {
    privateKeyPkcs8 = decodeSecret(decrypted);
    const derivedAddress = deriveSolanaAddressFromPrivateKey(privateKeyPkcs8);
    if (derivedAddress !== expectedAddress) {
      privateKeyPkcs8.fill(0);
      throw new Error("Atelier wallet keystore address integrity check failed");
    }
    return Object.freeze({ address: expectedAddress, privateKeyPkcs8 });
  } finally {
    decrypted.fill(0);
  }
}
