import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { buildApp } from "../src/app.mjs";
import { buildOpenApiDocument } from "../src/openapi.mjs";
import {
  loadConfig,
  resolveSellerPrices,
  SELLER_PRICE_CATALOG,
  SELLER_PRICE_DEFAULTS,
  withSellerPriceDefaults,
} from "../src/config.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = join(HERE, "..", "src");

function priceNumber(price) {
  return Number(String(price).replace(/^\$/, ""));
}

async function readManifest(config) {
  const app = buildApp({ config });
  try {
    const response = await app.inject({ method: "GET", url: "/.well-known/x402" });
    assert.equal(response.statusCode, 200);
    return response.json();
  } finally {
    await app.close();
  }
}

function openApiPrice(openapi, path) {
  return Number(openapi.paths[path].post["x-payment-info"].price.amount);
}

test("pricing catalog is the complete thirteen-route default authority", () => {
  const entries = Object.entries(SELLER_PRICE_CATALOG);
  assert.equal(entries.length, 13);
  assert.equal(Object.keys(SELLER_PRICE_DEFAULTS).length, 13);
  assert.equal(new Set(entries.map(([path]) => path)).size, 13);
  assert.equal(new Set(entries.map(([, entry]) => entry.configKey)).size, 13);
  assert.equal(new Set(entries.map(([, entry]) => entry.envVar)).size, 13);

  for (const [path, entry] of entries) {
    assert.match(path, /^\/v1\//);
    assert.equal(entry.defaultPrice, SELLER_PRICE_DEFAULTS[entry.configKey]);
    assert.match(entry.defaultPrice, /^\$\d+(?:\.\d+)?$/);
    assert.ok(priceNumber(entry.defaultPrice) > 0);
  }
});

test("resolved config, Agent402 manifest, and OpenAPI advertise identical canonical defaults", async () => {
  const config = loadConfig({ X402_PAYMENT_MODE: "local-unpaid" });
  const manifest = await readManifest(config);
  const openapi = buildOpenApiDocument(config);
  assert.equal(manifest.endpoints.length, 13);

  for (const [path, entry] of Object.entries(SELLER_PRICE_CATALOG)) {
    const expected = priceNumber(entry.defaultPrice);
    assert.equal(config[entry.configKey], entry.defaultPrice, `${path} resolved config`);
    const endpoint = manifest.endpoints.find((candidate) => candidate.path === path);
    assert.ok(endpoint, `${path} missing from Agent402 manifest`);
    assert.equal(endpoint.price_usd, expected, `${path} Agent402 price`);
    assert.equal(openApiPrice(openapi, path), expected, `${path} OpenAPI price`);
  }
});

test("every route-specific environment override propagates to both discovery surfaces", async () => {
  const env = { X402_PAYMENT_MODE: "local-unpaid" };
  let index = 1;
  for (const entry of Object.values(SELLER_PRICE_CATALOG)) {
    env[entry.envVar] = `$0.${String(100 + index).padStart(3, "0")}`;
    index += 1;
  }
  const config = loadConfig(env);
  const manifest = await readManifest(config);
  const openapi = buildOpenApiDocument(config);

  for (const [path, entry] of Object.entries(SELLER_PRICE_CATALOG)) {
    const expectedText = env[entry.envVar];
    const expected = priceNumber(expectedText);
    assert.equal(config[entry.configKey], expectedText, `${path} resolved override`);
    assert.equal(
      manifest.endpoints.find((candidate) => candidate.path === path)?.price_usd,
      expected,
      `${path} Agent402 override`,
    );
    assert.equal(openApiPrice(openapi, path), expected, `${path} OpenAPI override`);
  }
});

test("partial discovery configs receive canonical defaults before rendering", async () => {
  const partial = { serviceVersion: "0.1.0", x402Network: "eip155:84532" };
  const normalized = withSellerPriceDefaults(partial);
  assert.deepEqual(
    Object.fromEntries(Object.keys(SELLER_PRICE_DEFAULTS).map((key) => [key, normalized[key]])),
    SELLER_PRICE_DEFAULTS,
  );

  const manifest = await readManifest(partial);
  const openapi = buildOpenApiDocument(partial);
  for (const [path, entry] of Object.entries(SELLER_PRICE_CATALOG)) {
    const expected = priceNumber(entry.defaultPrice);
    assert.equal(manifest.endpoints.find((candidate) => candidate.path === path)?.price_usd, expected);
    assert.equal(openApiPrice(openapi, path), expected);
  }
});

test("payment wiring consumes catalog config keys and app carries no independent price fallbacks", () => {
  const pluginSource = readFileSync(join(SRC, "payments", "x402-plugin.mjs"), "utf8");
  const appSource = readFileSync(join(SRC, "app.mjs"), "utf8");

  for (const entry of Object.values(SELLER_PRICE_CATALOG)) {
    assert.match(pluginSource, new RegExp(`config\\.${entry.configKey}\\b`), `${entry.configKey} missing from payment plugin`);
  }
  assert.doesNotMatch(
    appSource,
    /config\.x402[A-Za-z]+Price\s*\?\?\s*["']\$\d/,
    "Agent402 manifest must not carry independent price fallback literals",
  );
});

test("resolveSellerPrices is deterministic and uses only catalog environment variables", () => {
  const first = resolveSellerPrices({});
  const second = resolveSellerPrices({});
  assert.deepEqual(first, SELLER_PRICE_DEFAULTS);
  assert.deepEqual(second, SELLER_PRICE_DEFAULTS);

  const single = Object.values(SELLER_PRICE_CATALOG)[0];
  const resolved = resolveSellerPrices({ [single.envVar]: "$0.777", UNRELATED_PRICE: "$9.99" });
  assert.equal(resolved[single.configKey], "$0.777");
  for (const [key, defaultPrice] of Object.entries(SELLER_PRICE_DEFAULTS)) {
    if (key === single.configKey) continue;
    assert.equal(resolved[key], defaultPrice);
  }
});
