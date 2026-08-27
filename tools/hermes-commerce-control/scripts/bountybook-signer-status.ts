import { getBountyBookSignerHealth } from "../src/security/bountybook-signer-client.js";

async function main(): Promise<void> {
  const health = await getBountyBookSignerHealth();
  console.log(`BROKER_READY=${health.ok ? "yes" : "no"}`);
  console.log(`SIGNER_ADDRESS=${health.address}`);
  console.log(`CHAIN=${health.chain}`);
  console.log(`PURPOSE=${health.purpose}`);
  console.log(`TOKEN_CACHED=${health.tokenCached ? "yes" : "no"}`);
  console.log(`TOKEN_VALID_FOR_SECONDS=${health.tokenValidForSeconds}`);
  console.log(`IDLE_TIMEOUT_MINUTES=${health.idleTimeoutMinutes}`);
  console.log("SECRET_EXPOSED=no");
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`BROKER_READY=no`);
  console.error(`BROKER_STATUS_ERROR=${message.slice(0, 300)}`);
  process.exitCode = 1;
});
