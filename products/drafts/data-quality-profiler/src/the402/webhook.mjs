export function registerThe402Webhook(app, { config }) {
  app.post("/webhooks/the402", async (_request, reply) => {
    if (!config.the402ApiKey || !config.the402WebhookSecret) {
      return reply.status(503).send({
        error: {
          code: "THE402_NOT_CONFIGURED",
          message: "the402 provider webhook is not configured",
        },
      });
    }

    return reply.status(501).send({
      error: {
        code: "THE402_NOT_IMPLEMENTED",
        message: "the402 provider webhook authentication is not implemented",
      },
    });
  });
}
