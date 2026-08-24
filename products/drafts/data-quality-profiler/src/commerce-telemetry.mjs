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
    const paymentSignature = headerText(request.headers["payment-signature"] ?? request.headers["x-payment"]);
    const paymentEnvelope = decodeBase64Json(paymentSignature);
    const accepted = paymentEnvelope?.accepted ?? paymentEnvelope?.paymentRequirements ?? null;
    const authorization = paymentEnvelope?.payload?.authorization ?? paymentEnvelope?.authorization ?? null;

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
      payment_attempted: Boolean(paymentSignature),
      payment_succeeded: false,
      payment_amount_atomic: safePaymentValue(
        accepted?.amount ?? accepted?.maxAmountRequired ?? accepted?.maxAmount
      ),
      payment_network: safePaymentValue(accepted?.network),
      payer: safePaymentValue(
        authorization?.from ?? paymentEnvelope?.payload?.from ?? paymentEnvelope?.payer
      ),
      payment_transaction: null,
    };
  });

  app.addHook("onResponse", async (request, reply) => {
    const entry = request.raw.commerceTelemetry;
    if (!entry) return;

    entry.status = reply.statusCode;
    entry.payment_required = reply.statusCode === 402;

    const settlementHeader = headerText(
      reply.getHeader("payment-response") ?? reply.getHeader("x-payment-response")
    );
    const settlement = decodeBase64Json(settlementHeader);
    const successfulHttpResponse = reply.statusCode >= 200 && reply.statusCode < 300;

    entry.payment_succeeded = Boolean(
      entry.payment_attempted &&
      successfulHttpResponse &&
      settlementHeader &&
      settlement &&
      settlement.success === true
    );

    if (entry.payment_succeeded) {
      entry.payment_transaction = safePaymentValue(
        settlement.transaction ?? settlement.txHash ?? settlement.transactionHash
      );
      entry.payment_network = safePaymentValue(settlement.network) ?? entry.payment_network;
      entry.payer = safePaymentValue(settlement.payer) ?? entry.payer;
    }

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

function decodeBase64Json(value) {
  if (!value) return null;
  try {
    const decoded = Buffer.from(value, "base64").toString("utf8");
    const parsed = JSON.parse(decoded);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function headerText(value) {
  if (Array.isArray(value)) value = value[0];
  if (typeof value === "number") return String(value);
  if (typeof value !== "string" || value.length === 0) return null;
  return value;
}

function safeHeader(value) {
  const text = headerText(value);
  if (!text) return null;
  return text.slice(0, 240);
}

function safePaymentValue(value) {
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value !== "string" || value.length === 0) return null;
  return value.slice(0, 256);
}
