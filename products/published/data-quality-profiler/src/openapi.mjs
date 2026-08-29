import { buildOpenApiDocument as buildBaseOpenApiDocument } from "./openapi-base.mjs";

const PREVIEW_PATH = "/v1/company-domain-intelligence/preview";

export function buildOpenApiDocument(config) {
  const document = buildBaseOpenApiDocument(config);
  const company = document.paths["/v1/company-domain-intelligence"].post;
  const domainSchema = company.requestBody.content["application/json"].schema;

  document.info.description = "Agent utilities for company research, package maintenance intelligence, dependency vulnerability checks, counterparty availability, SEC company snapshots, OFAC sanctions screening, and deterministic JSON/CSV data-quality work. Company domain intelligence includes a bounded free DNS preview before the paid enrichment call.";
  document.info["x-guidance"] = "Thirteen paid POST operations are pay-per-call x402 resources on Base using USDC, plus one bounded free company-intelligence preview at /v1/company-domain-intelligence/preview. Agents researching a company, enriching a business, investigating a domain, or qualifying a lead can call the free preview first. The free preview performs only public A/AAAA DNS validation with rate limiting and bounded in-memory caching; it does not fetch RDAP, website content, MX/TXT/DMARC, social/contact, or security enrichment. Use the paid company-domain-intelligence operation for those richer signals. For paid operations, an unpaid call returns HTTP 402 with the runtime payment challenge; retry with a valid x402 payment. Dataset operations accept JSON records or CSV text. The sanctions screen returns candidate matches from authoritative OFAC SDN source files and is not a legal compliance determination. No MPP payment support is advertised by this API yet.";
  document.info.contact = { url: "https://github.com/EchoEe247/agent-commerce-hub" };

  company.operationId = "companyDomainIntelligenceEnrichment";
  company.summary = "Company domain intelligence: research and enrich a business domain with public web and infrastructure signals";
  company.description = "Use this paid operation to research a company, enrich a business, investigate a domain, or qualify a lead after trying the free preview at /v1/company-domain-intelligence/preview. The free preview is bounded and DNS-only. Returns normalized domain identity, public DNS A/AAAA records, MX/SPF/DMARC signals, RDAP registration metadata, website reachability and identity metadata, selected social/contact links, HSTS/CSP presence, and source provenance. Public-domain input only; IP literals, special-use hostnames, and private/non-routable resolved targets are rejected.";

  document.paths[PREVIEW_PATH] = {
    post: {
      operationId: "previewCompanyDomainIntelligence",
      summary: "Bounded free company-domain DNS preview",
      description: "Free acquisition preview for agents that need to research a company, inspect a business domain, investigate a website target, or qualify a lead before paying. It validates and normalizes the public domain and performs only bounded A/AAAA DNS resolution. It intentionally does not fetch website content, RDAP, MX, SPF, DMARC, social/contact links, or HTTP security headers. Results are protected by a per-client fixed-window request limit and bounded in-memory DNS cache. The paid /v1/company-domain-intelligence operation provides the full enrichment.",
      tags: ["Business Intelligence"],
      security: [],
      "x-preview-limits": {
        rate_limit: "20 requests per 60 seconds per client",
        cache_ttl_seconds: 600,
        cache_max_entries: 1024,
        dns_queries_per_cache_miss: 2,
        rdap_fetches: 0,
        website_fetches: 0,
      },
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: domainSchema,
            example: { domain: "stripe.com" },
          },
        },
      },
      responses: {
        "200": {
          description: "Successful bounded free preview",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  schema_version: { type: "string" },
                  preview: { type: "boolean", const: true },
                  query: { type: "object", additionalProperties: true },
                  company: { type: "object", additionalProperties: true },
                  website: { type: "object", additionalProperties: true },
                  signals: { type: "object", additionalProperties: true },
                  upgrade: { type: "object", additionalProperties: true },
                  warnings: { type: "array", items: { type: "string" } },
                },
                required: ["schema_version", "preview", "query", "company", "website", "signals", "upgrade", "warnings"],
                additionalProperties: true,
              },
            },
          },
        },
        "400": { description: "Invalid or unsafe public domain request" },
        "429": { description: "Free preview rate limit exceeded" },
      },
    },
  };

  return document;
}
