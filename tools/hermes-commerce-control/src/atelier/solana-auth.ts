import {
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  sign as cryptoSign,
  verify as cryptoVerify,
  type KeyObject,
} from "node:crypto";

const BASE58_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
const BASE58_INDEX = new Map([...BASE58_ALPHABET].map((char, index) => [char, index] as const));
const SOLANA_PUBLIC_KEY_BYTES = 32;
const ED25519_SIGNATURE_BYTES = 64;

function requirePositiveTimestamp(timestamp: number): number {
  if (!Number.isSafeInteger(timestamp) || timestamp <= 0) {
    throw new Error("wallet signature timestamp must be a positive millisecond integer");
  }
  return timestamp;
}

export function base58Encode(input: Uint8Array): string {
  const bytes = Buffer.from(input);
  if (bytes.length === 0) return "";

  let value = 0n;
  for (const byte of bytes) value = (value << 8n) | BigInt(byte);

  let encoded = "";
  while (value > 0n) {
    const remainder = Number(value % 58n);
    encoded = BASE58_ALPHABET[remainder] + encoded;
    value /= 58n;
  }

  let leadingZeroes = 0;
  while (leadingZeroes < bytes.length && bytes[leadingZeroes] === 0) leadingZeroes += 1;
  return "1".repeat(leadingZeroes) + encoded;
}

export function base58Decode(input: string): Buffer {
  const normalized = input.trim();
  if (!normalized) return Buffer.alloc(0);

  let value = 0n;
  for (const char of normalized) {
    const digit = BASE58_INDEX.get(char);
    if (digit === undefined) throw new Error("invalid base58 text");
    value = value * 58n + BigInt(digit);
  }

  const body: number[] = [];
  while (value > 0n) {
    body.push(Number(value & 0xffn));
    value >>= 8n;
  }
  body.reverse();

  let leadingOnes = 0;
  while (leadingOnes < normalized.length && normalized[leadingOnes] === "1") leadingOnes += 1;
  return Buffer.concat([Buffer.alloc(leadingOnes), Buffer.from(body)]);
}

function rawPublicKey(publicKey: KeyObject): Buffer {
  const jwk = publicKey.export({ format: "jwk" });
  if (jwk.kty !== "OKP" || jwk.crv !== "Ed25519" || typeof jwk.x !== "string") {
    throw new Error("expected Ed25519 public key");
  }
  const raw = Buffer.from(jwk.x, "base64url");
  if (raw.length !== SOLANA_PUBLIC_KEY_BYTES) throw new Error("unexpected Ed25519 public key length");
  return raw;
}

function requireSolanaAddress(address: string): string {
  const normalized = address.trim();
  const decoded = base58Decode(normalized);
  if (decoded.length !== SOLANA_PUBLIC_KEY_BYTES) throw new Error("invalid Solana wallet address");
  return normalized;
}

export interface AtelierSolanaWalletMaterial {
  readonly address: string;
  readonly privateKeyPkcs8: Buffer;
}

export function generateAtelierSolanaWalletMaterial(): AtelierSolanaWalletMaterial {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const privateKeyPkcs8 = Buffer.from(privateKey.export({ format: "der", type: "pkcs8" }));
  const address = base58Encode(rawPublicKey(publicKey));
  return Object.freeze({ address, privateKeyPkcs8 });
}

export function deriveSolanaAddressFromPrivateKey(privateKeyPkcs8: Uint8Array): string {
  const privateKey = createPrivateKey({
    key: Buffer.from(privateKeyPkcs8),
    format: "der",
    type: "pkcs8",
  });
  return base58Encode(rawPublicKey(createPublicKey(privateKey)));
}

export function buildAtelierWalletAuthMessage(address: string, timestamp: number): string {
  return `atelier:${requireSolanaAddress(address)}:${requirePositiveTimestamp(timestamp)}`;
}

export interface AtelierWalletSignature {
  readonly address: string;
  readonly timestamp: number;
  readonly message: string;
  readonly signatureBase58: string;
}

export function signAtelierWalletAuthMessage(
  privateKeyPkcs8: Uint8Array,
  address: string,
  timestamp: number = Date.now(),
): AtelierWalletSignature {
  const normalizedAddress = requireSolanaAddress(address);
  const derived = deriveSolanaAddressFromPrivateKey(privateKeyPkcs8);
  if (derived !== normalizedAddress) throw new Error("Atelier wallet private key does not match address");

  const normalizedTimestamp = requirePositiveTimestamp(timestamp);
  const message = buildAtelierWalletAuthMessage(normalizedAddress, normalizedTimestamp);
  const privateKey = createPrivateKey({
    key: Buffer.from(privateKeyPkcs8),
    format: "der",
    type: "pkcs8",
  });
  const signature = cryptoSign(null, Buffer.from(message, "utf8"), privateKey);
  if (signature.length !== ED25519_SIGNATURE_BYTES) throw new Error("unexpected Ed25519 signature length");

  return Object.freeze({
    address: normalizedAddress,
    timestamp: normalizedTimestamp,
    message,
    signatureBase58: base58Encode(signature),
  });
}

export function verifyAtelierWalletAuthSignature(input: AtelierWalletSignature): boolean {
  const address = requireSolanaAddress(input.address);
  const expectedMessage = buildAtelierWalletAuthMessage(address, input.timestamp);
  if (input.message !== expectedMessage) return false;
  const signature = base58Decode(input.signatureBase58);
  if (signature.length !== ED25519_SIGNATURE_BYTES) return false;

  // Construct the RFC 8410 SubjectPublicKeyInfo wrapper for a raw Ed25519 key.
  const raw = base58Decode(address);
  const spki = Buffer.concat([Buffer.from("302a300506032b6570032100", "hex"), raw]);
  const publicKey = createPublicKey({ key: spki, format: "der", type: "spki" });
  return cryptoVerify(null, Buffer.from(expectedMessage, "utf8"), publicKey, signature);
}
