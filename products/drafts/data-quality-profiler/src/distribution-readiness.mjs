const HTTP_METHODS = ["get", "post", "put", "patch", "delete", "head"];

export function evaluateDistributionReadiness({ openapi, llmsText, facilitatorUrl }) {
  const paidOperations = collectPaidOperations(openapi);
  const criticalChecks = [];

  criticalChecks.push(makeCheck(
    "openapi.guidance",
    Boolean(openapi?.info?.["x-guidance"]?.trim()),
    "OpenAPI info.x-guidance is required for agent-friendly discovery",
  ));

  criticalChecks.push(makeCheck(
    "openapi.payment_metadata",
    paidOperations.length > 0 && paidOperations.every(({ operation }) => hasValidPaymentMetadata(operation)),
    "Every paid operation must expose valid x-payment-info metadata",
  ));

  criticalChecks.push(makeCheck(
    "openapi.paid_402",
    paidOperations.length > 0 && paidOperations.every(({ operation }) => Boolean(operation?.responses?.["402"])),
    "Every paid operation must declare HTTP 402",
  ));

  criticalChecks.push(makeCheck(
    "openapi.input_schemas",
    paidOperations.length > 0 && paidOperations.every(({ operation }) => Boolean(operation?.requestBody?.content?.["application/json"]?.schema)),
    "Every paid operation must expose an invocable JSON input schema",
  ));

  criticalChecks.push(makeCheck(
    "openapi.output_schemas",
    paidOperations.length > 0 && paidOperations.every(({ operation }) => Boolean(operation?.responses?.["200"]?.content?.["application/json"]?.schema)),
    "Every paid operation must expose a JSON output schema",
  ));

  const llmsCoverage = paidOperations.every(({ path }) => String(llmsText ?? "").includes(`POST ${path}`));
  criticalChecks.push(makeCheck(
    "llms.paid_catalog_coverage",
    paidOperations.length > 0 && llmsCoverage,
    "llms.txt must cover every paid operation path",
  ));

  const contactEmail = openapi?.info?.contact?.email;
  const checks = [
    ...criticalChecks,
    {
      id: "openapi.contact_email",
      status: contactEmail ? "pass" : "warn",
      observed: contactEmail ? "present" : "missing",
      message: contactEmail
        ? "A public OpenAPI contact email is present"
        : "A public contact email is recommended by x402scan for ownership/contact, but is not required for discovery",
    },
  ];

  const openApiCoreReady = criticalChecks
    .filter((item) => item.id.startsWith("openapi."))
    .every((item) => item.status === "pass");
  const technicalReady = criticalChecks.every((item) => item.status === "pass");
  const facilitatorClassification = classifyFacilitator(facilitatorUrl);
  const registrationPayloads = build402IndexPayloads(openapi, paidOperations);

  return {
    schema_version: "1.0",
    technical_status: technicalReady ? "ready" : "not_ready",
    paid_operation_count: paidOperations.length,
    facilitator: {
      url: facilitatorUrl ?? null,
      classification: facilitatorClassification.kind,
    },
    checks,
    channels: {
      x402scan: {
        technical_status: openApiCoreReady ? "ready" : "not_ready",
        publication_status: "registration_required",
        requires_explicit_approval: true,
        contact_email_recommended: !contactEmail,
      },
      agentcash: {
        technical_status: openApiCoreReady ? "ready" : "not_ready",
        discovery_mode: "openapi_origin_discovery",
        llms_catalog_complete: llmsCoverage,
      },
      coinbase_bazaar: {
        metadata_status: openApiCoreReady ? "discovery_contract_ready" : "not_ready",
        catalog_path: facilitatorClassification.catalogPath,
        listing_status: "not_proven",
      },
      index_402: {
        technical_status: openApiCoreReady ? "ready" : "not_ready",
        publication_status: "direct_registration_recommended",
        requires_explicit_approval: true,
        registration_payloads: registrationPayloads,
      },
      enchant: {
        technical_status: openApiCoreReady ? "compatible" : "not_ready",
        publication_status: "curated_channel",
      },
    },
    publication_actions: [
      {
        id: "x402scan.register_origin",
        status: "pending_approval",
        requires_explicit_approval: true,
      },
      {
        id: "402index.register_paid_operations",
        status: "pending_approval",
        requires_explicit_approval: true,
        payload_count: registrationPayloads.length,
      },
      {
        id: "coinbase_bazaar.verify_catalog_path",
        status: facilitatorClassification.catalogPath === "compatible_catalog_path" ? "verify_after_settlement" : "separate_experiment",
        requires_explicit_approval: false,
      },
    ],
  };
}

function collectPaidOperations(openapi) {
  const operations = [];
  for (const [path, pathItem] of Object.entries(openapi?.paths ?? {})) {
    for (const method of HTTP_METHODS) {
      const operation = pathItem?.[method];
      if (!operation?.["x-payment-info"]) continue;
      operations.push({ path, method: method.toUpperCase(), operation });
    }
  }
  return operations;
}

function hasValidPaymentMetadata(operation) {
  const metadata = operation?.["x-payment-info"];
  const amount = metadata?.price?.amount;
  const protocols = metadata?.protocols;
  return metadata?.price?.mode === "fixed"
    && metadata?.price?.currency === "USD"
    && typeof amount === "string"
    && Number.isFinite(Number(amount))
    && Number(amount) >= 0
    && Array.isArray(protocols)
    && protocols.some((entry) => entry && typeof entry === "object" && "x402" in entry);
}

function build402IndexPayloads(openapi, paidOperations) {
  const origin = String(openapi?.servers?.[0]?.url ?? "").replace(/\/$/, "");
  if (!origin) return [];

  return paidOperations.map(({ path, method, operation }) => {
    const example = operation?.requestBody?.content?.["application/json"]?.example;
    const payload = {
      url: `${origin}${path}`,
      name: operation?.summary ?? operation?.operationId ?? `${method} ${path}`,
      protocol: "x402",
      http_method: method,
    };
    if (example !== undefined) payload.probe_body = JSON.stringify(example);
    return payload;
  });
}

function classifyFacilitator(facilitatorUrl) {
  let url;
  try {
    url = new URL(String(facilitatorUrl ?? ""));
  } catch {
    return { kind: "unknown", catalogPath: "unknown" };
  }

  if (url.hostname === "api.cdp.coinbase.com" && url.pathname.startsWith("/platform/v2/x402")) {
    return { kind: "coinbase_cdp", catalogPath: "compatible_catalog_path" };
  }
  if (url.hostname === "facilitator.xpay.sh") {
    return { kind: "xpay", catalogPath: "not_available_via_current_facilitator" };
  }
  return { kind: "other", catalogPath: "unknown" };
}

function makeCheck(id, passed, message) {
  return {
    id,
    status: passed ? "pass" : "fail",
    message,
  };
}
