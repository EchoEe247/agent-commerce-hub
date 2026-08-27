#!/usr/bin/env node
/**
 * Creates a dedicated BountyBook EVM identity and stores only encrypted key
 * material on disk. No network request, signature, claim, submission, funding,
 * or value movement occurs here.
 *
 * The passphrase must be supplied ephemerally through
 * BOUNTYBOOK_KEYSTORE_PASSPHRASE. The script never writes or prints it.
 */
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import {
  encryptSecret,
  writeEncryptedSecretFile,
} from "../src/security/encrypted-secret-store.js";

const passphrase = process.env.BOUNTYBOOK_KEYSTORE_PASSPHRASE;
if (passphrase === undefined || passphrase.length === 0) {
  throw new Error("BOUNTYBOOK_KEYSTORE_PASSPHRASE is required and must be supplied ephemerally");
}

const path =
  process.env.BOUNTYBOOK_KEYSTORE_PATH ??
  join(homedir(), ".hermes", "commerce-control", "secrets", "bountybook-auth.keystore.json");

if (existsSync(path)) {
  throw new Error(`refusing to overwrite existing keystore at ${path}`);
}

const privateKey = generatePrivateKey();
const account = privateKeyToAccount(privateKey);
const secretBytes = Buffer.from(privateKey.slice(2), "hex");

try {
  const envelope = encryptSecret(secretBytes, passphrase, {
    purpose: "bountybook-auth",
    address: account.address,
    chain: "eip155:8453",
  });
  writeEncryptedSecretFile(path, envelope);

  process.stdout.write(
    `${JSON.stringify(
      {
        created: true,
        address: account.address,
        chain: "eip155:8453",
        purpose: "bountybook-auth",
        keystorePath: path,
        secretPrinted: false,
        networkActionExecuted: false,
        financialActionExecuted: false,
      },
      null,
      2,
    )}\n`,
  );
} finally {
  secretBytes.fill(0);
}
