import { x402ResourceServer } from "@x402/core/server";
import { HTTPFacilitatorClient } from "@x402/core/server";
import { ExactEvmScheme } from "@x402/evm/exact/server";
import { paymentMiddleware } from "@x402/fastify";
import { declareDiscoveryExtension, bazaarResourceServerExtension } from "@x402/extensions/bazaar";

const JSON_DATASET_SCHEMA = {
  type: "object",
  properties: {
    format: { type: "string", const: "json" },
    records: { type: "array", items: { type: "object" } },
  },
  required: ["format", "records"],
};

const CSV_DATASET_SCHEMA = {
  type: "object",
  properties: {
    format: { type: "string", const: "csv" },
    data: { type: "string" },
  },
  required: ["format", "data"],
};

const DATASET_SCHEMA = {
  oneOf: [JSON_DATASET_SCHEMA, CSV_DATASET_SCHEMA],
};

export function buildPaymentPlugin(config) {
  return function installPayment(app) {
    if (!config.x402Enabled) return;

    const facilitatorClient = new HTTPFacilitatorClient({ url: config.x402FacilitatorUrl });
    const resourceServer = new x402ResourceServer(facilitatorClient)
      .register(config.x402Network, new ExactEvmScheme())
      .registerExtension(bazaarResourceServerExtension);

    const profilerBazaarExtension = declareDiscoveryExtension({
      bodyType: "json",
      input: { format: "json", records: [{ id: 1 }] },
      inputSchema: DATASET_SCHEMA,
      output: {
        example: {
          schema_version: "1.0",
          scoring_version: "1.0",
          quality_score: 85,
          dataset: { record_count: 100, field_count: 5 },
          fields: {}, warnings: [], processing_ms: 42,
        },
      },
    });

    const counterpartyBazaarExtension = declareDiscoveryExtension({
      bodyType: "json",
      input: { country_code: "US", timezone: "America/Chicago" },
      inputSchema: {
        type: "object",
        properties: {
          country_code: {
            type: "string",
            enum: ["US", "CA", "MX", "GB", "DE", "FR", "ES", "IT", "BR", "JP", "IN", "AU"],
            description: "ISO 3166-1 alpha-2 country code",
          },
          timezone: {
            type: "string",
            description: "Optional IANA timezone; defaults to the country's primary business timezone",
          },
        },
        required: ["country_code"],
      },
      output: {
        example: {
          country: { code: "US", name: "United States", currency: "USD", calling_code: "+1", holiday_scope: "US federal" },
          timezone: "America/Chicago",
          timezone_source: "request",
          local: { date: "2026-08-20", time: "08:00", weekday: "Thu", iso: "2026-08-20T08:00" },
          business: {
            is_weekend: false,
            is_public_holiday: false,
            holiday_name: null,
            is_business_day: true,
            business_days_remaining_this_week: 2,
            next_business_date: "2026-08-20",
            contact_window: "closed",
            next_contact_local: "2026-08-20T09:00",
            assumed_business_hours: "09:00-17:00 local",
          },
        },
      },
    });

    const sanctionsBazaarExtension = declareDiscoveryExtension({
      bodyType: "json",
      input: { name: "ACME SHIPPING LLC" },
      inputSchema: {
        type: "object",
        properties: {
          name: {
            type: "string",
            minLength: 1,
            maxLength: 200,
            description: "Person, organization, vessel, or other entity name to screen against OFAC SDN",
          },
          country: {
            type: "string",
            description: "Optional country filter matched against OFAC-published addresses",
          },
          entity_type: {
            type: "string",
            enum: ["individual", "entity", "vessel", "aircraft"],
            description: "Optional OFAC entity-type filter",
          },
        },
        required: ["name"],
      },
      output: {
        example: {
          schema_version: "1.0",
          query: {
            name: "ACME SHIPPING LLC",
            normalized_name: "acme shipping llc",
            country: null,
            entity_type: null,
          },
          matches_found: false,
          candidates: [],
          source: { provider: "OFAC", list: "SDN" },
          warnings: ["Screening result is informational and is not a legal compliance determination."],
        },
      },
    });

    const duplicateAuditBazaarExtension = declareDiscoveryExtension({
      bodyType: "json",
      input: { format: "json", records: [{ id: 1 }, { id: 1 }] },
      inputSchema: DATASET_SCHEMA,
      output: {
        example: {
          schema_version: "1.0",
          record_count: 2,
          unique_row_count: 1,
          duplicate_rows: 1,
          duplicate_ratio: 0.5,
          duplicate_groups: [{ first_index: 0, indexes: [0, 1], count: 2, duplicate_count: 1 }],
        },
      },
    });

    const qualityGateBazaarExtension = declareDiscoveryExtension({
      bodyType: "json",
      input: {
        format: "json",
        records: [{ id: 1 }, { id: 2 }],
        minimum_quality_score: 80,
        max_duplicate_rows: 0,
        max_missing_values: 0,
        allow_mixed_types: false,
      },
      inputSchema: {
        oneOf: [
          addDatasetOptions(JSON_DATASET_SCHEMA, {
            minimum_quality_score: { type: "number", minimum: 0, maximum: 100 },
            max_duplicate_rows: { type: "integer", minimum: 0 },
            max_missing_values: { type: "integer", minimum: 0 },
            allow_mixed_types: { type: "boolean" },
          }),
          addDatasetOptions(CSV_DATASET_SCHEMA, {
            minimum_quality_score: { type: "number", minimum: 0, maximum: 100 },
            max_duplicate_rows: { type: "integer", minimum: 0 },
            max_missing_values: { type: "integer", minimum: 0 },
            allow_mixed_types: { type: "boolean" },
          }),
        ],
      },
      output: {
        example: {
          schema_version: "1.0",
          pass: true,
          quality_score: 100,
          observed: { record_count: 2, field_count: 1, duplicate_rows: 0, missing_values: 0, mixed_type_fields: [] },
          thresholds: { minimum_quality_score: 80, max_duplicate_rows: 0, max_missing_values: 0, allow_mixed_types: false },
          checks: {},
          reasons: [],
        },
      },
    });

    const schemaDriftBazaarExtension = declareDiscoveryExtension({
      bodyType: "json",
      input: {
        baseline: { format: "json", records: [{ id: 1 }] },
        current: { format: "json", records: [{ id: 1, name: "A" }] },
      },
      inputSchema: {
        type: "object",
        properties: {
          baseline: DATASET_SCHEMA,
          current: DATASET_SCHEMA,
        },
        required: ["baseline", "current"],
      },
      output: {
        example: {
          schema_version: "1.0",
          baseline_fingerprint: "sha256:baseline",
          current_fingerprint: "sha256:current",
          added_fields: ["name"],
          removed_fields: [],
          type_changes: [],
          nullable_changes: [],
          breaking_change: false,
        },
      },
    });

    const dataContractBazaarExtension = declareDiscoveryExtension({
      bodyType: "json",
      input: {
        dataset: { format: "json", records: [{ id: 1 }] },
        contract: {
          required_fields: ["id"],
          field_types: { id: "integer" },
          allow_extra_fields: true,
        },
      },
      inputSchema: {
        type: "object",
        properties: {
          dataset: DATASET_SCHEMA,
          contract: {
            type: "object",
            properties: {
              required_fields: { type: "array", items: { type: "string" } },
              field_types: { type: "object" },
              allow_extra_fields: { type: "boolean" },
            },
          },
        },
        required: ["dataset", "contract"],
      },
      output: {
        example: {
          schema_version: "1.0",
          compatible: true,
          schema_fingerprint: "sha256:example",
          missing_required_fields: [],
          extra_fields: [],
          type_mismatches: [],
          reasons: [],
        },
      },
    });

    const cleanNormalizeBazaarExtension = declareDiscoveryExtension({
      bodyType: "json",
      input: {
        format: "json",
        records: [{ id: 1, name: " Alice " }, { id: 1, name: "Alice" }],
        options: { trim_strings: true, blank_to_null: true, deduplicate: true },
      },
      inputSchema: {
        oneOf: [
          addDatasetOptions(JSON_DATASET_SCHEMA, { options: cleanOptionsSchema() }),
          addDatasetOptions(CSV_DATASET_SCHEMA, { options: cleanOptionsSchema() }),
        ],
      },
      output: {
        example: {
          schema_version: "1.0",
          original_record_count: 2,
          cleaned_record_count: 1,
          removed_duplicate_rows: 1,
          transformations: { trimmed_strings: 1, blanks_to_null: 0, duplicates_removed: 1 },
          schema_fingerprint: "sha256:example",
          records: [{ id: 1, name: "Alice" }],
        },
      },
    });

    const repairPlanBazaarExtension = declareDiscoveryExtension({
      bodyType: "json",
      input: { format: "json", records: [{ id: 1 }, { id: 1 }] },
      inputSchema: DATASET_SCHEMA,
      output: {
        example: {
          schema_version: "1.0",
          quality_score: 90,
          schema_fingerprint: "sha256:example",
          issues: {
            duplicate_rows: 1,
            missing_values: 0,
            mixed_type_fields: [],
            identifier_integrity_fields: [],
            constant_fields: ["id"],
          },
          actions: [{ code: "DEDUPLICATE_ROWS", priority: 1, affected_count: 1, recommendation: "Remove or reconcile exact duplicate rows before downstream use." }],
        },
      },
    });

    const routes = {
      "POST /v1/profile": protectedRoute(config, config.x402Price, "Profile a dataset for data quality metrics", profilerBazaarExtension),
      "POST /v1/counterparty-availability": protectedRoute(
        config,
        config.x402LocalePrice,
        "Check whether a counterparty is reachable now using local time, national holidays, weekends, and business days remaining this week",
        counterpartyBazaarExtension
      ),
      "POST /v1/entity-sanctions-screen": protectedRoute(
        config,
        config.x402SanctionsScreenPrice,
        "Screen a person or organization name against authoritative OFAC SDN data and return deterministic candidate matches; informational, not a legal compliance determination",
        sanctionsBazaarExtension
      ),
      "POST /v1/duplicate-audit": protectedRoute(
        config,
        config.x402DuplicateAuditPrice,
        "Audit JSON or CSV duplicate rows, unique rows, duplicate ratio, and repeated row indexes",
        duplicateAuditBazaarExtension
      ),
      "POST /v1/quality-gate": protectedRoute(
        config,
        config.x402QualityGatePrice,
        "Run a pass/fail data quality gate for ETL, RAG, analytics, or agent workflows",
        qualityGateBazaarExtension
      ),
      "POST /v1/schema-drift": protectedRoute(
        config,
        config.x402SchemaDriftPrice,
        "Detect added, removed, type-changed, nullable, and breaking schema drift between two datasets",
        schemaDriftBazaarExtension
      ),
      "POST /v1/data-contract-check": protectedRoute(
        config,
        config.x402DataContractPrice,
        "Check a JSON or CSV dataset against required fields, expected types, and extra-field policy",
        dataContractBazaarExtension
      ),
      "POST /v1/clean-normalize": protectedRoute(
        config,
        config.x402CleanNormalizePrice,
        "Conservatively trim, blank-normalize, and deduplicate JSON or CSV records",
        cleanNormalizeBazaarExtension
      ),
      "POST /v1/repair-plan": protectedRoute(
        config,
        config.x402RepairPlanPrice,
        "Generate a deterministic repair plan for duplicates, missing values, mixed types, identifier integrity, and constant fields",
        repairPlanBazaarExtension
      ),
    };

    let readyPromise = null;
    const ensureFacilitatorReady = () => {
      if (!readyPromise) {
        readyPromise = resourceServer.initialize().catch((error) => {
          readyPromise = null;
          throw error;
        });
      }
      return readyPromise;
    };
    app.decorate("x402Ready", ensureFacilitatorReady);

    const protectedRoutes = new Set(Object.keys(routes));
    app.addHook("onRequest", async (request) => {
      const path = request.url.split("?")[0];
      if (protectedRoutes.has(`${request.method} ${path}`)) await ensureFacilitatorReady();
    });

    paymentMiddleware(app, routes, resourceServer, undefined, undefined, false);
  };
}

function protectedRoute(config, price, description, extensions) {
  return {
    description,
    mimeType: "application/json",
    accepts: {
      scheme: "exact",
      payTo: config.x402PayTo,
      price,
      network: config.x402Network,
    },
    extensions,
  };
}

function addDatasetOptions(baseSchema, properties) {
  return {
    ...baseSchema,
    properties: {
      ...baseSchema.properties,
      ...properties,
    },
  };
}

function cleanOptionsSchema() {
  return {
    type: "object",
    properties: {
      trim_strings: { type: "boolean" },
      blank_to_null: { type: "boolean" },
      deduplicate: { type: "boolean" },
    },
  };
}
