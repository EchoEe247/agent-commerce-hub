const X402_FACILITATOR_MODES = new Set(["xpay", "cdp"]);
const XPAY_FACILITATOR_URL = "https://facilitator.xpay.sh";
const CDP_FACILITATOR_URL = "https://api.cdp.coinbase.com/platform/v2/x402";

// A syntactically valid EVM (Base) address is "0x" + 40 hex characters.
// The seller only supports Base EVM networks, so a production payTo must be
// one of these; a random nonempty string must never satisfy validation.
export const EVM_ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;

// Payment mode resolution.
//
// Three deterministic outcomes, none inferred from a missing variable:
//   1. X402_PAYMENT_MODE=local-unpaid -> explicit, intentional unpaid mode.
//   2. X402_PAYMENT_MODE=production   -> production (paid routes enforced).
//   3. X402_PAYMENT_MODE unset        -> production (fail-closed default).
//   4. any other explicit value       -> FATAL (never silently inferred).
//
// Unpaid operation REQUIRES the explicit opt-in. A missing or mistyped mode
// must never mean "free routes".
export function resolvePaymentMode(env = process.env) {
  const explicit = env.X402_PAYMENT_MODE ?? "";
  if (explicit === "production") return "production";
  if (explicit === "local-unpaid") return "local-unpaid";
  if (explicit !== "") {
    throw new Error(
      `INVALID_PAYMENT_MODE: X402_PAYMENT_MODE "${explicit}" is not recognized; expected "production" or "local-unpaid"`
    );
  }
  // Missing mode => fail-closed production default.
  return "production";
}

// Validate required payment configuration for production mode. Throws on any
// missing/invalid piece so the caller can fail closed (startup or route).
export function assertProductionPaymentConfig(env = process.env) {
  const x402Enabled = env.X402_ENABLED === "true";
  const x402Network = env.X402_NETWORK ?? "eip155:84532";
  const allowMainnet = env.ALLOW_MAINNET === "true";
  const x402PayTo = env.X402_PAY_TO ?? "";
  const x402FacilitatorMode = env.X402_FACILITATOR_MODE ?? "xpay";

  if (!x402Enabled) {
    throw new Error("PRODUCTION_PAYMENT_CONFIG_INVALID: X402_ENABLED must be true in production payment mode");
  }
  if (!x402PayTo) {
    throw new Error("PRODUCTION_PAYMENT_CONFIG_INVALID: X402_PAY_TO is required in production payment mode");
  }
  if (!EVM_ADDRESS_RE.test(x402PayTo)) {
    throw new Error(
      "PRODUCTION_PAYMENT_CONFIG_INVALID: X402_PAY_TO must be a valid EVM address (0x + 40 hex chars)"
    );
  }
  if (x402Network === "eip155:8453" && !allowMainnet) {
    throw new Error("PRODUCTION_PAYMENT_CONFIG_INVALID: Base mainnet requires ALLOW_MAINNET=true");
  }
  if (!X402_FACILITATOR_MODES.has(x402FacilitatorMode)) {
    throw new Error(`PRODUCTION_PAYMENT_CONFIG_INVALID: X402_FACILITATOR_MODE "${x402FacilitatorMode}" is unsupported`);
  }
  if (x402FacilitatorMode === "cdp" && (!env.CDP_API_KEY_ID || !env.CDP_API_KEY_SECRET)) {
    throw new Error("PRODUCTION_PAYMENT_CONFIG_INVALID: CDP facilitator mode requires CDP_API_KEY_ID and CDP_API_KEY_SECRET");
  }
}

export function loadConfig(env = process.env) {
  const x402Enabled = env.X402_ENABLED === "true";
  const x402Network = env.X402_NETWORK ?? "eip155:84532";
  const allowMainnet = env.ALLOW_MAINNET === "true";
  const x402PayTo = env.X402_PAY_TO ?? "";
  const x402FacilitatorMode = env.X402_FACILITATOR_MODE ?? "xpay";
  const paymentMode = resolvePaymentMode(env); // throws on unknown explicit mode
  const isProduction = paymentMode === "production";

  const ALLOWED_NETWORKS = new Set([
    "eip155:84532",
    ...(allowMainnet ? ["eip155:8453"] : []),
  ]);

  // Explicit local-unpaid mode must not coexist with production/mainnet signal.
  // Checked early so the specific LOCAL_UNPAID_FORBIDDEN violation is reported
  // before generic mainnet/network guards.
  if (paymentMode === "local-unpaid") {
    if (x402Network === "eip155:8453") {
      throw new Error("LOCAL_UNPAID_FORBIDDEN: local-unpaid mode must not be combined with mainnet network (eip155:8453)");
    }
    if (allowMainnet) {
      throw new Error("LOCAL_UNPAID_FORBIDDEN: local-unpaid mode must not be combined with ALLOW_MAINNET=true");
    }
    if (x402Enabled) {
      throw new Error("LOCAL_UNPAID_FORBIDDEN: local-unpaid mode must not be combined with X402_ENABLED=true");
    }
  }

  if (!X402_FACILITATOR_MODES.has(x402FacilitatorMode)) {
    throw new Error(`X402_FACILITATOR_MODE "${x402FacilitatorMode}" is not supported; expected xpay or cdp`);
  }
  if (x402Network === "eip155:8453" && !allowMainnet) {
    throw new Error("Base mainnet is disabled; ALLOW_MAINNET=true requires separate user authorization");
  }
  if (!ALLOWED_NETWORKS.has(x402Network)) {
    throw new Error(`X402_NETWORK "${x402Network}" is not an allowed network`);
  }

  // Production payment mode must never start with incomplete payment config.
  if (isProduction) {
    if (x402Enabled && !x402PayTo) {
      throw new Error("X402_PAY_TO is required when X402_ENABLED=true");
    }
    if (x402Enabled && !EVM_ADDRESS_RE.test(x402PayTo)) {
      throw new Error(
        "PRODUCTION_PAYMENT_CONFIG_INVALID: X402_PAY_TO must be a valid EVM address (0x + 40 hex chars)"
      );
    }
    assertProductionPaymentConfig(env);
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
    paymentMode,
    isProduction,
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
