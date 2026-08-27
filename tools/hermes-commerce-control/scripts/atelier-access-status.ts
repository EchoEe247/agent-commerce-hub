#!/usr/bin/env node
import { getAtelierAccessHealth } from "../src/security/atelier-access-client.js";

try {
  const health = await getAtelierAccessHealth();
  console.log("ATELIER_ACCESS_BROKER_AVAILABLE=yes");
  console.log(`WALLET_ADDRESS=${health.address}`);
  console.log(`CHAIN=${health.chain}`);
  console.log(`PURPOSE=${health.purpose}`);
  console.log(`AGENT_AUTH_LOADED=${health.agentAuthLoaded ? "yes" : "no"}`);
  console.log(`AGENT_ID=${health.agentId ?? "none"}`);
  console.log(`IDLE_TIMEOUT_MINUTES=${health.idleTimeoutMinutes}`);
  console.log(`GENERIC_SIGNING_ENABLED=${health.genericSigningEnabled ? "yes" : "no"}`);
} catch (error) {
  console.error(`ATELIER_ACCESS_BROKER_AVAILABLE=no`);
  console.error(`ATELIER_ACCESS_BROKER_ERROR=${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
