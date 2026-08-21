const PUBLIC_ORIGIN = "https://hermes-counterparty-api.onrender.com";

const JSON_RECORDS = {
  type: "array",
  items: { type: "object", additionalProperties: true },
};

const DATASET_SCHEMA = {
  type: "object",
  properties: {
    format: { type: "string", enum: ["json", "csv"], description: "Dataset input format." },
    records: JSON_RECORDS,
    data: { type: "string", description: "CSV text when format is csv." },
  },
  required: ["format"],
  oneOf: [
    { properties: { format: { const: "json" } }, required: ["records"] },
    { properties: { format: { const: "csv" } }, required: ["data"] },
  ],
};

const GENERIC_OBJECT_OUTPUT = {
  type: "object",
  additionalProperties: true,
};

function datasetWith(extraProperties = {}) {
  return {
    ...DATASET_SCHEMA,
    properties: {
      ...DATASET_SCHEMA.properties,
      ...extraProperties,
    },
  };
}

function priceAmount(value) {
  const parsed = Number(String(value ?? "").replace(/^\$/, ""));
  if (!Number.isFinite(parsed) || parsed < 0) throw new Error("invalid OpenAPI route price");
  return parsed.toFixed(6);
}

function paidOperation({ operationId, summary, description, price, schema, example, outputSchema = GENERIC_OBJECT_OUTPUT, tags, extraResponses = {} }) {
  return {
    operationId,
    summary,
    description,
    tags,
    "x-payment-info": {
      protocols: [{ x402: {} }],
      price: {
        mode: "fixed",
        currency: "USD",
        amount: priceAmount(price),
      },
    },
    requestBody: {
      required: true,
      content: {
        "application/json": {
          schema,
          example,
        },
      },
    },
    responses: {
      "200": {
        description: "Successful response",
        content: {
          "application/json": {
            schema: outputSchema,
          },
        },
      },
      "400": { description: "Invalid request" },
      "402": { description: "Payment Required" },
      "408": { description: "Processing timeout" },
      "413": { description: "Request exceeds service limits" },
      ...extraResponses,
    },
  };
}

export function buildOpenApiDocument(config) {
  const version = config.serviceVersion ?? "0.1.0";

  return {
    openapi: "3.1.0",
    info: {
      title: "Hermes Agent Commerce API",
      version,
      description: "Paid agent utilities for counterparty availability, company/domain intelligence, OFAC sanctions screening, and deterministic JSON/CSV data-quality work.",
      "x-guidance": "All ten POST operations are pay-per-call x402 resources on Base using USDC. Choose the narrowest operation that matches the task. Send the documented JSON request body; an unpaid call returns HTTP 402 with the runtime payment challenge, then retry with a valid x402 payment. Dataset operations accept JSON records or CSV text. Company domain intelligence combines public DNS, mail-policy, RDAP, and website metadata signals. The sanctions screen returns candidate matches from authoritative OFAC SDN source files and is not a legal compliance determination. No MPP payment support is advertised by this API yet.",
    },
    servers: [{ url: PUBLIC_ORIGIN }],
    paths: {
      "/v1/counterparty-availability": {
        post: paidOperation({
          operationId: "counterpartyAvailability",
          summary: "Counterparty availability and contact-window brief",
          description: "Returns local time, public-holiday and business-day status, business days remaining this week, and the next practical local contact time.",
          price: config.x402LocalePrice ?? "$0.03",
          tags: ["Business Intelligence"],
          schema: {
            type: "object",
            properties: {
              country_code: {
                type: "string",
                enum: ["US", "CA", "MX", "GB", "DE", "FR", "ES", "IT", "BR", "JP", "IN", "AU"],
                description: "ISO 3166-1 alpha-2 country code.",
              },
              timezone: { type: "string", description: "Optional IANA timezone." },
            },
            required: ["country_code"],
          },
          example: { country_code: "US", timezone: "America/Chicago" },
          outputSchema: {
            type: "object",
            properties: {
              country: { type: "object", additionalProperties: true },
              timezone: { type: "string" },
              timezone_source: { type: "string" },
              local: { type: "object", additionalProperties: true },
              business: { type: "object", additionalProperties: true },
            },
            required: ["country", "timezone", "local", "business"],
            additionalProperties: true,
          },
        }),
      },
      "/v1/entity-sanctions-screen": {
        post: paidOperation({
          operationId: "entitySanctionsScreen",
          summary: "Screen an entity or person against OFAC SDN",
          description: "Screens a person or organization name against authoritative U.S. Treasury OFAC SDN primary names and aliases, returns deterministic exact or fuzzy candidate scores plus programs and published addresses, and supports optional country and entity-type filtering. The result is informational and is not a legal compliance determination.",
          price: config.x402SanctionsScreenPrice ?? "$0.02",
          tags: ["Compliance"],
          schema: {
            type: "object",
            properties: {
              name: {
                type: "string",
                minLength: 1,
                maxLength: 200,
                description: "Person, organization, vessel, or other entity name to screen.",
              },
              country: {
                type: "string",
                description: "Optional country filter matched against OFAC-published addresses.",
              },
              entity_type: {
                type: "string",
                enum: ["individual", "entity", "vessel", "aircraft"],
                description: "Optional OFAC entity-type filter.",
              },
            },
            required: ["name"],
          },
          example: { name: "ACME SHIPPING LLC" },
          outputSchema: {
            type: "object",
            properties: {
              schema_version: { type: "string" },
              query: { type: "object", additionalProperties: true },
              matches_found: { type: "boolean" },
              candidates: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    uid: { type: "string" },
                    name: { type: "string" },
                    entity_type: { type: ["string", "null"] },
                    programs: { type: "array", items: { type: "string" } },
                    score: { type: "integer", minimum: 0, maximum: 100 },
                    match_type: { type: "string", enum: ["primary_exact", "alias_exact", "fuzzy"] },
                    matched_name: { type: "string" },
                    aliases: { type: "array", items: { type: "object", additionalProperties: true } },
                    addresses: { type: "array", items: { type: "object", additionalProperties: true } },
                    remarks: { type: ["string", "null"] },
                  },
                  required: ["uid", "name", "score", "match_type", "matched_name"],
                  additionalProperties: true,
                },
              },
              source: { type: "object", additionalProperties: true },
              warnings: { type: "array", items: { type: "string" } },
            },
            required: ["schema_version", "query", "matches_found", "candidates", "source", "warnings"],
            additionalProperties: true,
          },
          extraResponses: {
            "503": { description: "Authoritative OFAC source unavailable" },
          },
        }),
      },
      "/v1/company-domain-intelligence": {
        post: paidOperation({
          operationId: "companyDomainIntelligence",
          summary: "Enrich a company domain with public DNS, mail, RDAP, and website signals",
          description: "Returns normalized domain identity, public DNS A/AAAA records, MX/SPF/DMARC signals, RDAP registration metadata, website reachability and identity metadata, selected social/contact links, and HSTS/CSP header presence. Public-domain input only; IP literals, special-use hostnames, and private/non-routable resolved targets are rejected.",
          price: config.x402CompanyDomainPrice ?? "$0.02",
          tags: ["Business Intelligence"],
          schema: {
            type: "object",
            properties: {
              domain: {
                type: "string",
                minLength: 1,
                maxLength: 253,
                description: "Public company domain name, for example stripe.com. Do not include a URL path.",
              },
            },
            required: ["domain"],
          },
          example: { domain: "stripe.com" },
          outputSchema: {
            type: "object",
            properties: {
              schema_version: { type: "string" },
              query: { type: "object", additionalProperties: true },
              company: { type: "object", additionalProperties: true },
              domain: { type: "object", additionalProperties: true },
              website: { type: "object", additionalProperties: true },
              dns: { type: "object", additionalProperties: true },
              mail: { type: "object", additionalProperties: true },
              security: { type: "object", additionalProperties: true },
              sources: { type: "object", additionalProperties: true },
              warnings: { type: "array", items: { type: "string" } },
            },
            required: ["schema_version", "query", "company", "domain", "website", "dns", "mail", "security", "sources", "warnings"],
            additionalProperties: true,
          },
        }),
      },
      "/v1/profile": {
        post: paidOperation({
          operationId: "profileDataset",
          summary: "Profile JSON or CSV data quality",
          description: "Scores dataset quality and reports missing values, duplicate rows, type conflicts, inferred field types, warnings, counts, and a deterministic schema fingerprint.",
          price: config.x402Price ?? "$0.02",
          tags: ["Data Quality"],
          schema: DATASET_SCHEMA,
          example: { format: "json", records: [{ id: 1 }, { id: 2 }] },
          outputSchema: {
            type: "object",
            properties: {
              schema_version: { type: "string" },
              scoring_version: { type: "string" },
              request_id: { type: "string" },
              quality_score: { type: "number" },
              score_breakdown: { type: "object", additionalProperties: true },
              dataset: { type: "object", additionalProperties: true },
              fields: { type: "object", additionalProperties: true },
              warnings: { type: "array", items: {} },
              processing_ms: { type: "number" },
            },
            required: ["schema_version", "quality_score", "dataset", "fields"],
            additionalProperties: true,
          },
        }),
      },
      "/v1/duplicate-audit": {
        post: paidOperation({
          operationId: "duplicateAudit",
          summary: "Audit duplicate JSON or CSV rows",
          description: "Returns exact duplicate-row groups, duplicate ratio, and unique-row count.",
          price: config.x402DuplicateAuditPrice ?? "$0.005",
          tags: ["Data Quality"],
          schema: DATASET_SCHEMA,
          example: { format: "json", records: [{ id: 1 }, { id: 1 }] },
          outputSchema: {
            type: "object",
            properties: {
              schema_version: { type: "string" },
              record_count: { type: "integer" },
              unique_row_count: { type: "integer" },
              duplicate_rows: { type: "integer" },
              duplicate_ratio: { type: "number" },
              duplicate_groups: { type: "array", items: { type: "object", additionalProperties: true } },
            },
            required: ["record_count", "unique_row_count", "duplicate_rows", "duplicate_groups"],
            additionalProperties: true,
          },
        }),
      },
      "/v1/quality-gate": {
        post: paidOperation({
          operationId: "qualityGate",
          summary: "Pass/fail data-quality gate",
          description: "Makes a deterministic pass/fail decision from quality-score, duplicate, missing-value, and mixed-type thresholds.",
          price: config.x402QualityGatePrice ?? "$0.01",
          tags: ["Data Quality"],
          schema: datasetWith({
            minimum_quality_score: { type: "number", minimum: 0, maximum: 100 },
            max_duplicate_rows: { type: "integer", minimum: 0 },
            max_missing_values: { type: "integer", minimum: 0 },
            allow_mixed_types: { type: "boolean" },
          }),
          example: {
            format: "json",
            records: [{ id: 1 }, { id: 2 }],
            minimum_quality_score: 80,
            max_duplicate_rows: 0,
            max_missing_values: 0,
            allow_mixed_types: false,
          },
          outputSchema: {
            type: "object",
            properties: {
              schema_version: { type: "string" },
              pass: { type: "boolean" },
              quality_score: { type: "number" },
              observed: { type: "object", additionalProperties: true },
              thresholds: { type: "object", additionalProperties: true },
              checks: { type: "object", additionalProperties: true },
              reasons: { type: "array", items: { type: "string" } },
            },
            required: ["pass", "quality_score", "reasons"],
            additionalProperties: true,
          },
        }),
      },
      "/v1/schema-drift": {
        post: paidOperation({
          operationId: "schemaDrift",
          summary: "Detect schema drift",
          description: "Compares baseline and current datasets for added, removed, type-changed, nullable, and breaking schema changes.",
          price: config.x402SchemaDriftPrice ?? "$0.015",
          tags: ["Data Quality"],
          schema: {
            type: "object",
            properties: { baseline: DATASET_SCHEMA, current: DATASET_SCHEMA },
            required: ["baseline", "current"],
          },
          example: {
            baseline: { format: "json", records: [{ id: 1 }] },
            current: { format: "json", records: [{ id: 1, name: "A" }] },
          },
          outputSchema: {
            type: "object",
            properties: {
              schema_version: { type: "string" },
              baseline_fingerprint: { type: "string" },
              current_fingerprint: { type: "string" },
              added_fields: { type: "array", items: { type: "string" } },
              removed_fields: { type: "array", items: { type: "string" } },
              type_changes: { type: "array", items: { type: "object", additionalProperties: true } },
              nullable_changes: { type: "array", items: { type: "object", additionalProperties: true } },
              breaking_change: { type: "boolean" },
            },
            required: ["baseline_fingerprint", "current_fingerprint", "breaking_change"],
            additionalProperties: true,
          },
        }),
      },
      "/v1/data-contract-check": {
        post: paidOperation({
          operationId: "dataContractCheck",
          summary: "Check data-contract compatibility",
          description: "Validates a dataset against required fields, expected inferred types, and extra-field policy.",
          price: config.x402DataContractPrice ?? "$0.015",
          tags: ["Data Quality"],
          schema: {
            type: "object",
            properties: {
              dataset: DATASET_SCHEMA,
              contract: {
                type: "object",
                properties: {
                  required_fields: { type: "array", items: { type: "string" } },
                  field_types: { type: "object", additionalProperties: { type: "string" } },
                  allow_extra_fields: { type: "boolean" },
                },
                required: ["required_fields", "field_types"],
              },
            },
            required: ["dataset", "contract"],
          },
          example: {
            dataset: { format: "json", records: [{ id: 1 }] },
            contract: { required_fields: ["id"], field_types: { id: "integer" }, allow_extra_fields: true },
          },
          outputSchema: {
            type: "object",
            properties: {
              schema_version: { type: "string" },
              compatible: { type: "boolean" },
              schema_fingerprint: { type: "string" },
              missing_required_fields: { type: "array", items: { type: "string" } },
              extra_fields: { type: "array", items: { type: "string" } },
              type_mismatches: { type: "array", items: { type: "object", additionalProperties: true } },
              reasons: { type: "array", items: { type: "string" } },
            },
            required: ["compatible", "schema_fingerprint", "reasons"],
            additionalProperties: true,
          },
        }),
      },
      "/v1/clean-normalize": {
        post: paidOperation({
          operationId: "cleanNormalize",
          summary: "Clean and normalize JSON or CSV",
          description: "Conservatively trims strings, converts blank values to null, and removes exact duplicate rows.",
          price: config.x402CleanNormalizePrice ?? "$0.02",
          tags: ["Data Quality"],
          schema: datasetWith({
            options: {
              type: "object",
              properties: {
                trim_strings: { type: "boolean" },
                blank_to_null: { type: "boolean" },
                deduplicate: { type: "boolean" },
              },
            },
          }),
          example: {
            format: "json",
            records: [{ id: 1, name: " Alice " }, { id: 1, name: "Alice" }],
            options: { trim_strings: true, blank_to_null: true, deduplicate: true },
          },
          outputSchema: {
            type: "object",
            properties: {
              schema_version: { type: "string" },
              original_record_count: { type: "integer" },
              cleaned_record_count: { type: "integer" },
              removed_duplicate_rows: { type: "integer" },
              transformations: { type: "object", additionalProperties: true },
              schema_fingerprint: { type: "string" },
              records: JSON_RECORDS,
            },
            required: ["original_record_count", "cleaned_record_count", "records"],
            additionalProperties: true,
          },
        }),
      },
      "/v1/repair-plan": {
        post: paidOperation({
          operationId: "repairPlan",
          summary: "Generate a deterministic dataset repair plan",
          description: "Produces ordered repair actions for duplicates, missing values, mixed types, identifier integrity, and constant fields without modifying data.",
          price: config.x402RepairPlanPrice ?? "$0.02",
          tags: ["Data Quality"],
          schema: DATASET_SCHEMA,
          example: { format: "json", records: [{ id: 1 }, { id: 1 }] },
          outputSchema: {
            type: "object",
            properties: {
              schema_version: { type: "string" },
              quality_score: { type: "number" },
              schema_fingerprint: { type: "string" },
              issues: { type: "object", additionalProperties: true },
              actions: { type: "array", items: { type: "object", additionalProperties: true } },
            },
            required: ["quality_score", "schema_fingerprint", "issues", "actions"],
            additionalProperties: true,
          },
        }),
      },
    },
  };
}
