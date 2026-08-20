import Fastify from "fastify";
import { randomUUID } from "node:crypto";
import { LIMITS } from "./dataset/limits.mjs";
import { classifyError } from "./errors.mjs";
import { buildCounterpartyAvailability } from "./counterparty-availability.mjs";

export function buildApp({ config, paymentPlugin, clock = { now: () => Date.now() }, deadlineMs = LIMITS.processingMs, logger = console }) {
  const app = Fastify({
    logger: false,
    bodyLimit: LIMITS.bodyBytes,
  });

  app.addHook("onResponse", async (request, reply) => {
    if (!request.raw.profilerLog) return;
    const { buildRequestLog } = await import("./logging.mjs");
    const meta = request.raw.profilerLog;
    const entry = buildRequestLog({
      requestId: meta.request_id,
      timestamp: meta.timestamp,
      requestBytes: meta.request_bytes,
      recordCount: meta.record_count,
      fieldCount: meta.field_count,
      processingMs: meta.processing_ms,
      status: meta.status ?? reply.statusCode,
      errorCode: meta.error_code,
      paymentRef: meta.payment_ref,
    });
    logger.log(JSON.stringify(entry));
  });

  app.setErrorHandler((error, request, reply) => {
    const { statusCode, body } = classifyError(error);
    return reply.status(statusCode).send(body);
  });

  app.get("/health", async () => ({
    ok: true,
    service: "data-quality-profiler",
    version: config.serviceVersion,
  }));

  app.post("/v1/counterparty-availability", async (request, reply) => {
    const payload = request.body;
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      const { statusCode, body } = classifyError(new Error("INVALID_LOCALE_REQUEST: body must be a JSON object"));
      return reply.status(statusCode).send(body);
    }

    try {
      const result = buildCounterpartyAvailability({
        countryCode: payload.country_code,
        timezone: payload.timezone,
        at: new Date(clock.now()).toISOString(),
      });
      return reply.send(result);
    } catch (error) {
      const { statusCode, body } = classifyError(error);
      return reply.status(statusCode).send(body);
    }
  });

  app.post("/v1/profile", async (request, reply) => {
    const { now } = clock;
    const processingStart = now();
    const requestId = `prof_${randomUUID()}`;
    const payload = request.body;

    request.raw.profilerLog = { request_id: requestId, timestamp: new Date().toISOString(), request_bytes: appPresumedRequestBytes(request) };

    if (!payload || typeof payload !== "object") {
      request.raw.profilerLog.status = 400;
      request.raw.profilerLog.error_code = "INVALID_DATASET";
      const { statusCode, body } = classifyError(new Error("INVALID_DATASET: body must be a JSON object"));
      return reply.status(statusCode).send(body);
    }

    try {
      const { normalizeDataset } = await import("./dataset/normalize.mjs");
      const { profileDataset } = await import("./dataset/profile.mjs");
      const { fingerprintSchema } = await import("./dataset/fingerprint.mjs");
      const { scoreProfile } = await import("./dataset/scoring.mjs");

      const normalized = normalizeDataset(payload, { now, deadlineMs });
      const rawProfile = profileDataset(normalized, { now, deadlineMs });
      const schemaFingerprint = fingerprintSchema(rawProfile.fields);
      const scored = scoreProfile(rawProfile);
      const processingMs = Math.max(0, now() - processingStart);

      request.raw.profilerLog.timestamp = new Date().toISOString();
      request.raw.profilerLog.record_count = rawProfile.record_count;
      request.raw.profilerLog.field_count = rawProfile.field_count;
      request.raw.profilerLog.processing_ms = processingMs;
      request.raw.profilerLog.status = 200;

      return reply.send({
        schema_version: "1.0",
        scoring_version: scored.scoring_version,
        request_id: requestId,
        quality_score: scored.quality_score,
        score_breakdown: scored.score_breakdown,
        dataset: {
          record_count: rawProfile.record_count,
          field_count: rawProfile.field_count,
          duplicate_rows: rawProfile.duplicate_rows,
          schema_fingerprint: schemaFingerprint,
        },
        fields: rawProfile.fields,
        warnings: rawProfile.warnings,
        processing_ms: processingMs,
      });
    } catch (error) {
      const { statusCode, body } = classifyError(error);
      request.raw.profilerLog.status = statusCode;
      request.raw.profilerLog.error_code = body.error.code;
      return reply.status(statusCode).send(body);
    }
  });

  if (paymentPlugin) {
    paymentPlugin(app);
  }
  return app;
}

function appPresumedRequestBytes(request) {
  const header = request.headers["content-length"];
  const length = header ? Number(header) : NaN;
  return Number.isFinite(length) && length >= 0 ? length : 0;
}
