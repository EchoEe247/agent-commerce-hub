import { buildApp } from "./app.mjs";

const app = buildApp({
  config: { serviceVersion: "0.1.0" },
  paymentPlugin: async () => {},
});

await app.listen({ host: "0.0.0.0", port: 4021 });
