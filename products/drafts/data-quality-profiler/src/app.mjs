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

  app.post("/profile", async (request, reply) => {
    const payload = request.body;
    if (!payload || typeof payload !== "object") {
      return reply.status(400).send({ error: { code: "INVALID_DATASET", message: "body must be a JSON object" } });
    }
    const { normalizeDataset } = await import("./dataset/normalize.mjs");
    const { profileDataset } = await import("./dataset/profile.mjs");
    const { fingerprintSchema } = await import("./dataset/fingerprint.mjs");
    const { scoreProfile } = await import("./dataset/scoring.mjs");

    const normalized = normalizeDataset(payload);
    const rawProfile = profileDataset(normalized);
    const schemaFingerprint = fingerprintSchema(rawProfile.fields);
    const scored = scoreProfile(rawProfile);

    return reply.send({
      ...rawProfile,
      schema_fingerprint: schemaFingerprint,
      quality_score: scored.quality_score,
      scoring_version: scored.scoring_version,
    });
  });

  if (paymentPlugin) {
    paymentPlugin(app);
  }
  return app;
}
