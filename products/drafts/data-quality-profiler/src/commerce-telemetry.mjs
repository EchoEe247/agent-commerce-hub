import { randomUUID } from "node:crypto";

const MARKETPLACE_MARKERS = [
  ["agent402", "agent402"],
  ["x402scan", "x402scan"],
  ["agentcash", "agentcash"],
  ["402index", "402index"],
  ["402 index", "402index"],
  ["toll402", "toll402"],
];

export function installCommerceTelemetry(app, { logger = console, clock = { now: () => Date.now() } } = {}) {
  app.addHook("onRequest", async (request) => {
    const path = request.url.split("?")[0];
    if (!path.startsWith("/v1/")) return;

    const userAgent = safeHeader(request.headers["user-agent"]);
    const referer = safeHeader(request.headers.referer ?? request.headers.referrer);
    const attribution = classifyTraffic(userAgent, referer);

    request.raw.commerceTelemetry = {
      event: "commerce_request",
      request_id: `commerce_${randomUUID()}`,
      timestamp: new Date(clock.now()).toISOString(),
      method: request.method,
      path,
      status: null,
      preview: path.endsWith("/preview"),
      traffic_class: attribution.traffic_class,
      source: attribution.source,
      user_agent: userAgent,
      referer,
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

function classifyTraffic(userAgent, referer) {
  const haystack = `${userAgent ?? ""} ${referer ?? ""}`.toLowerCase();
  for (const [marker, source] of MARKETPLACE_MARKERS) {
    if (haystack.includes(marker)) {
      return { traffic_class: "marketplace_probe", source };
    }
  }
  return { traffic_class: "external", source: null };
}

function safeHeader(value) {
  if (typeof value !== "string" || value.length === 0) return null;
  return value.slice(0, 240);
}
