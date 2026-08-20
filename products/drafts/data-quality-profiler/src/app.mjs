import Fastify from "fastify";
import { randomUUID } from "node:crypto";
import { LIMITS } from "./dataset/limits.mjs";
import { classifyError } from "./errors.mjs";
import { buildCounterpartyAvailability } from "./counterparty-availability.mjs";

const SELLER_ORIGIN = "https://hermes-counterparty-api.onrender.com";
const INDEX402_VERIFICATION_HASH = "38c7d63638e26a694fdf51fd1b213221e26d73044847c5dac48bf4aa19756605";

export function buildApp({ config, paymentPlugin, clock = { now: () => Date.now() }, deadlineMs = LIMITS.processingMs, logger = console }) {
  const app = Fastify({
    logger: false,
    bodyLimit: LIMITS.bodyBytes,
    trustProxy: true,
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

  app.get("/.well-known/402index-verify.txt", async (_request, reply) => (
    reply.type("text/plain").send(INDEX402_VERIFICATION_HASH)
  ));

  app.get("/.well-known/x402", async () => {
    const network = config.x402Network ?? "eip155:8453";
    const localePrice = config.x402LocalePrice ?? "$0.03";
    const profilerPrice = config.x402Price ?? "$0.02";
    const priceRange = profilerPrice === localePrice ? profilerPrice : `${profilerPrice}-${localePrice}`;
    const description = "Agent-ready utilities for dataset quality profiling and practical counterparty contact-window checks.";

    return {
      spec: "agent402-service-manifest/1",
      version: 1,
      serviceVersion: config.serviceVersion ?? "0.1.0",
      name: "Hermes Counterparty Availability",
      summary: description,
      description,
      homepage: SELLER_ORIGIN,
      resources: [
        `${SELLER_ORIGIN}/v1/counterparty-availability`,
        `${SELLER_ORIGIN}/v1/profile`,
      ],
      payment: {
        x402: {
          version: 2,
          currency: "USDC",
          networks: [network],
          primaryNetwork: network,
          priceRange,
          payTo: config.x402PayTo || null,
          payToName: "Hermes Commerce Earning Wallet",
          nonCustodial: true,
        },
      },
      capabilities: {
        tools: 2,
        categories: [
          {
            key: "business-intelligence",
            label: "Business Intelligence",
            tools: 1,
            priceRange: localePrice,
          },
          {
            key: "data-quality",
            label: "Data Quality",
            tools: 1,
            priceRange: profilerPrice,
          },
        ],
      },
      endpoints: [
        {
          name: "counterparty-availability",
          method: "POST",
          path: "/v1/counterparty-availability",
          url: `${SELLER_ORIGIN}/v1/counterparty-availability`,
          summary: "Counterparty availability and contact-window brief",
          description: "Returns local time, public-holiday status, business-day status, business days remaining this week, and the next practical local contact time.",
          price_usd: Number(String(localePrice).replace("$", "")),
          network,
        },
        {
          name: "validate-json-csv-data-quality-profile-missing-duplicate-types",
          method: "POST",
          path: "/v1/profile",
          url: `${SELLER_ORIGIN}/v1/profile`,
          summary: "Validate and profile JSON or CSV datasets before ETL, RAG, analytics, or AI agent use; find missing values, duplicates and duplicate rows, inconsistent data types and type conflicts, infer field types, and return a deterministic quality score plus schema fingerprint.",
          description: "Scores dataset quality and reports missing values, duplicate rows, type conflicts, inferred field types, warnings, record and field counts, and a deterministic schema fingerprint. Accepts JSON records or CSV text.",
          price_usd: Number(String(profilerPrice).replace("$", "")),
          network,
        },
      ],
    };
  });

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
