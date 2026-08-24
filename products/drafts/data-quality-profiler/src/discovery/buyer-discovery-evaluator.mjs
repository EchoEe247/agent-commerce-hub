import { validateDiscoveryExtension } from "@x402/extensions/bazaar";

const PREVIEW_PATH = "/v1/company-domain-intelligence/preview";
const PAID_PATH = "/v1/company-domain-intelligence";

export function evaluateBuyerDiscovery({
  intents = [],
  openapi,
  llmsText = "",
  previewObservation = {},
  paidBoundaryObservation = {},
  target = "unknown",
}) {
  const checks = [];
  const paidOperation = openapi?.paths?.[PAID_PATH]?.post;
  const previewOperation = openapi?.paths?.[PREVIEW_PATH]?.post;
  const guidance = openapi?.info?.["x-guidance"];
  const discoveryText = `${guidance ?? ""}\n${llmsText ?? ""}`.toLowerCase();

  addCheck(checks, {
    id: "discovery.openapi",
    code: "DISCOVERY_OPENAPI_MISSING",
    pass: typeof openapi?.openapi === "string" && openapi.openapi.startsWith("3.1"),
    observed: openapi?.openapi ?? null,
  });

  addCheck(checks, {
    id: "discovery.guidance",
    code: "DISCOVERY_GUIDANCE_MISSING",
    pass: typeof guidance === "string" && guidance.trim().length > 0,
    observed: typeof guidance === "string" ? "present" : "missing",
  });

  const inputSchema = paidOperation?.requestBody?.content?.["application/json"]?.schema;
  addCheck(checks, {
    id: "discovery.input_schema",
    code: "DISCOVERY_INPUT_SCHEMA_MISSING",
    pass: Boolean(inputSchema && Array.isArray(inputSchema.required) && inputSchema.required.includes("domain") && inputSchema.properties?.domain),
    observed: inputSchema ? "present" : "missing",
  });

  const outputSchema = paidOperation?.responses?.["200"]?.content?.["application/json"]?.schema;
  addCheck(checks, {
    id: "discovery.output_schema",
    code: "DISCOVERY_OUTPUT_SCHEMA_MISSING",
    pass: Boolean(outputSchema && typeof outputSchema === "object"),
    observed: outputSchema ? "present" : "missing",
  });

  const paymentInfo = paidOperation?.["x-payment-info"];
  const paymentProtocols = paymentInfo?.protocols;
  const paymentAmount = paymentInfo?.price?.amount;
  addCheck(checks, {
    id: "discovery.payment_metadata",
    code: "DISCOVERY_PAYMENT_METADATA_MISSING",
    pass: Boolean(
      paymentInfo
      && Array.isArray(paymentProtocols)
      && paymentProtocols.some((item) => item && typeof item === "object" && Object.hasOwn(item, "x402"))
      && typeof paymentAmount === "string"
      && Number.isFinite(Number(paymentAmount))
      && Number(paymentAmount) >= 0
    ),
    observed: paymentAmount ?? null,
  });

  addCheck(checks, {
    id: "discovery.402_declaration",
    code: "DISCOVERY_402_DECLARATION_MISSING",
    pass: Boolean(paidOperation?.responses?.["402"]),
    observed: Boolean(paidOperation?.responses?.["402"]),
  });

  const paidOperationId = paidOperation?.operationId;
  const previewOperationId = previewOperation?.operationId;
  const intentResults = intents.map((intent) => {
    const termsMatch = Array.isArray(intent.terms)
      && intent.terms.every((term) => discoveryText.includes(String(term).toLowerCase()));
    const operationMatch = paidOperationId === intent.expectedOperationId;
    const previewMatch = previewOperationId === intent.expectedPreviewOperationId;
    const matched = Boolean(termsMatch && operationMatch && previewMatch);
    return {
      intent_id: intent.id,
      phrase: intent.phrase,
      matched,
      operation_id: paidOperationId ?? null,
      preview_operation_id: previewOperationId ?? null,
      evidence: matched ? ["openapi.info.x-guidance", "llms.txt"] : [],
    };
  });

  addCheck(checks, {
    id: "llms.intent_coverage",
    code: "LLMS_INTENT_COVERAGE_MISSING",
    pass: intentResults.length > 0 && intentResults.every((item) => item.matched),
    observed: {
      matched: intentResults.filter((item) => item.matched).map((item) => item.intent_id),
      missing: intentResults.filter((item) => !item.matched).map((item) => item.intent_id),
    },
  });

  const previewIsFree = Boolean(
    previewOperation
    && !previewOperation["x-payment-info"]
    && previewObservation.statusCode === 200
    && !previewObservation.paymentRequiredHeader
  );
  addCheck(checks, {
    id: "preview.free",
    code: "PREVIEW_NOT_FREE",
    pass: previewIsFree,
    observed: {
      status_code: previewObservation.statusCode ?? null,
      payment_challenge_present: Boolean(previewObservation.paymentRequiredHeader),
      openapi_payment_metadata_present: Boolean(previewOperation?.["x-payment-info"]),
    },
  });

  const previewBody = previewObservation.body;
  const upgradePath = previewBody?.upgrade?.path;
  addCheck(checks, {
    id: "preview.upgrade",
    code: "PREVIEW_UPGRADE_MISMATCH",
    pass: previewBody?.preview === true && upgradePath === PAID_PATH,
    observed: upgradePath ?? null,
  });

  addCheck(checks, {
    id: "paid_boundary.http_402",
    code: "PAID_BOUNDARY_NOT_402",
    pass: paidBoundaryObservation.statusCode === 402,
    observed: paidBoundaryObservation.statusCode ?? null,
  });

  const challengeResult = decodeAndValidateChallenge(
    paidBoundaryObservation.paymentRequiredHeader,
    paymentAmount,
  );
  addCheck(checks, {
    id: "paid_boundary.x402",
    code: "X402_CHALLENGE_INVALID",
    pass: challengeResult.valid,
    observed: challengeResult.observed,
  });

  const bazaarResult = validateBazaar(challengeResult.challenge);
  addCheck(checks, {
    id: "paid_boundary.bazaar",
    code: "BAZAAR_METADATA_INVALID",
    pass: bazaarResult.valid,
    observed: bazaarResult.observed,
  });

  const failed = checks.filter((item) => item.status === "fail").length;
  return {
    schema_version: "1.0",
    target,
    overall: failed === 0 ? "pass" : "fail",
    summary: {
      checks: checks.length,
      passed: checks.length - failed,
      failed,
    },
    intent_results: intentResults,
    checks,
  };
}

function addCheck(checks, { id, code, pass, observed }) {
  checks.push({
    id,
    code,
    status: pass ? "pass" : "fail",
    observed,
  });
}

function decodeAndValidateChallenge(header, usdAmount) {
  if (typeof header !== "string" || header.length === 0) {
    return { valid: false, challenge: null, observed: "missing" };
  }

  let challenge;
  try {
    const json = Buffer.from(header, "base64").toString("utf8");
    challenge = JSON.parse(json);
  } catch {
    return { valid: false, challenge: null, observed: "malformed" };
  }

  const quote = challenge?.accepts?.[0];
  const expectedAmount = usdToUsdcBaseUnits(usdAmount);
  const valid = Boolean(
    challenge?.x402Version === 2
    && quote
    && quote.scheme === "exact"
    && typeof quote.network === "string"
    && quote.network.length > 0
    && typeof quote.payTo === "string"
    && quote.payTo.length > 0
    && expectedAmount !== null
    && String(quote.amount) === expectedAmount
  );

  return {
    valid,
    challenge,
    observed: challenge
      ? {
          x402_version: challenge.x402Version ?? null,
          scheme: quote?.scheme ?? null,
          network: quote?.network ?? null,
          pay_to_present: Boolean(quote?.payTo),
          amount: quote?.amount ?? null,
          expected_amount: expectedAmount,
        }
      : "malformed",
  };
}

function validateBazaar(challenge) {
  const bazaar = challenge?.extensions?.bazaar;
  if (!bazaar) return { valid: false, observed: "missing" };
  try {
    const result = validateDiscoveryExtension(bazaar);
    return {
      valid: result.valid === true,
      observed: result.valid === true ? "valid" : "invalid",
    };
  } catch {
    return { valid: false, observed: "invalid" };
  }
}

function usdToUsdcBaseUnits(amount) {
  const value = Number(amount);
  if (!Number.isFinite(value) || value < 0) return null;
  return String(Math.round(value * 1_000_000));
}
