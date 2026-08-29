import { buildApp } from "./app.mjs";
import { loadConfig } from "./config.mjs";
import { buildPaymentPlugin } from "./payments/x402-plugin.mjs";
import { registerRootLanding } from "./root-landing.mjs";

const config = loadConfig(process.env);

const app = buildApp({
  config,
  paymentPlugin: buildPaymentPlugin(config),
});
registerRootLanding(app);

await app.listen({ host: config.host, port: config.port });

// Deterministic startup order: initialize facilitator discovery (GET
// /supported) only after the listener is ready. Fails loudly on error.
if (typeof app.x402Ready === "function") {
  await app.x402Ready();
}
