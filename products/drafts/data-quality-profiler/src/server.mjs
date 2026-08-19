import { buildApp } from "./app.mjs";
import { loadConfig } from "./config.mjs";
import { buildPaymentPlugin } from "./payments/x402-plugin.mjs";

const config = loadConfig(process.env);

const app = buildApp({
  config,
  paymentPlugin: buildPaymentPlugin(config),
});

await app.listen({ host: config.host, port: config.port });