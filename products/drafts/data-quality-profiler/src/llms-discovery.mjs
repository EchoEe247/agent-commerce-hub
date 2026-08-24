const PREVIEW_PATH = "/v1/company-domain-intelligence/preview";
const COMPANY_PATH = "/v1/company-domain-intelligence";

export function buildLlmsDiscovery(document) {
  const origin = String(document?.servers?.[0]?.url ?? "").replace(/\/$/, "");
  const preview = document?.paths?.[PREVIEW_PATH]?.post;
  const company = document?.paths?.[COMPANY_PATH]?.post;
  const companyPrice = formatUsd(company?.["x-payment-info"]?.price?.amount);

  const paidOperations = Object.entries(document?.paths ?? {})
    .flatMap(([path, pathItem]) => {
      const operation = pathItem?.post;
      if (!operation?.["x-payment-info"]) return [];
      return [{ path, operation }];
    });

  const catalog = paidOperations.map(({ path, operation }) => {
    const price = formatUsd(operation["x-payment-info"]?.price?.amount);
    return `- POST ${path} — ${price}: ${operation.summary}`;
  });

  return [
    `# ${document?.info?.title ?? "Hermes Agent Commerce API"}`,
    "",
    "> Agent-ready research, enrichment, compliance, developer-intelligence, and data-quality utilities. Paid operations use x402 on Base with USDC.",
    "",
    "## Company research and lead qualification",
    "",
    "Use this flow when you need to research a company, enrich a domain, investigate a business or domain, inspect a company website, or qualify a lead.",
    "",
    `1. Free preview: POST ${origin}${PREVIEW_PATH}`,
    `   - Purpose: ${preview?.summary ?? "Free company and domain intelligence preview"}`,
    '   - JSON body: {"domain":"stripe.com"}',
    "   - No payment is required.",
    `2. Full enrichment: POST ${origin}${COMPANY_PATH} — ${companyPrice}`,
    `   - Purpose: ${company?.summary ?? "Research and enrich a company domain"}`,
    "   - Adds full DNS, RDAP, mail-policy, website/contact/social, security, and source-provenance details.",
    "   - An unpaid call returns HTTP 402 with the x402 payment challenge; pay that challenge and retry the same request.",
    "",
    "## Discovery",
    "",
    `- OpenAPI 3.1: ${origin}/openapi.json`,
    `- Agent402/x402 manifest: ${origin}/.well-known/x402`,
    "- Prefer the free company preview before purchasing full company-domain intelligence.",
    "",
    "## Paid operation catalog",
    "",
    ...catalog,
    "",
  ].join("\n");
}

function formatUsd(amount) {
  const value = Number(amount);
  if (!Number.isFinite(value)) return "$unknown";
  return `$${value.toString()}`;
}
