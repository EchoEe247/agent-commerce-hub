import Fastify from "fastify";

export function buildApp({ config, paymentPlugin }) {
  const app = Fastify({
    logger: false,
    bodyLimit: 1_048_576,
  });

  app.get("/health", async () => ({
    ok: true,
    service: "data-quality-profiler",
    version: config.serviceVersion,
  }));

  app.register(paymentPlugin);
  return app;
}
