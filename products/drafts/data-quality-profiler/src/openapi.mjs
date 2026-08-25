import { buildOpenApiDocument as buildBaseOpenApiDocument } from "./openapi-base.mjs";

const PREVIEW_PATH = "/v1/company-domain-intelligence/preview";

export function buildOpenApiDocument(config) {
  const document = buildBaseOpenApiDocument(config);
  const company = document.paths["/v1/company-domain-intelligence"].post;
  const domainSchema = company.requestBody.content["application/json"].schema;

  document.info.description = "Agent utilities for company research, package maintenance intelligence, dependency vulnerability checks, counterparty availability, SEC company snapshots, OFAC sanctions screening, and deterministic JSON/CSV data-quality work. Company domain intelligence includes a free preview before the paid enrichment call.";
  document.info["x-guidance"] = "Thirteen paid POST operations are pay-per-call x402 resources on Base using USDC, plus one free company-intelligence preview at /v1/company-domain-intelligence/preview. Agents researching a company, enriching a business, investigating a domain, or qualifying a lead can call the free preview first, then use the paid company-domain-intelligence operation for RDAP, DNS, mail-policy, social/contact, security, and source details. For paid operations, an unpaid call returns HTTP 402 with the runtime payment challenge; retry with a valid x402 payment. Dataset operations accept JSON records or CSV text. The sanctions screen returns candidate matches from authoritative OFAC SDN source files and is not a legal compliance determination. No MPP payment support is advertised by this API yet.";
  document.info.contact = { url: "https://github.com/EchoEe247/agent-commerce-hub" };

  company.operationId = "companyDomainIntelligenceEnrichment";
  company.summary = "Company domain intelligence: research and enrich a business domain with public web and infrastructure signals";
  company.description = "Use this paid operation to research a company, enrich a business, investigate a domain, or qualify a lead after trying the free preview at /v1/company-domain-intelligence/preview. Returns normalized domain identity, public DNS A/AAAA records, MX/SPF/DMARC signals, RDAP registration metadata, website reachability and identity metadata, selected social/contact links, HSTS/CSP presence, and source provenance. Public-domain input only; IP literals, special-use hostnames, and private/non-routable resolved targets are rejected.";

  document.paths[PREVIEW_PATH] = {
    post: {
      operationId: "previewCompanyDomainIntelligence",
      summary: "Free company and domain intelligence preview",
      description: "Free acquisition preview for agents that need to research a company, inspect a business domain, investigate a website, or qualify a lead before paying. Returns company identity confidence, website reachability/title/description, and high-level mail/security signals. The paid /v1/company-domain-intelligence operation adds full RDAP, DNS addresses, mail records, social/contact links, security details, and source provenance.",
      tags: ["Business Intelligence"],
      security: [],
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
          description: "Successful free preview",
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
        "400": { description: "Invalid request" },
        "408": { description: "Processing timeout" },
      },
    },
  };

  return document;
}
