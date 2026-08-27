import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  scryptSync,
} from "node:crypto";
import {
  chmodSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { dirname } from "node:path";

const VERSION = 1 as const;
const CIPHER = "aes-256-gcm" as const;
const KDF = "scrypt" as const;
const KEY_LENGTH = 32;
const SCRYPT_N = 32_768;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const SCRYPT_MAXMEM = 64 * 1024 * 1024;
const SALT_BYTES = 16;
const IV_BYTES = 12;
const MIN_PASSPHRASE_LENGTH = 16;

export interface EncryptedSecretEnvelopeV1 {
  readonly version: typeof VERSION;
  readonly cipher: typeof CIPHER;
  readonly kdf: typeof KDF;
  readonly kdfParams: {
    readonly n: number;
    readonly r: number;
    readonly p: number;
    readonly keyLength: number;
    readonly salt: string;
  };
  readonly iv: string;
  readonly ciphertext: string;
  readonly authTag: string;
  /** Public-only metadata. It is authenticated as AAD and may be read without decrypting. */
  readonly publicMetadata: Readonly<Record<string, string>>;
}

function requireStrongPassphrase(passphrase: string): void {
  if (passphrase.length < MIN_PASSPHRASE_LENGTH) {
    throw new Error(`keystore passphrase must be at least ${MIN_PASSPHRASE_LENGTH} characters`);
  }
}

function canonicalMetadata(metadata: Readonly<Record<string, string>>): Readonly<Record<string, string>> {
  const entries = Object.entries(metadata)
    .map(([key, value]) => [key.trim(), value.trim()] as const)
    .filter(([key]) => key.length > 0)
    .sort(([a], [b]) => a.localeCompare(b));
  return Object.freeze(Object.fromEntries(entries));
}

function aadFor(metadata: Readonly<Record<string, string>>): Buffer {
  return Buffer.from(
    JSON.stringify({
      version: VERSION,
      cipher: CIPHER,
      kdf: KDF,
      publicMetadata: canonicalMetadata(metadata),
    }),
    "utf8",
  );
}

function deriveKey(passphrase: string, salt: Buffer): Buffer {
  requireStrongPassphrase(passphrase);
  return scryptSync(passphrase, salt, KEY_LENGTH, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
    maxmem: SCRYPT_MAXMEM,
  });
}

export function encryptSecret(
  secret: Uint8Array,
  passphrase: string,
  publicMetadata: Readonly<Record<string, string>> = {},
): EncryptedSecretEnvelopeV1 {
  if (secret.byteLength === 0) throw new Error("cannot encrypt an empty secret");

  const metadata = canonicalMetadata(publicMetadata);
  const salt = randomBytes(SALT_BYTES);
  const iv = randomBytes(IV_BYTES);
  const key = deriveKey(passphrase, salt);
  const plaintext = Buffer.from(secret);

  try {
    const cipher = createCipheriv(CIPHER, key, iv);
    cipher.setAAD(aadFor(metadata));
    const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    const authTag = cipher.getAuthTag();

    return Object.freeze({
      version: VERSION,
      cipher: CIPHER,
      kdf: KDF,
      kdfParams: Object.freeze({
        n: SCRYPT_N,
        r: SCRYPT_R,
        p: SCRYPT_P,
        keyLength: KEY_LENGTH,
        salt: salt.toString("base64"),
      }),
      iv: iv.toString("base64"),
      ciphertext: ciphertext.toString("base64"),
      authTag: authTag.toString("base64"),
      publicMetadata: metadata,
    });
  } finally {
    plaintext.fill(0);
    key.fill(0);
  }
}

function parseEnvelope(value: unknown): EncryptedSecretEnvelopeV1 {
  if (value === null || typeof value !== "object") throw new Error("invalid encrypted keystore envelope");
  const envelope = value as Partial<EncryptedSecretEnvelopeV1>;
  if (envelope.version !== VERSION || envelope.cipher !== CIPHER || envelope.kdf !== KDF) {
    throw new Error("unsupported encrypted keystore format");
  }
  const params = envelope.kdfParams;
  if (
    params === undefined ||
    params.n !== SCRYPT_N ||
    params.r !== SCRYPT_R ||
    params.p !== SCRYPT_P ||
    params.keyLength !== KEY_LENGTH ||
    typeof params.salt !== "string" ||
    typeof envelope.iv !== "string" ||
    typeof envelope.ciphertext !== "string" ||
    typeof envelope.authTag !== "string" ||
    envelope.publicMetadata === undefined ||
    envelope.publicMetadata === null ||
    typeof envelope.publicMetadata !== "object"
  ) {
    throw new Error("invalid encrypted keystore envelope");
  }

  const metadataEntries = Object.entries(envelope.publicMetadata);
  if (metadataEntries.some(([key, val]) => key.length === 0 || typeof val !== "string")) {
    throw new Error("invalid encrypted keystore public metadata");
  }

  return Object.freeze({
    version: VERSION,
    cipher: CIPHER,
    kdf: KDF,
    kdfParams: Object.freeze({
      n: SCRYPT_N,
      r: SCRYPT_R,
      p: SCRYPT_P,
      keyLength: KEY_LENGTH,
      salt: params.salt,
    }),
    iv: envelope.iv,
    ciphertext: envelope.ciphertext,
    authTag: envelope.authTag,
    publicMetadata: canonicalMetadata(envelope.publicMetadata),
  });
}

export function decryptSecret(envelopeValue: unknown, passphrase: string): Buffer {
  const envelope = parseEnvelope(envelopeValue);
  const salt = Buffer.from(envelope.kdfParams.salt, "base64");
  const iv = Buffer.from(envelope.iv, "base64");
  const ciphertext = Buffer.from(envelope.ciphertext, "base64");
  const authTag = Buffer.from(envelope.authTag, "base64");
  const key = deriveKey(passphrase, salt);

  try {
    const decipher = createDecipheriv(CIPHER, key, iv);
    decipher.setAAD(aadFor(envelope.publicMetadata));
    decipher.setAuthTag(authTag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  } catch {
    throw new Error("keystore decryption failed");
  } finally {
    key.fill(0);
  }
}

export function writeEncryptedSecretFile(path: string, envelopeValue: unknown): void {
  const envelope = parseEnvelope(envelopeValue);
  const parent = dirname(path);
  mkdirSync(parent, { recursive: true, mode: 0o700 });
  chmodSync(parent, 0o700);

  const tmpPath = `${path}.tmp-${process.pid}-${randomBytes(6).toString("hex")}`;
  const body = `${JSON.stringify(envelope, null, 2)}\n`;
  writeFileSync(tmpPath, body, { encoding: "utf8", mode: 0o600, flag: "wx" });
  chmodSync(tmpPath, 0o600);
  renameSync(tmpPath, path);
  chmodSync(path, 0o600);
}

export function readEncryptedSecretFile(path: string): EncryptedSecretEnvelopeV1 {
  const parsed: unknown = JSON.parse(readFileSync(path, "utf8"));
  return parseEnvelope(parsed);
}
