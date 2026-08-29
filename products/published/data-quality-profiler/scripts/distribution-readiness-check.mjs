#!/usr/bin/env node

import { loadConfig } from "../src/config.mjs";
import { buildOpenApiDocument } from "../src/openapi.mjs";
import { buildLlmsDiscovery } from "../src/llms-discovery.mjs";
import { evaluateDistributionReadiness } from "../src/distribution-readiness.mjs";

const config = loadConfig({
  // This script is a static readiness reporter; it never charges or publishes.
  // It must not require production payment config, so it runs in explicit
  // local-unpaid mode unless the operator overrides X402_PAYMENT_MODE.
  ...process.env,
  X402_PAYMENT_MODE: process.env.X402_PAYMENT_MODE ?? "local-unpaid",
});
const openapi = buildOpenApiDocument(config);
const llmsText = buildLlmsDiscovery(openapi);
const report = evaluateDistributionReadiness({
  openapi,
  llmsText,
  facilitatorUrl: config.x402FacilitatorUrl,
});

process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
process.exitCode = report.technical_status === "ready" ? 0 : 1;
