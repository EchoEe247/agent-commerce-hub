const X402_FACILITATOR_MODES = new Set(["xpay", "cdp"]);
const XPAY_FACILITATOR_URL = "https://facilitator.xpay.sh";
const CDP_FACILITATOR_URL = "https://api.cdp.coinbase.com/platform/v2/x402";

export function loadConfig(env = process.env) {
  const x402Enabled = env.X402_ENABLED === "true";
  const x402Network = env.X402_NETWORK ?? "eip155:84532";
  const allowMainnet = env.ALLOW_MAINNET === "true";
  const x402PayTo = env.X402_PAY_TO ?? "";
  const x402FacilitatorMode = env.X402_FACILITATOR_MODE ?? "xpay";

  const ALLOWED_NETWORKS = new Set([
    "eip155:84532",
    ...(allowMainnet ? ["eip155:8453"] : []),
  ]);

  if (!X402_FACILITATOR_MODES.has(x402FacilitatorMode)) {
    throw new Error(`X402_FACILITATOR_MODE "${x402FacilitatorMode}" is not supported; expected xpay or cdp`);
  }
  if (x402Enabled && !x402PayTo) {
    throw new Error("X402_PAY_TO is required when X402_ENABLED=true");
  }
  if (x402Network === "eip155:8453" && !allowMainnet) {
    throw new Error("Base mainnet is disabled; ALLOW_MAINNET=true requires separate user authorization");
  }
  if (!ALLOWED_NETWORKS.has(x402Network)) {
    throw new Error(`X402_NETWORK "${x402Network}" is not an allowed network`);
  }

  const cdpApiKeyId = env.CDP_API_KEY_ID ?? "";
  const cdpApiKeySecret = env.CDP_API_KEY_SECRET ?? "";
  if (x402Enabled && x402FacilitatorMode === "cdp") {
    if (!cdpApiKeyId) {
      throw new Error("CDP_API_KEY_ID is required when X402_FACILITATOR_MODE=cdp");
    }
    if (!cdpApiKeySecret) {
      throw new Error("CDP_API_KEY_SECRET is required when X402_FACILITATOR_MODE=cdp");
    }
  }

  const x402FacilitatorUrl = x402FacilitatorMode === "cdp"
    ? CDP_FACILITATOR_URL
    : (env.X402_FACILITATOR_URL ?? XPAY_FACILITATOR_URL);

  return Object.freeze({
    serviceVersion: "0.1.0",
    host: env.HOST ?? "0.0.0.0",
    port: Number(env.PORT ?? "4021"),
    x402Enabled,
    x402Network,
    x402Price: env.X402_PRICE ?? "$0.02",
    x402LocalePrice: env.X402_LOCALE_PRICE ?? "$0.03",
    x402SanctionsScreenPrice: env.X402_SANCTIONS_SCREEN_PRICE ?? "$0.02",
    x402CompanyDomainPrice: env.X402_COMPANY_DOMAIN_PRICE ?? "$0.02",
    x402SecCompanyPrice: env.X402_SEC_COMPANY_PRICE ?? "$0.02",
    x402DependencyVulnerabilityPrice: env.X402_DEPENDENCY_VULNERABILITY_PRICE ?? "$0.005",
    x402PackageMaintenancePrice: env.X402_PACKAGE_MAINTENANCE_PRICE ?? "$0.005",
    x402DuplicateAuditPrice: env.X402_DUPLICATE_AUDIT_PRICE ?? "$0.005",
    x402QualityGatePrice: env.X402_QUALITY_GATE_PRICE ?? "$0.01",
    x402SchemaDriftPrice: env.X402_SCHEMA_DRIFT_PRICE ?? "$0.015",
    x402DataContractPrice: env.X402_DATA_CONTRACT_PRICE ?? "$0.015",
    x402CleanNormalizePrice: env.X402_CLEAN_NORMALIZE_PRICE ?? "$0.02",
    x402RepairPlanPrice: env.X402_REPAIR_PLAN_PRICE ?? "$0.02",
    x402PayTo,
    x402FacilitatorMode,
    x402FacilitatorUrl,
    cdpApiKeyId,
    cdpApiKeySecret,
    allowMainnet,
  });
}
