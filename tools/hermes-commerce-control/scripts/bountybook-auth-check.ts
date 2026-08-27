import { homedir } from "node:os";
import { join } from "node:path";
import { createPublicClient, formatEther, formatUnits, http, parseAbi } from "viem";
import { base } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";
import {
  decryptSecret,
  readEncryptedSecretFile,
} from "../src/security/encrypted-secret-store.js";

const API = "https://api.bountybook.ai";
const JOB_ID = "733d4731-7e60-4bb8-9233-ba3771c779d3";
const DEFAULT_KEYSTORE = join(
  homedir(),
  ".hermes",
  "commerce-control",
  "secrets",
  "bountybook-auth.keystore.json",
);
const BASE_RPC = "https://mainnet.base.org";
const BASE_USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as const;
const ERC20_BALANCE_ABI = parseAbi([
  "function balanceOf(address account) view returns (uint256)",
]);

type JsonObject = Record<string, unknown>;

async function json(url: string, init?: RequestInit): Promise<JsonObject> {
  const response = await fetch(url, {
    ...init,
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} from ${new URL(url).pathname}`);
  }
  const value: unknown = await response.json();
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`unexpected JSON from ${new URL(url).pathname}`);
  }
  return value as JsonObject;
}

function scalar(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return "unknown";
}

async function main(): Promise<void> {
  const passphrase = process.env.BOUNTYBOOK_KEYSTORE_PASSPHRASE;
  delete process.env.BOUNTYBOOK_KEYSTORE_PASSPHRASE;
  if (!passphrase) throw new Error("BOUNTYBOOK_KEYSTORE_PASSPHRASE is required");

  const keystorePath = process.env.BOUNTYBOOK_KEYSTORE_PATH?.trim() || DEFAULT_KEYSTORE;
  const envelope = readEncryptedSecretFile(keystorePath);
  const metadataAddress = envelope.publicMetadata.address;
  const metadataChain = envelope.publicMetadata.chain;
  const metadataPurpose = envelope.publicMetadata.purpose;

  if (!metadataAddress || metadataChain !== "eip155:8453" || metadataPurpose !== "bountybook-auth") {
    throw new Error("keystore metadata does not match the dedicated BountyBook Base identity");
  }

  const secret = decryptSecret(envelope, passphrase);
  let account: ReturnType<typeof privateKeyToAccount>;
  try {
    const keyHex = `0x${secret.toString("hex")}` as `0x${string}`;
    account = privateKeyToAccount(keyHex);
  } finally {
    secret.fill(0);
  }

  if (account.address.toLowerCase() !== metadataAddress.toLowerCase()) {
    throw new Error("decrypted key address does not match authenticated public metadata");
  }

  const nonceBody = await json(`${API}/auth/nonce?address=${encodeURIComponent(account.address)}`);
  const nonce = nonceBody.nonce;
  if (typeof nonce !== "string" || nonce.length === 0) {
    throw new Error("BountyBook nonce response did not contain a nonce");
  }

  const signature = await account.signMessage({ message: nonce });
  const verifyBody = await json(`${API}/auth/verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ address: account.address, signature }),
  });
  const token = verifyBody.token;
  const authSuccess = typeof token === "string" && token.length > 0;

  const jobBody = await json(`${API}/jobs/${JOB_ID}`);
  const jobValue = jobBody.job;
  const job =
    jobValue !== null && typeof jobValue === "object" && !Array.isArray(jobValue)
      ? (jobValue as JsonObject)
      : jobBody;
  const jobStatus = scalar(job.status).toLowerCase();
  const executor = job.executor_address ?? job.executorAddress ?? null;
  const bountyOpen = jobStatus === "open";
  const bountyClaimable = bountyOpen && (executor === null || executor === "");

  let ethBalance = "unknown";
  let usdcBalance = "unknown";
  try {
    const client = createPublicClient({ chain: base, transport: http(BASE_RPC) });
    const [ethWei, usdcRaw] = await Promise.all([
      client.getBalance({ address: account.address }),
      client.readContract({
        address: BASE_USDC,
        abi: ERC20_BALANCE_ABI,
        functionName: "balanceOf",
        args: [account.address],
      }),
    ]);
    ethBalance = formatEther(ethWei);
    usdcBalance = formatUnits(usdcRaw, 6);
  } catch {
    // Balance RPC failure must not turn a successful auth check into a secret-handling retry.
  }

  console.log(`NEW_SIGNER=${account.address}`);
  console.log(`AUTH_SUCCESS=${authSuccess ? "yes" : "no"}`);
  console.log(`NEW_SIGNER_ACCEPTED=${authSuccess ? "yes" : "no"}`);
  console.log(`ETH_BALANCE=${ethBalance}`);
  console.log(`USDC_BALANCE=${usdcBalance}`);
  console.log("AUTH_GAS_REQUIRED=no");
  console.log(`BOUNTY_OPEN=${bountyOpen ? "yes" : "no"}`);
  console.log(`BOUNTY_CLAIMABLE=${bountyClaimable ? "yes" : "no"}`);
  console.log(`BOUNTY_REWARD_USDC=${scalar(job.budget_usdc)}`);
  console.log("FINANCIAL_ACTION_EXECUTED=no");
  console.log("BOUNTY_CLAIM_EXECUTED=no");
  console.log("BOUNTY_SUBMISSION_EXECUTED=no");

  if (!authSuccess) process.exitCode = 2;
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`AUTH_CHECK_FAILED=${message}`);
  process.exitCode = 1;
});
