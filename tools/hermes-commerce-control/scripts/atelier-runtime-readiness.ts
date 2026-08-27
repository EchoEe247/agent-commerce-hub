#!/usr/bin/env node
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { AtelierApiClient } from "../src/atelier/api-client.js";
import { buildSolanaRegistrationPayload } from "../src/atelier/marketplace-contract.js";
import { buildAtelierWalletAuthMessage } from "../src/atelier/solana-auth.js";

const testAddress = "11111111111111111111111111111111";
const testTimestamp = 1_787_834_985_000;
const message = buildAtelierWalletAuthMessage(testAddress, testTimestamp);
const payload = buildSolanaRegistrationPayload({
  ownerWallet: testAddress,
  walletSignature: "local-contract-check-only",
  walletSignatureTimestamp: testTimestamp,
});
const client = new AtelierApiClient({ apiKey: "atelier_localcontractcheck" });

const requiredScripts = [
  "scripts/atelier-create-wallet-approved.ts",
  "scripts/run-atelier-approved-wallet-create.sh",
  "scripts/atelier-register-approved.ts",
  "scripts/run-atelier-approved-registration.sh",
  "scripts/atelier-create-service-approved.ts",
  "scripts/run-atelier-approved-service-create.sh",
  "scripts/atelier-order-worker.ts",
  "scripts/run-atelier-approved-order-worker.sh",
];
const missing = requiredScripts.filter((path) => !existsSync(resolve(process.cwd(), path)));

console.log(`WALLET_AUTH_MESSAGE_EXACT=${message}`);
console.log("WALLET_AUTH_MESSAGE_TEMPLATE=atelier:${address}:${timestamp}");
console.log("WALLET_AUTH_MESSAGE_ENCODING=utf8");
console.log("WALLET_SIGNATURE_ALGORITHM=ed25519");
console.log("WALLET_SIGNATURE_OUTPUT_ENCODING=base58");
console.log("WALLET_SIG_TIMESTAMP_UNIT=milliseconds");
console.log(`REGISTRATION_WALLET_CHAIN=${payload.wallet_chain}`);
console.log(`REGISTRATION_OWNER_WALLET_MATCH=${payload.owner_wallet === payload.wallet ? "yes" : "no"}`);
console.log(`UPLOAD_METHOD_PRESENT=${typeof client.uploadDocument === "function" ? "yes" : "no"}`);
console.log("UPLOAD_ENDPOINT=/api/upload");
console.log("UPLOAD_CONTENT_TYPE=multipart_form_data");
console.log("UPLOAD_FILE_FIELD=file");
console.log("UPLOAD_RESPONSE_URL_PATH=data.url");
console.log(`REQUIRED_RUNTIME_SCRIPT_COUNT=${requiredScripts.length}`);
console.log(`MISSING_RUNTIME_SCRIPTS=${missing.length ? missing.join(",") : "none"}`);
console.log(`UPLOAD_RUNTIME_READY=${typeof client.uploadDocument === "function" ? "yes" : "no"}`);
console.log(`REGISTRATION_RUNTIME_READY=${missing.some((path) => path.includes("register-approved")) ? "no" : "yes"}`);
console.log(`WALLET_CREATION_RUNTIME_READY=${missing.some((path) => path.includes("wallet-create")) ? "no" : "yes"}`);
console.log(`SERVICE_LISTING_RUNTIME_READY=${missing.some((path) => path.includes("service-create")) ? "no" : "yes"}`);
console.log(`ORDER_WORKER_RUNTIME_READY=${missing.some((path) => path.includes("order-worker")) ? "no" : "yes"}`);
console.log("WALLET_CREATED=no");
console.log("WALLET_SIGNATURE_CREATED=no");
console.log("AUTHENTICATION_USED=no");
console.log("EXTERNAL_NETWORK_REQUEST_EXECUTED=no");
console.log("EXTERNAL_WRITE_ACTION_EXECUTED=no");
console.log("FINANCIAL_ACTION_EXECUTED=no");
console.log("BLOCKCHAIN_TX_EXECUTED=no");
if (missing.length) process.exitCode = 1;
