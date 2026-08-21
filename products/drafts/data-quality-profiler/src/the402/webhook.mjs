import { createHmac, timingSafeEqual } from "node:crypto";

const MAX_WEBHOOK_AGE_SECONDS = 300;

export function registerThe402Webhook(app, { config, now = () => Date.now() }) {
  app.register(async function the402WebhookScope(instance) {
    instance.removeContentTypeParser("application/json");
    instance.addContentTypeParser(
      "application/json",
      { parseAs: "string" },
      (_request, body, done) => done(null, body)
    );

    instance.post("/webhooks/the402", async (request, reply) => {
      if (!config.the402ApiKey || !config.the402WebhookSecret) {
        return reply.status(503).send({
          error: {
            code: "THE402_NOT_CONFIGURED",
            message: "the402 provider webhook is not configured",
          },
        });
      }

      const rawBody = request.body;
      if (typeof rawBody !== "string") {
        return reply.status(400).send({
          error: {
            code: "THE402_INVALID_BODY",
            message: "the402 webhook body must be JSON",
          },
        });
      }

      const platformSecret = headerValue(request.headers["x-platform-secret"]);
      if (!safeEqual(platformSecret, config.the402ApiKey)) {
        return unauthorized(reply, "THE402_UNAUTHORIZED", "the402 platform secret is invalid");
      }

      const timestamp = headerValue(request.headers["x-webhook-timestamp"]);
      const timestampSeconds = Number(timestamp);
      if (
        !timestamp ||
        !Number.isInteger(timestampSeconds) ||
        Math.abs(now() / 1000 - timestampSeconds) > MAX_WEBHOOK_AGE_SECONDS
      ) {
        return unauthorized(reply, "THE402_STALE_SIGNATURE", "the402 webhook timestamp is stale or invalid");
      }

      const suppliedSignature = headerValue(request.headers["x-webhook-signature"]);
      const expectedSignature = "sha256=" + createHmac("sha256", config.the402WebhookSecret)
        .update(`${timestamp}.${rawBody}`)
        .digest("hex");
      if (!safeEqual(suppliedSignature, expectedSignature)) {
        return unauthorized(reply, "THE402_INVALID_SIGNATURE", "the402 webhook signature is invalid");
      }

      let payload;
      try {
        payload = JSON.parse(rawBody);
      } catch {
        return reply.status(400).send({
          error: {
            code: "THE402_INVALID_BODY",
            message: "the402 webhook body must be valid JSON",
          },
        });
      }

      return reply.send({
        ok: true,
        accepted: false,
        type: typeof payload?.type === "string" ? payload.type : null,
      });
    });
  });
}

function unauthorized(reply, code, message) {
  return reply.status(401).send({ error: { code, message } });
}

function headerValue(value) {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function safeEqual(left, right) {
  const leftBuffer = Buffer.from(String(left));
  const rightBuffer = Buffer.from(String(right));
  if (leftBuffer.length !== rightBuffer.length) return false;
  return timingSafeEqual(leftBuffer, rightBuffer);
}
