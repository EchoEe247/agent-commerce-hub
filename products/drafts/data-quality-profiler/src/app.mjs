import Fastify from "fastify";
import { randomUUID } from "node:crypto";
import { LIMITS } from "./dataset/limits.mjs";
import { classifyError } from "./errors.mjs";
import { buildCounterpartyAvailability } from "./counterparty-availability.mjs";
import {
  duplicateAudit,
  qualityGate,
  schemaDrift,
  dataContractCheck,
  cleanNormalize,
  repairPlan,
} from "./dataset/operations.mjs";

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
    const duplicatePrice = config.x402DuplicateAuditPrice ?? "$0.005";
    const qualityGatePrice = config.x402QualityGatePrice ?? "$0.01";
    const schemaDriftPrice = config.x402SchemaDriftPrice ?? "$0.015";
    const dataContractPrice = config.x402DataContractPrice ?? "$0.015";
    const cleanNormalizePrice = config.x402CleanNormalizePrice ?? "$0.02";
    const repairPlanPrice = config.x402RepairPlanPrice ?? "$0.02";
    const dataQualityPrices = [profilerPrice, duplicatePrice, qualityGatePrice, schemaDriftPrice, dataContractPrice, cleanNormalizePrice, repairPlanPrice];
    const priceRange = buildPriceRange([localePrice, ...dataQualityPrices]);
    const dataQualityPriceRange = buildPriceRange(dataQualityPrices);
    const description = "Agent-ready paid utilities for JSON and CSV data quality, schema compatibility, deterministic cleanup, repair planning, and practical counterparty contact-window checks.";

    return {
      spec: "agent402-service-manifest/1",
      version: 1,
      serviceVersion: config.serviceVersion ?? "0.1.0",
      name: "Hermes Counterparty Availability",
      summary: description,
      description,
      homepage: SELLER_ORIGIN,
      resources: [
        { url: `${SELLER_ORIGIN}/v1/counterparty-availability`, method: "POST" },
        { url: `${SELLER_ORIGIN}/v1/profile`, method: "POST" },
        { url: `${SELLER_ORIGIN}/v1/duplicate-audit`, method: "POST" },
        { url: `${SELLER_ORIGIN}/v1/quality-gate`, method: "POST" },
        { url: `${SELLER_ORIGIN}/v1/schema-drift`, method: "POST" },
        { url: `${SELLER_ORIGIN}/v1/data-contract-check`, method: "POST" },
        { url: `${SELLER_ORIGIN}/v1/clean-normalize`, method: "POST" },
        { url: `${SELLER_ORIGIN}/v1/repair-plan`, method: "POST" },
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
        tools: 8,
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
            tools: 7,
            priceRange: dataQualityPriceRange,
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
          price_usd: priceNumber(localePrice),
          network,
        },
        {
          name: "validate-json-csv-data-quality-profile-missing-duplicate-types",
          method: "POST",
          path: "/v1/profile",
          url: `${SELLER_ORIGIN}/v1/profile`,
          summary: "Validate and profile JSON or CSV datasets before ETL, RAG, analytics, or AI agent use; find missing values, duplicates and duplicate rows, inconsistent data types and type conflicts, infer field types, and return a deterministic quality score plus schema fingerprint.",
          description: "Scores dataset quality and reports missing values, duplicate rows, type conflicts, inferred field types, warnings, record and field counts, and a deterministic schema fingerprint. Accepts JSON records or CSV text.",
          price_usd: priceNumber(profilerPrice),
          network,
        },
        {
          name: "duplicate-row-audit-json-csv",
          method: "POST",
          path: "/v1/duplicate-audit",
          url: `${SELLER_ORIGIN}/v1/duplicate-audit`,
          summary: "Audit JSON or CSV duplicate rows, duplicate ratio, unique rows, and repeated row indexes.",
          description: "Deterministically finds exact duplicate rows and returns duplicate groups with first occurrence and repeated row indexes without running a full quality report.",
          price_usd: priceNumber(duplicatePrice),
          network,
        },
        {
          name: "data-quality-pass-fail-gate-etl-rag",
          method: "POST",
          path: "/v1/quality-gate",
          url: `${SELLER_ORIGIN}/v1/quality-gate`,
          summary: "Data quality pass/fail gate for ETL, RAG, analytics, and AI agent workflows using score, missing, duplicate, and mixed-type thresholds.",
          description: "Returns a machine-actionable pass/fail decision with observed metrics, threshold checks, and deterministic failure reasons.",
          price_usd: priceNumber(qualityGatePrice),
          network,
        },
        {
          name: "schema-drift-added-removed-type-changes",
          method: "POST",
          path: "/v1/schema-drift",
          url: `${SELLER_ORIGIN}/v1/schema-drift`,
          summary: "Detect schema drift between baseline and current datasets: added fields, removed fields, type changes, nullable changes, and breaking changes.",
          description: "Compares deterministic schema fingerprints and inferred field metadata for two JSON or CSV datasets.",
          price_usd: priceNumber(schemaDriftPrice),
          network,
        },
        {
          name: "data-contract-schema-compatibility-check",
          method: "POST",
          path: "/v1/data-contract-check",
          url: `${SELLER_ORIGIN}/v1/data-contract-check`,
          summary: "Check data contract and schema compatibility: required fields, expected types, extra fields, and deterministic incompatibility reasons.",
          description: "Validates a JSON or CSV dataset against an explicit field contract and returns missing fields, extra fields, type mismatches, and compatibility status.",
          price_usd: priceNumber(dataContractPrice),
          network,
        },
        {
          name: "clean-normalize-json-csv-deduplicate-trim",
          method: "POST",
          path: "/v1/clean-normalize",
          url: `${SELLER_ORIGIN}/v1/clean-normalize`,
          summary: "Clean and normalize JSON or CSV: trim strings, convert blank values to null, and deduplicate exact rows conservatively.",
          description: "Returns cleaned JSON records plus transformation counts and the resulting schema fingerprint without semantic guessing or value imputation.",
          price_usd: priceNumber(cleanNormalizePrice),
          network,
        },
        {
          name: "dataset-repair-plan-missing-duplicates-mixed-types",
          method: "POST",
          path: "/v1/repair-plan",
          url: `${SELLER_ORIGIN}/v1/repair-plan`,
          summary: "Generate a deterministic dataset repair plan for missing values, duplicate rows, mixed types, identifier integrity, and constant fields.",
          description: "Turns profiler evidence into an ordered machine-readable repair plan without modifying or inventing customer data.",
          price_usd: priceNumber(repairPlanPrice),
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

  registerDatasetOperation(app, "/v1/duplicate-audit", duplicateAudit, clock, deadlineMs);
  registerDatasetOperation(app, "/v1/quality-gate", qualityGate, clock, deadlineMs);
  registerDatasetOperation(app, "/v1/schema-drift", schemaDrift, clock, deadlineMs);
  registerDatasetOperation(app, "/v1/data-contract-check", dataContractCheck, clock, deadlineMs);
  registerDatasetOperation(app, "/v1/clean-normalize", cleanNormalize, clock, deadlineMs);
  registerDatasetOperation(app, "/v1/repair-plan", repairPlan, clock, deadlineMs);

  if (paymentPlugin) {
    paymentPlugin(app);
  }
  return app;
}

function registerDatasetOperation(app, path, operation, clock, deadlineMs) {
  app.post(path, async (request, reply) => {
    try {
      return reply.send(operation(request.body, { now: clock.now, deadlineMs }));
    } catch (error) {
      const { statusCode, body } = classifyError(error);
      return reply.status(statusCode).send(body);
    }
  });
}

function buildPriceRange(prices) {
  const values = prices.map(priceNumber).filter(Number.isFinite);
  const minimum = Math.min(...values);
  const maximum = Math.max(...values);
  return minimum === maximum ? `$${minimum}` : `$${minimum}-$${maximum}`;
}

function priceNumber(price) {
  return Number(String(price).replace("$", ""));
}

function appPresumedRequestBytes(request) {
  const header = request.headers["content-length"];
  const length = header ? Number(header) : NaN;
  return Number.isFinite(length) && length >= 0 ? length : 0;
}
