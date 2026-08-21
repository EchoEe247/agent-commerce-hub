import test from "node:test";
import assert from "node:assert/strict";
import Fastify from "fastify";
import { buildApp } from "../src/app.mjs";
import { buildPaymentPlugin } from "../src/payments/x402-plugin.mjs";
import { validateDiscoveryExtension } from "@x402/extensions/bazaar";

// ── Fake facilitator ──────────────────────────────────────────────
async function createFakeFacilitator() {
  const app = Fastify({ logger: false });

  app.get("/supported", async () => ({
    kinds: [
      { x402Version: 2, scheme: "exact", network: "eip155:84532", extra: {} },
    ],
    extensions: [],
    signers: {},
  }));

  app.post("/verify", async () => ({
    isValid: true,
  }));

  app.post("/settle", async () => ({
    success: true,
    transaction: "0x" + "00".repeat(32),
    network: "eip155:84532",
  }));

  await app.listen({ port: 0, host: "127.0.0.1" });
  const { port } = app.server.address();
  return { app, port, url: `http://127.0.0.1:${port}` };
}

const PAY_TO = "0x0000000000000000000000000000000000000001";

function makePluginConfig(facUrl) {
  return {
    x402Enabled: true,
    x402Network: "eip155:84532",
    x402PayTo: PAY_TO,
    x402Price: "$0.02",
    x402LocalePrice: "$0.03",
    x402DuplicateAuditPrice: "$0.005",
    x402QualityGatePrice: "$0.01",
    x402SchemaDriftPrice: "$0.015",
    x402DataContractPrice: "$0.015",
    x402CleanNormalizePrice: "$0.02",
    x402RepairPlanPrice: "$0.02",
    x402FacilitatorUrl: facUrl,
  };
}

function decodePaymentRequired(response) {
  const paymentHeader = response.headers["payment-required"];
  assert.ok(paymentHeader, "PAYMENT-REQUIRED response header must be present");
  return JSON.parse(Buffer.from(paymentHeader, "base64").toString("utf8"));
}

const PORTFOLIO_PAYMENT_CASES = [
  {
    path: "/v1/duplicate-audit",
    amount: "5000",
    payload: { format: "json", records: [{ id: 1 }, { id: 1 }] },
    requiredBodyFields: ["format", "records"],
  },
  {
    path: "/v1/quality-gate",
    amount: "10000",
    payload: { format: "json", records: [{ id: 1 }, { id: 2 }] },
    requiredBodyFields: ["format", "records"],
  },
  {
    path: "/v1/schema-drift",
    amount: "15000",
    payload: {
      baseline: { format: "json", records: [{ id: 1 }] },
      current: { format: "json", records: [{ id: 1, name: "A" }] },
    },
    requiredBodyFields: ["baseline", "current"],
  },
  {
    path: "/v1/data-contract-check",
    amount: "15000",
    payload: {
      dataset: { format: "json", records: [{ id: 1 }] },
      contract: {
        required_fields: ["id"],
        field_types: { id: "integer" },
        allow_extra_fields: true,
      },
    },
    requiredBodyFields: ["dataset", "contract"],
  },
  {
    path: "/v1/clean-normalize",
    amount: "20000",
    payload: { format: "json", records: [{ id: 1 }, { id: 1 }] },
    requiredBodyFields: ["format", "records"],
  },
  {
    path: "/v1/repair-plan",
    amount: "20000",
    payload: { format: "json", records: [{ id: 1 }, { id: 1 }] },
    requiredBodyFields: ["format", "records"],
  },
];

// ── Tests ─────────────────────────────────────────────────────────

test("GET /health is payment-free (no plugin)", async () => {
  const app = buildApp({ config: { serviceVersion: "0.1.0" } });
  const response = await app.inject({ method: "GET", url: "/health" });
  assert.equal(response.statusCode, 200);
  await app.close();
});

test("unpaid POST /v1/profile returns HTTP 402 with PAYMENT-REQUIRED response header", async () => {
  const { app: fac, url: facUrl } = await createFakeFacilitator();
  const plugin = buildPaymentPlugin(makePluginConfig(facUrl));
  const app = buildApp({ config: { serviceVersion: "0.1.0" }, paymentPlugin: plugin });
  const response = await app.inject({
    method: "POST",
    url: "/v1/profile",
    payload: { format: "json", records: [{ id: 1 }] },
  });
  assert.equal(response.statusCode, 402);

  const decoded = decodePaymentRequired(response);

  assert.ok(decoded.x402Version === 2 || decoded.accepts, "decoded header must have x402 v2 structure");
  assert.ok(decoded.accepts && decoded.accepts.length > 0, "accepts array must be non-empty");

  const first = decoded.accepts[0];
  assert.equal(first.scheme, "exact");
  assert.equal(first.network, "eip155:84532");
  assert.equal(first.payTo, PAY_TO);
  assert.equal(first.amount, "20000");

  const body = response.json();
  assert.ok(!body.dataset, "profiler dataset must not be returned in 402 response");

  await app.close();
  await fac.close();
});

test("all six portfolio routes are x402 protected at exact route-specific prices with valid Bazaar metadata", async () => {
  const { app: fac, url: facUrl } = await createFakeFacilitator();
  const plugin = buildPaymentPlugin(makePluginConfig(facUrl));
  const app = buildApp({ config: { serviceVersion: "0.1.0" }, paymentPlugin: plugin });

  for (const testCase of PORTFOLIO_PAYMENT_CASES) {
    const response = await app.inject({
      method: "POST",
      url: testCase.path,
      payload: testCase.payload,
    });
    assert.equal(response.statusCode, 402, `${testCase.path} must reject unpaid access`);

    const decoded = decodePaymentRequired(response);
    assert.equal(decoded.x402Version, 2, `${testCase.path} must use x402 v2`);
    assert.ok(decoded.accepts?.length > 0, `${testCase.path} must advertise an accepted payment`);
    const first = decoded.accepts[0];
    assert.equal(first.scheme, "exact", `${testCase.path} scheme`);
    assert.equal(first.network, "eip155:84532", `${testCase.path} network`);
    assert.equal(first.payTo, PAY_TO, `${testCase.path} payTo`);
    assert.equal(first.amount, testCase.amount, `${testCase.path} amount`);

    const bazaar = decoded.extensions?.bazaar;
    assert.ok(bazaar, `${testCase.path} must advertise Bazaar discovery metadata`);
    const validation = validateDiscoveryExtension(bazaar);
    assert.equal(
      validation.valid,
      true,
      `${testCase.path} Bazaar extension must validate: ${JSON.stringify(validation.errors)}`
    );
    assert.equal(bazaar.info.input.type, "http");
    assert.equal(bazaar.info.input.method, "POST");
    assert.equal(bazaar.info.input.bodyType, "json");
    assert.ok(bazaar.info.output?.example?.schema_version, `${testCase.path} must publish an output example`);

    const bodySchema = bazaar.schema.properties.input.properties.body;
    if (bodySchema.oneOf) {
      const jsonAlternative = bodySchema.oneOf.find((alternative) => alternative.properties?.format?.const === "json");
      assert.ok(jsonAlternative, `${testCase.path} must have a JSON dataset input alternative`);
      for (const required of testCase.requiredBodyFields) {
        assert.ok(jsonAlternative.required?.includes(required), `${testCase.path} must require ${required}`);
      }
    } else {
      for (const required of testCase.requiredBodyFields) {
        assert.ok(bodySchema.required?.includes(required), `${testCase.path} must require ${required}`);
      }
    }
  }

  await app.close();
  await fac.close();
});

test("disabled plugin leaves /v1/profile reachable without payment", async () => {
  const { app: fac, url: facUrl } = await createFakeFacilitator();
  const plugin = buildPaymentPlugin({
    ...makePluginConfig(facUrl),
    x402Enabled: false,
  });
  const app = buildApp({ config: { serviceVersion: "0.1.0" }, paymentPlugin: plugin });
  const response = await app.inject({
    method: "POST",
    url: "/v1/profile",
    payload: { format: "json", records: [{ id: 1 }] },
  });
  assert.equal(response.statusCode, 200);
  await app.close();
  await fac.close();
});

test("Bazaar extension passes official validateDiscoveryExtension with zero errors", async () => {
  const { app: fac, url: facUrl } = await createFakeFacilitator();
  const plugin = buildPaymentPlugin(makePluginConfig(facUrl));
  const app = buildApp({ config: { serviceVersion: "0.1.0" }, paymentPlugin: plugin });
  const response = await app.inject({
    method: "POST",
    url: "/v1/profile",
    payload: { format: "json", records: [{ id: 1 }] },
  });
  assert.equal(response.statusCode, 402);

  const decoded = decodePaymentRequired(response);

  const bazaar = decoded.extensions.bazaar;
  assert.ok(bazaar, "bazaar extension must be present");
  const result = validateDiscoveryExtension(bazaar);
  assert.equal(result.valid, true, `Bazaar extension must pass official validation: ${JSON.stringify(result.errors)}`);

  await app.close();
  await fac.close();
});

test("402 Bazaar metadata: POST method, bodyType json, oneOf JSON+CSV, no nested bazaar.bazaar", async () => {
  const { app: fac, url: facUrl } = await createFakeFacilitator();
  const plugin = buildPaymentPlugin(makePluginConfig(facUrl));
  const app = buildApp({ config: { serviceVersion: "0.1.0" }, paymentPlugin: plugin });
  const response = await app.inject({
    method: "POST",
    url: "/v1/profile",
    payload: { format: "json", records: [{ id: 1 }] },
  });
  assert.equal(response.statusCode, 402);

  const decoded = decodePaymentRequired(response);

  assert.equal(decoded.x402Version, 2);
  const first = decoded.accepts[0];
  assert.equal(first.scheme, "exact");
  assert.equal(first.network, "eip155:84532");
  assert.equal(first.payTo, PAY_TO);
  assert.equal(first.amount, "20000");

  assert.ok(decoded.extensions, "decoded header must have extensions");
  assert.ok(decoded.extensions.bazaar, "extensions must contain bazaar");
  const bazaar = decoded.extensions.bazaar;

  assert.equal(bazaar.info.input.type, "http");
  assert.equal(bazaar.info.input.method, "POST");
  assert.equal(bazaar.info.input.bodyType, "json");

  const bodySchema = bazaar.schema.properties.input.properties.body;
  assert.ok(bodySchema.oneOf, "body schema must use oneOf");
  assert.equal(bodySchema.oneOf.length, 2);

  const jsonAlt = bodySchema.oneOf.find((a) => a.properties?.format?.const === "json");
  assert.ok(jsonAlt, "must have JSON alternative");
  assert.deepEqual(jsonAlt.required, ["format", "records"]);

  const csvAlt = bodySchema.oneOf.find((a) => a.properties?.format?.const === "csv");
  assert.ok(csvAlt, "must have CSV alternative");
  assert.equal(csvAlt.properties.data?.type, "string");
  assert.deepEqual(csvAlt.required, ["format", "data"]);

  assert.ok(!bazaar.bazaar, "must not contain nested bazaar.bazaar");

  assert.ok(bazaar.info.output?.example?.schema_version);
  assert.ok(bazaar.info.output?.example?.scoring_version);

  await app.close();
  await fac.close();
});
