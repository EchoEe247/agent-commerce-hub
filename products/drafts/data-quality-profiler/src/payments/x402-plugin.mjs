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

    // ── Startup-order fix ────────────────────────────────────────────
    // @x402/fastify's paymentMiddleware default (syncFacilitatorOnStart=true)
    // fires resourceServer.initialize() -> facilitator GET /supported EAGERLY
    // at route-registration time, i.e. inside buildApp() and therefore BEFORE
    // any HTTP listener is ready. If the facilitator is co-located with (or
    // starts after) this process, that eager fetch fails with ECONNREFUSED
    // and the rejected promise is unhandled until the first protected
    // request, crashing the process.
    //
    // Fix: pass syncFacilitatorOnStart=false and expose an explicit,
    // run-once readiness initializer (`app.x402Ready()`) that the server
    // start path awaits AFTER `listen()` resolves. A protected request that
    // arrives before the explicit call triggers the same awaited initializer
    // (a request implies the listener is ready, so no ECONNREFUSED race).
    // Initialization failures propagate loudly; they are never swallowed.
    let readyPromise = null;
    const ensureFacilitatorReady = () => {
      if (!readyPromise) {
        readyPromise = resourceServer.initialize().catch((error) => {
          // Reset so a later call can retry; rethrow so the failure is loud.
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
      if (protectedRoutes.has(`${request.method} ${path}`)) {
        await ensureFacilitatorReady();
      }
    });

    // syncFacilitatorOnStart=false: facilitator discovery is driven solely by
    // the readiness initializer above (post-listen), never at construction.
    paymentMiddleware(app, routes, resourceServer, undefined, undefined, false);
  };
}
