import { buildApp } from "./app.mjs";
import { loadConfig } from "./config.mjs";

const config = loadConfig(process.env);

const app = buildApp({
  config,
  paymentPlugin: async () => {},
});

await app.listen({ host: config.host, port: config.port });
