import { existsSync } from "node:fs";
import {
  decryptSecret,
  encryptSecret,
  readEncryptedSecretFile,
  writeEncryptedSecretFile,
} from "../security/encrypted-secret-store.js";
import type { AtelierRegistrationCredentials } from "./registration-client.js";

export const ATELIER_AGENT_AUTH_PURPOSE = "atelier-agent-auth" as const;

type StoredSecretV1 = {
  readonly version: 1;
  readonly apiKey: string;
  readonly webhookSecret: string | null;
};

export function writeAtelierAgentAuthKeystore(
  path: string,
  passphrase: string,
  credentials: AtelierRegistrationCredentials,
): void {
  if (existsSync(path)) throw new Error("Atelier agent auth keystore already exists; refusing overwrite");
  const secret = Buffer.from(
    JSON.stringify({ version: 1, apiKey: credentials.apiKey, webhookSecret: credentials.webhookSecret } satisfies StoredSecretV1),
    "utf8",
  );
  try {
    const envelope = encryptSecret(secret, passphrase, {
      agentId: credentials.agentId,
      purpose: ATELIER_AGENT_AUTH_PURPOSE,
    });
    writeEncryptedSecretFile(path, envelope);
  } finally {
    secret.fill(0);
  }
}

export function loadAtelierAgentAuthKeystore(
  path: string,
  passphrase: string,
): AtelierRegistrationCredentials {
  const envelope = readEncryptedSecretFile(path);
  if (envelope.publicMetadata.purpose !== ATELIER_AGENT_AUTH_PURPOSE) {
    throw new Error("Atelier agent auth keystore purpose mismatch");
  }
  const agentId = envelope.publicMetadata.agentId;
  if (!agentId) throw new Error("Atelier agent auth keystore missing agent id metadata");

  const decrypted = decryptSecret(envelope, passphrase);
  try {
    const parsed = JSON.parse(decrypted.toString("utf8")) as Partial<StoredSecretV1>;
    if (parsed.version !== 1 || typeof parsed.apiKey !== "string" || !/^atelier_[A-Za-z0-9_-]+$/.test(parsed.apiKey)) {
      throw new Error("invalid Atelier agent auth secret payload");
    }
    const webhookSecret = typeof parsed.webhookSecret === "string" && parsed.webhookSecret.trim()
      ? parsed.webhookSecret.trim()
      : null;
    return Object.freeze({ agentId, apiKey: parsed.apiKey, webhookSecret });
  } finally {
    decrypted.fill(0);
  }
}
