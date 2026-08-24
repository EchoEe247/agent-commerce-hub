import { randomUUID } from "node:crypto";

export function installCommerceTelemetry(app, { logger = console, clock = { now: () => Date.now() } } = {}) {
  app.addHook("onRequest", async (request) => {
    const path = request.url.split("?")[0];
    if (!path.startsWith("/v1/")) return;

    request.raw.commerceTelemetry = {
      event: "commerce_request",
      request_id: `commerce_${randomUUID()}`,
      timestamp: new Date(clock.now()).toISOString(),
      method: request.method,
      path,
      status: null,
      preview: path.endsWith("/preview"),
      traffic_class: "external",
      user_agent: safeHeader(request.headers["user-agent"]),
      payment_required: false,
      payment_attempted: false,
      payment_succeeded: false,
    };
  });

  app.addHook("onResponse", async (request, reply) => {
    const entry = request.raw.commerceTelemetry;
    if (!entry) return;
    entry.status = reply.statusCode;
    entry.payment_required = reply.statusCode === 402;
    logger.log(JSON.stringify(entry));
  });
}

function safeHeader(value) {
  if (typeof value !== "string" || value.length === 0) return null;
  return value.slice(0, 240);
}
