import { buildApp } from "./app.mjs";
import { loadConfig } from "./config.mjs";
import { buildPaymentPlugin } from "./payments/x402-plugin.mjs";

const config = loadConfig(process.env);

const app = buildApp({
  config,
  paymentPlugin: buildPaymentPlugin(config),
});

if (process.env.DIAGNOSTIC_ERRORS === "true") {
  app.addHook("onError", async (_request, _reply, error) => {
    console.error(`DIAGNOSTIC_INTERNAL_ERROR ${error?.stack ?? error?.message ?? String(error)}`);
  });
}

await app.listen({ host: config.host, port: config.port });

// Deterministic startup order: initialize facilitator discovery (GET
// /supported) only after the listener is ready. Fails loudly on error.
if (typeof app.x402Ready === "function") {
  await app.x402Ready();
}

if (process.env.AGENT402_REGISTER_ON_START === "true") {
  await runOneShotAgent402Bootstrap(config).catch((error) => {
    console.error(`AGENT402_BOOTSTRAP_ERROR ${error?.message ?? String(error)}`);
  });
}

async function runOneShotAgent402Bootstrap(config) {
  const localBase = `http://127.0.0.1:${config.port}`;
  const publicOrigin = "https://hermes-counterparty-api.onrender.com";
  const expectedPayTo = "0x2bd7c4e294b09e9a853168a58712498d03a45b01";
  const expectedAsset = "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913";

  const health = await fetch(`${localBase}/health`, { signal: AbortSignal.timeout(10_000) });
  if (!health.ok) throw new Error(`health failed: HTTP ${health.status}`);

  const manifest = await fetch(`${localBase}/.well-known/x402`, { signal: AbortSignal.timeout(10_000) });
  if (!manifest.ok) throw new Error(`manifest failed: HTTP ${manifest.status}`);
  const manifestBody = await manifest.json();
  if (!JSON.stringify(manifestBody).includes("/v1/counterparty-availability")) {
    throw new Error("manifest missing counterparty endpoint");
  }

  const unpaid = await fetch(`${localBase}/v1/counterparty-availability`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ country_code: "US", timezone: "America/Chicago" }),
    signal: AbortSignal.timeout(15_000),
  });
  if (unpaid.status !== 402) {
    const errorBody = (await unpaid.text()).slice(0, 1200).replace(/\s+/g, " ");
    throw new Error(`expected 402, got ${unpaid.status}; body=${errorBody}`);
  }

  const paymentRequired = unpaid.headers.get("payment-required");
  if (!paymentRequired) throw new Error("missing PAYMENT-REQUIRED header");
  const required = JSON.parse(Buffer.from(paymentRequired, "base64").toString("utf8"));
  const quote = (required.accepts ?? []).find(
    (candidate) => candidate?.scheme === "exact" && candidate?.network === "eip155:8453",
  );
  if (!quote) throw new Error("missing exact Base mainnet quote");
  const amountRaw = BigInt(quote.amount ?? quote.maxAmountRequired ?? "0");
  if (amountRaw !== 30_000n) throw new Error(`wrong amount: ${amountRaw}`);
  if (String(quote.asset ?? "").toLowerCase() !== expectedAsset) {
    throw new Error(`wrong asset: ${quote.asset}`);
  }
  if (String(quote.payTo ?? "").toLowerCase() !== expectedPayTo) {
    throw new Error(`wrong payTo: ${quote.payTo}`);
  }

  const registration = await fetch("https://agent402.tools/api/index/register", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ origin: publicOrigin }),
    signal: AbortSignal.timeout(90_000),
  });
  const registrationText = await registration.text();
  let registrationBody;
  try {
    registrationBody = JSON.parse(registrationText);
  } catch {
    registrationBody = { raw: registrationText.slice(0, 1000) };
  }

  console.log(`AGENT402_BOOTSTRAP ${JSON.stringify({
    health: "PASS",
    manifest: "PASS",
    quote: {
      status: 402,
      network: quote.network,
      amountRaw: amountRaw.toString(),
      asset: quote.asset,
      payTo: quote.payTo,
    },
    registrationHttpStatus: registration.status,
    registration: registrationBody,
  })}`);

  if (!registration.ok) throw new Error(`Agent402 registration HTTP ${registration.status}`);
  if (registrationBody?.listed !== true) {
    throw new Error(`Agent402 did not report listed=true: ${JSON.stringify(registrationBody).slice(0, 1000)}`);
  }
}
