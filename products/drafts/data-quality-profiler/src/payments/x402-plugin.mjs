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

    const bazaarExtension = declareDiscoveryExtension({
      method: "POST",
      bodyType: "json",
      input: {
        format: "json | csv — dataset format",
        records: "array of objects (JSON) or raw CSV string",
      },
      output: {
        example: {
          schema_version: "1.0",
          scoring_version: "1.0",
          quality_score: 85,
          dataset: { record_count: 100, field_count: 5 },
        },
      },
    });

    const routes = {
      "/v1/profile": {
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
