export function loadConfig(env = process.env) {
  const x402Enabled = env.X402_ENABLED === "true";
  const x402Network = env.X402_NETWORK ?? "eip155:84532";
  const allowMainnet = env.ALLOW_MAINNET === "true";
  const x402PayTo = env.X402_PAY_TO ?? "";

  const ALLOWED_NETWORKS = new Set([
    "eip155:84532",
    ...(allowMainnet ? ["eip155:8453"] : []),
  ]);

  if (x402Enabled && !x402PayTo) {
    throw new Error("X402_PAY_TO is required when X402_ENABLED=true");
  }
  if (x402Network === "eip155:8453" && !allowMainnet) {
    throw new Error("Base mainnet is disabled; ALLOW_MAINNET=true requires separate user authorization");
  }
  if (!ALLOWED_NETWORKS.has(x402Network)) {
    throw new Error(`X402_NETWORK "${x402Network}" is not an allowed network`);
  }

  return Object.freeze({
    serviceVersion: "0.1.0",
    host: env.HOST ?? "0.0.0.0",
    port: Number(env.PORT ?? "4021"),
    x402Enabled,
    x402Network,
    x402Price: env.X402_PRICE ?? "$0.02",
    x402LocalePrice: env.X402_LOCALE_PRICE ?? "$0.03",
    x402DuplicateAuditPrice: env.X402_DUPLICATE_AUDIT_PRICE ?? "$0.005",
    x402QualityGatePrice: env.X402_QUALITY_GATE_PRICE ?? "$0.01",
    x402SchemaDriftPrice: env.X402_SCHEMA_DRIFT_PRICE ?? "$0.015",
    x402DataContractPrice: env.X402_DATA_CONTRACT_PRICE ?? "$0.015",
    x402CleanNormalizePrice: env.X402_CLEAN_NORMALIZE_PRICE ?? "$0.02",
    x402RepairPlanPrice: env.X402_REPAIR_PLAN_PRICE ?? "$0.02",
    x402PayTo,
    x402FacilitatorUrl: env.X402_FACILITATOR_URL ?? "https://x402.org/facilitator",
    the402ApiKey: env.THE402_API_KEY ?? "",
    the402WebhookSecret: env.THE402_WEBHOOK_SECRET ?? "",
    the402ApiBase: env.THE402_API_BASE ?? "https://api.the402.ai",
    allowMainnet,
  });
}
