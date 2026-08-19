import { verifyX402Header } from "./helpers.mjs";

export function buildPaymentPlugin(config) {
  return function installPayment(app) {
    app.addHook("onRequest", async (request, reply) => {
      if (request.url === "/health") {
        return;
      }
      const x402Header = request.headers["x402"];
      if (!config.x402Enabled) {
        return reply.status(402).send({
          error: { code: "PAYMENT_REQUIRED", message: "Payment required", price: config.x402Price },
        });
      }
      if (!x402Header) {
        return reply.status(402).send({
          error: { code: "PAYMENT_REQUIRED", message: "x402 header required", price: config.x402Price },
        });
      }
      try {
        const payload = typeof x402Header === "string" ? JSON.parse(x402Header) : x402Header;
        verifyX402Header(payload, {
          facilitatorUrl: config.x402FacilitatorUrl,
          payTo: config.x402PayTo,
          network: config.x402Network,
          price: config.x402Price,
        });
      } catch (error) {
        return reply.status(402).send({
          error: { code: "PAYMENT_REQUIRED", message: error.message, price: config.x402Price },
        });
      }
    });
  };
}
