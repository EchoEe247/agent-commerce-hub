import Fastify from "fastify";
import { buildApp } from "../app.mjs";
import { buildPaymentPlugin } from "../payments/x402-plugin.mjs";
import { BUYER_INTENTS } from "./buyer-intents.mjs";
import { evaluateBuyerDiscovery } from "./buyer-discovery-evaluator.mjs";

const PREVIEW_PATH = "/v1/company-domain-intelligence/preview";
const PAID_PATH = "/v1/company-domain-intelligence";
const PAY_TO = "0x0000000000000000000000000000000000000001";
const FIXTURE_DOMAIN = "stripe.com";

export async function runInProcessBuyerDiscovery() {
  const facilitator = Fastify({ logger: false });
  let settleCalls = 0;

  facilitator.get("/supported", async () => ({
    kinds: [{ x402Version: 2, scheme: "exact", network: "eip155:84532", extra: {} }],
    extensions: [],
    signers: {},
  }));
  facilitator.post("/verify", async () => ({ isValid: true }));
  facilitator.post("/settle", async () => {
    settleCalls += 1;
    return {
      success: true,
      transaction: `0x${"00".repeat(32)}`,
      network: "eip155:84532",
    };
  });

  await facilitator.listen({ port: 0, host: "127.0.0.1" });
  const address = facilitator.server.address();
  const facilitatorUrl = `http://127.0.0.1:${address.port}`;

  const config = {
    serviceVersion: "0.1.0",
    x402Enabled: true,
    x402Network: "eip155:84532",
    x402PayTo: PAY_TO,
    x402CompanyDomainPrice: "$0.02",
    x402FacilitatorUrl: facilitatorUrl,
  };
  const paymentPlugin = buildPaymentPlugin(config);
  const app = buildApp({
    config,
    paymentPlugin,
    companyDomainIntelligence: deterministicCompanyDomainIntelligence,
  });

  try {
    const openapiResponse = await app.inject({ method: "GET", url: "/openapi.json" });
    const llmsResponse = await app.inject({ method: "GET", url: "/llms.txt" });
    const previewResponse = await app.inject({
      method: "POST",
      url: PREVIEW_PATH,
      payload: { domain: FIXTURE_DOMAIN },
    });
    const paidResponse = await app.inject({
      method: "POST",
      url: PAID_PATH,
      payload: { domain: FIXTURE_DOMAIN },
    });

    if (settleCalls !== 0) {
      throw new Error("buyer discovery harness attempted settlement");
    }

    return evaluateBuyerDiscovery({
      intents: BUYER_INTENTS,
      openapi: openapiResponse.json(),
      llmsText: llmsResponse.body,
      previewObservation: {
        statusCode: previewResponse.statusCode,
        paymentRequiredHeader: previewResponse.headers["payment-required"] ?? null,
        body: safeJson(previewResponse),
      },
      paidBoundaryObservation: {
        statusCode: paidResponse.statusCode,
        paymentRequiredHeader: paidResponse.headers["payment-required"] ?? null,
      },
      target: "in-process",
    });
  } finally {
    await app.close();
    await facilitator.close();
  }
}

export async function runRemoteBuyerDiscovery({ targetUrl, fetchImpl = globalThis.fetch }) {
  const origin = normalizeTargetOrigin(targetUrl);
  const body = JSON.stringify({ domain: FIXTURE_DOMAIN });

  const [openapiResponse, llmsResponse] = await Promise.all([
    fetchImpl(`${origin}/openapi.json`),
    fetchImpl(`${origin}/llms.txt`),
  ]);

  const previewResponse = await fetchImpl(`${origin}${PREVIEW_PATH}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
  });
  const paidResponse = await fetchImpl(`${origin}${PAID_PATH}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
  });

  const openapi = await readJson(openapiResponse);
  const llmsText = await llmsResponse.text();
  const previewBody = await readJson(previewResponse);

  return evaluateBuyerDiscovery({
    intents: BUYER_INTENTS,
    openapi,
    llmsText,
    previewObservation: {
      statusCode: previewResponse.status,
      paymentRequiredHeader: previewResponse.headers.get("payment-required"),
      body: previewBody,
    },
    paidBoundaryObservation: {
      statusCode: paidResponse.status,
      paymentRequiredHeader: paidResponse.headers.get("payment-required"),
    },
    target: origin,
  });
}

function deterministicCompanyDomainIntelligence({ domain } = {}) {
  const normalizedDomain = String(domain ?? "").toLowerCase();
  return {
    schema_version: "1.0",
    query: { domain: normalizedDomain, normalized_domain: normalizedDomain },
    company: { display_name: "Stripe", source: "fixture", confidence: "high" },
    domain: {
      registered: true,
      registrar: null,
      registration_date: null,
      expiration_date: null,
      age_days: null,
      statuses: [],
      nameservers: [],
    },
    website: {
      reachable: true,
      https: true,
      status_code: 200,
      final_url: `https://${normalizedDomain}/`,
      redirect_chain: [],
      title: "Stripe",
      description: "Payments infrastructure",
      canonical_url: `https://${normalizedDomain}/`,
      social_links: [],
      contact_links: [],
    },
    dns: { has_a: true, has_aaaa: false, addresses: [], ipv6_addresses: [] },
    mail: { has_mx: true, mx: [], spf_present: true, dmarc_present: true },
    security: { hsts: true, content_security_policy: true },
    sources: { dns: "fixture", rdap: "fixture", website: "fixture" },
    warnings: [],
  };
}

function normalizeTargetOrigin(targetUrl) {
  const url = new URL(targetUrl);
  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error("TARGET_URL must use http or https");
  }
  if (url.username || url.password) {
    throw new Error("TARGET_URL must not contain credentials");
  }
  return url.origin;
}

function safeJson(response) {
  try {
    return response.json();
  } catch {
    return null;
  }
}

async function readJson(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}
