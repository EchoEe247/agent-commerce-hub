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

    const profilerBazaarExtension = declareDiscoveryExtension({
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

    const counterpartyBazaarExtension = declareDiscoveryExtension({
      method: "POST",
      bodyType: "json",
      input: {
        country_code: "US",
        timezone: "America/Chicago",
      },
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
        schema: {
          type: "object",
          properties: {
            country: { type: "object" },
            timezone: { type: "string" },
            timezone_source: { type: "string" },
            local: { type: "object" },
            business: { type: "object" },
            caveat: { type: "string" },
          },
          required: ["country", "timezone", "local", "business"],
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
        extensions: profilerBazaarExtension,
      },
      "POST /v1/counterparty-availability": {
        description: "Check whether a counterparty is reachable now using local time, national holidays, weekends, and business days remaining this week",
        mimeType: "application/json",
        accepts: {
          scheme: "exact",
          payTo: config.x402PayTo,
          price: config.x402LocalePrice,
          network: config.x402Network,
        },
        extensions: counterpartyBazaarExtension,
      },
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
      if (protectedRoutes.has(`${request.method} ${path}`)) {
        await ensureFacilitatorReady();
      }
    });

    paymentMiddleware(app, routes, resourceServer, undefined, undefined, false);
  };
}
