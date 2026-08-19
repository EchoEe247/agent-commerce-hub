import { x402ResourceServer } from "@x402/core/server";
import { HTTPFacilitatorClient } from "@x402/core/server";
import { ExactEvmScheme } from "@x402/evm/exact/server";
import { paymentMiddleware } from "@x402/fastify";
import { declareDiscoveryExtension } from "@x402/extensions/bazaar";

export function buildPaymentPlugin(config) {
  return function installPayment(app) {
    if (!config.x402Enabled) {
      return;
    }

    const facilitatorClient = new HTTPFacilitatorClient({
      url: config.x402FacilitatorUrl,
    });

    const resourceServer = new x402ResourceServer(facilitatorClient);
    resourceServer.register(config.x402Network, new ExactEvmScheme());

    // Bazaar discovery declaration. The inputSchema describes the actual
    // JSON-or-CSV wrapper contract. The input example must satisfy the
    // oneOf schema (valid JSON-form request). method is passed here so
    // the schema's required ['method'] is satisfied at build time; the
    // official enrichDeclaration overwrites it from the transport context.
    const bazaarExtension = declareDiscoveryExtension({
      method: "POST",
      bodyType: "json",
      input: {
        format: "json",
        records: [{ id: 1 }],
      },
      inputSchema: {
        oneOf: [
          {
            type: "object",
            properties: {
              format: { type: "string", const: "json" },
              records: { type: "array", items: { type: "object" } },
            },
            required: ["format", "records"],
          },
          {
            type: "object",
            properties: {
              format: { type: "string", const: "csv" },
              data: { type: "string" },
            },
            required: ["format", "data"],
          },
        ],
      },
      output: {
        example: {
          schema_version: "1.0",
          scoring_version: "1.0",
          quality_score: 85,
          dataset: { record_count: 100, field_count: 5 },
          fields: {},
          warnings: [],
          processing_ms: 42,
        },
        schema: {
          type: "object",
          properties: {
            schema_version: { type: "string" },
            scoring_version: { type: "string" },
            quality_score: { type: "integer", minimum: 0, maximum: 100 },
            dataset: { type: "object" },
            fields: { type: "object" },
            warnings: { type: "array" },
            processing_ms: { type: "number" },
          },
          required: ["schema_version", "scoring_version", "quality_score"],
        },
      },
    });

    const routes = {
      "POST /v1/profile": {
        description: "Profile a dataset for data quality metrics",
        mimeType: "application/json",
        accepts: {
          scheme: "exact",
          payTo: config.x402PayTo,
          price: config.x402Price,
          network: config.x402Network,
        },
        extensions: bazaarExtension,
      },
    };

    // syncFacilitatorOnStart=true (default): initializes the resource server
    // by fetching /supported from the facilitator on the first protected request.
    paymentMiddleware(app, routes, resourceServer);
  };
}
