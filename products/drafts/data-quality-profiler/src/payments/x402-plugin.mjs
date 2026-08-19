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

    // Bazaar discovery: method is inferred from the route key "POST /v1/profile"
    // by the official bazaarResourceServerExtension.enrichDeclaration at request
    // time. Do NOT pass method here.
    const bazaarExtension = declareDiscoveryExtension({
      bodyType: "json",
      input: {
        format: "json | csv — dataset format",
        records: "array of objects (JSON) or raw CSV string",
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
          properties: {
            schema_version: { type: "string" },
            scoring_version: { type: "string" },
            quality_score: { type: "integer", minimum: 0, maximum: 100 },
            dataset: { type: "object" },
            fields: { type: "object" },
            warnings: { type: "array" },
            processing_ms: { type: "number" },
          },
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
