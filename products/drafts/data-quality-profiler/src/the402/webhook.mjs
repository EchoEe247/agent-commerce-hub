import { createHmac, timingSafeEqual } from "node:crypto";
import { qualityGate } from "../dataset/operations.mjs";

const MAX_WEBHOOK_AGE_SECONDS = 300;
const SERVICE_HANDLERS = new Map([
  ["Hermes Data Quality Gate", qualityGate],
]);

export function registerThe402Webhook(app, { config, now = () => Date.now(), fetchImpl = globalThis.fetch }) {
  app.register(async function the402WebhookScope(instance) {
    instance.removeContentTypeParser("application/json");
    instance.addContentTypeParser(
      "application/json",
      { parseAs: "string" },
      (_request, body, done) => done(null, body)
    );

    instance.post("/webhooks/the402", async (request, reply) => {
      if (!config.the402ApiKey || !config.the402WebhookSecret) {
        return fail(reply, 503, "THE402_NOT_CONFIGURED", "the402 provider webhook is not configured");
      }

      const rawBody = request.body;
      if (typeof rawBody !== "string") {
        return fail(reply, 400, "THE402_INVALID_BODY", "the402 webhook body must be JSON");
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
        return fail(reply, 400, "THE402_INVALID_BODY", "the402 webhook body must be valid JSON");
      }

      if (payload?.type !== "job_dispatch") {
        return reply.send({
          ok: true,
          accepted: false,
          type: typeof payload?.type === "string" ? payload.type : null,
        });
      }

      return handleJobDispatch(payload, reply, { config, fetchImpl });
    });
  });
}

async function handleJobDispatch(payload, reply, { config, fetchImpl }) {
  if (
    typeof payload.job_id !== "string" || payload.job_id.length === 0 ||
    typeof payload.service_id !== "string" || payload.service_id.length === 0 ||
    !payload.brief || typeof payload.brief !== "object" || Array.isArray(payload.brief) ||
    typeof payload.callback_url !== "string" || payload.callback_url.length === 0
  ) {
    return fail(reply, 400, "THE402_INVALID_JOB", "the402 job dispatch is missing required fields");
  }

  if (typeof fetchImpl !== "function") {
    return fail(reply, 503, "THE402_FETCH_UNAVAILABLE", "the402 provider HTTP client is unavailable");
  }

  const apiBase = normalizedApiBase(config.the402ApiBase);
  const serviceUrl = new URL(`/v1/services/${encodeURIComponent(payload.service_id)}`, apiBase).toString();

  let serviceResponse;
  try {
    serviceResponse = await fetchImpl(serviceUrl, {
      method: "GET",
      headers: { Accept: "application/json" },
    });
  } catch {
    return fail(reply, 502, "THE402_SERVICE_LOOKUP_FAILED", "the402 service lookup failed");
  }
  if (!serviceResponse?.ok) {
    return fail(reply, 502, "THE402_SERVICE_LOOKUP_FAILED", "the402 service lookup failed");
  }

  let service;
  try {
    service = await serviceResponse.json();
  } catch {
    return fail(reply, 502, "THE402_SERVICE_LOOKUP_FAILED", "the402 service lookup returned invalid JSON");
  }

  const handler = SERVICE_HANDLERS.get(service?.name);
  if (!handler) {
    return fail(reply, 422, "THE402_UNSUPPORTED_SERVICE", "the402 service is not supported by this provider adapter");
  }

  let callbackUrl;
  try {
    callbackUrl = new URL(payload.callback_url);
  } catch {
    return fail(reply, 400, "THE402_INVALID_CALLBACK_URL", "the402 callback URL is invalid");
  }
  if (callbackUrl.origin !== apiBase.origin) {
    return fail(reply, 400, "THE402_INVALID_CALLBACK_URL", "the402 callback URL must use the configured API origin");
  }

  let result;
  try {
    result = handler(payload.brief);
  } catch {
    return fail(reply, 400, "THE402_FULFILLMENT_FAILED", "the402 job input could not be fulfilled");
  }

  let callbackResponse;
  try {
    callbackResponse = await fetchImpl(callbackUrl.toString(), {
      method: "POST",
      headers: {
        "X-API-Key": config.the402ApiKey,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        status: "completed",
        deliverables: {
          service: service.name,
          result,
        },
      }),
    });
  } catch {
    return fail(reply, 502, "THE402_CALLBACK_FAILED", "the402 completion callback failed");
  }
  if (!callbackResponse?.ok) {
    return fail(reply, 502, "THE402_CALLBACK_FAILED", "the402 completion callback failed");
  }

  return reply.send({ ok: true, accepted: true, job_id: payload.job_id });
}

function normalizedApiBase(value) {
  const url = new URL(value || "https://api.the402.ai");
  url.pathname = "/";
  url.search = "";
  url.hash = "";
  return url;
}

function fail(reply, status, code, message) {
  return reply.status(status).send({ error: { code, message } });
}

function unauthorized(reply, code, message) {
  return fail(reply, 401, code, message);
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
