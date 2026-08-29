import test from "node:test";
import assert from "node:assert/strict";
import { buildApp } from "../src/app.mjs";

const EARNING_WALLET = "0x2BD7c4e294B09E9a853168a58712498D03A45B01";
const FIXED_NOW = Date.parse("2026-08-20T22:00:00.000Z");

const SDN_CSV = [
  '12345,"ACME SHIPPING LLC","Entity","SDGT",-0-,-0-,-0-,-0-,-0-,-0-,-0-,"Primary remarks"',
  '67890,"JOHN Q PUBLIC","Individual","CYBER2",-0-,-0-,-0-,-0-,-0-,-0-,-0-,"DOB 01 Jan 1980"',
].join("\n");

const ALT_CSV = [
  '12345,1,"a.k.a.","ACME MARITIME",-0-',
  '67890,2,"a.k.a.","J Q PUBLIC",-0-',
].join("\n");

const ADD_CSV = [
  '12345,1,"1 Harbor Road","Miami FL","United States",-0-',
  '67890,2,"9 Main Street","London","United Kingdom",-0-',
].join("\n");

function baseConfig() {
  return {
    serviceVersion: "0.1.0",
    x402Network: "eip155:8453",
    x402PayTo: EARNING_WALLET,
    x402SanctionsScreenPrice: "$0.02",
  };
}

function appWithScreen(screen) {
  return buildApp({
    config: baseConfig(),
    paymentPlugin: async () => {},
    entitySanctionsScreen: screen,
  });
}

function createFixtureFetch({ fail = false } = {}) {
  const calls = [];
  const fetchImpl = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    if (fail) {
      return {
        ok: false,
        status: 503,
        headers: { get: () => null },
        text: async () => "",
      };
    }

    let body;
    const value = String(url);
    if (value.endsWith("/SDN.CSV")) body = SDN_CSV;
    else if (value.endsWith("/ALT.CSV")) body = ALT_CSV;
    else if (value.endsWith("/ADD.CSV")) body = ADD_CSV;
    else throw new Error(`unexpected OFAC fixture URL: ${value}`);

    return {
      ok: true,
      status: 200,
      headers: {
        get(name) {
          return String(name).toLowerCase() === "last-modified"
            ? "Thu, 20 Aug 2026 21:45:00 GMT"
            : null;
        },
      },
      text: async () => body,
    };
  };
  return { fetchImpl, calls };
}

function appWithOfacFetch(fetchImpl) {
  return buildApp({
    config: baseConfig(),
    paymentPlugin: async () => {},
    ofacFetch: fetchImpl,
    sanctionsClock: { now: () => FIXED_NOW },
  });
}

test("POST /v1/entity-sanctions-screen delegates to the screening service and returns its result", async () => {
  let received;
  const server = appWithScreen(async (payload) => {
    received = payload;
    return {
      schema_version: "1.0",
      query: { name: payload.name, normalized_name: "acme shipping" },
      matches_found: false,
      candidates: [],
      source: { provider: "OFAC", list: "SDN" },
      warnings: ["Screening result is informational and is not a legal compliance determination."],
    };
  });

  const response = await server.inject({
    method: "POST",
    url: "/v1/entity-sanctions-screen",
    payload: { name: "Acme Shipping" },
  });

  try {
    assert.equal(response.statusCode, 200);
    assert.deepEqual(received, { name: "Acme Shipping" });
    const body = response.json();
    assert.equal(body.schema_version, "1.0");
    assert.equal(body.query.name, "Acme Shipping");
    assert.equal(body.matches_found, false);
    assert.deepEqual(body.candidates, []);
  } finally {
    await server.close();
  }
});

test("screens an exact OFAC SDN primary name and joins aliases plus addresses", async () => {
  const { fetchImpl, calls } = createFixtureFetch();
  const server = appWithOfacFetch(fetchImpl);
  const response = await server.inject({
    method: "POST",
    url: "/v1/entity-sanctions-screen",
    payload: { name: "ACME SHIPPING LLC" },
  });

  try {
    assert.equal(response.statusCode, 200);
    const body = response.json();
    assert.equal(body.matches_found, true);
    assert.equal(body.candidates[0].uid, "12345");
    assert.equal(body.candidates[0].name, "ACME SHIPPING LLC");
    assert.equal(body.candidates[0].entity_type, "Entity");
    assert.equal(body.candidates[0].score, 100);
    assert.equal(body.candidates[0].match_type, "primary_exact");
    assert.deepEqual(body.candidates[0].programs, ["SDGT"]);
    assert.equal(body.candidates[0].aliases[0].name, "ACME MARITIME");
    assert.equal(body.candidates[0].addresses[0].country, "United States");
    assert.equal(body.source.provider, "OFAC");
    assert.equal(body.source.list, "SDN");
    assert.equal(body.source.fetched_at, "2026-08-20T22:00:00.000Z");
    assert.equal(body.source.last_modified, "Thu, 20 Aug 2026 21:45:00 GMT");
    assert.equal(calls.length, 3);
    for (const call of calls) {
      const headers = call.options.headers ?? {};
      assert.ok(headers["User-Agent"] || headers["user-agent"], "OFAC downloads require a User-Agent header");
    }
  } finally {
    await server.close();
  }
});

test("matches an OFAC alias exactly and labels the match source", async () => {
  const { fetchImpl } = createFixtureFetch();
  const server = appWithOfacFetch(fetchImpl);
  const response = await server.inject({
    method: "POST",
    url: "/v1/entity-sanctions-screen",
    payload: { name: "Acme Maritime" },
  });

  try {
    assert.equal(response.statusCode, 200);
    const candidate = response.json().candidates[0];
    assert.equal(candidate.uid, "12345");
    assert.equal(candidate.score, 100);
    assert.equal(candidate.match_type, "alias_exact");
    assert.equal(candidate.matched_name, "ACME MARITIME");
  } finally {
    await server.close();
  }
});

test("token-reordered names can score 100 without being mislabeled as exact", async () => {
  const { fetchImpl } = createFixtureFetch();
  const server = appWithOfacFetch(fetchImpl);
  const primaryResponse = await server.inject({
    method: "POST",
    url: "/v1/entity-sanctions-screen",
    payload: { name: "LLC ACME SHIPPING" },
  });
  const aliasResponse = await server.inject({
    method: "POST",
    url: "/v1/entity-sanctions-screen",
    payload: { name: "MARITIME ACME" },
  });

  try {
    assert.equal(primaryResponse.statusCode, 200);
    const primary = primaryResponse.json().candidates[0];
    assert.equal(primary.uid, "12345");
    assert.equal(primary.score, 100);
    assert.equal(primary.match_type, "fuzzy");
    assert.equal(primary.matched_name, "ACME SHIPPING LLC");

    assert.equal(aliasResponse.statusCode, 200);
    const alias = aliasResponse.json().candidates[0];
    assert.equal(alias.uid, "12345");
    assert.equal(alias.score, 100);
    assert.equal(alias.match_type, "fuzzy");
    assert.equal(alias.matched_name, "ACME MARITIME");
  } finally {
    await server.close();
  }
});

test("returns deterministic fuzzy candidates for a small name typo", async () => {
  const { fetchImpl } = createFixtureFetch();
  const server = appWithOfacFetch(fetchImpl);
  const response = await server.inject({
    method: "POST",
    url: "/v1/entity-sanctions-screen",
    payload: { name: "ACME SHIPPNG LLC" },
  });

  try {
    assert.equal(response.statusCode, 200);
    const body = response.json();
    assert.equal(body.matches_found, true);
    assert.equal(body.candidates[0].uid, "12345");
    assert.ok(body.candidates[0].score >= 80);
    assert.equal(body.candidates[0].match_type, "fuzzy");
  } finally {
    await server.close();
  }
});

test("optional country and entity_type filters fail closed against mismatched candidates", async () => {
  const { fetchImpl } = createFixtureFetch();
  const server = appWithOfacFetch(fetchImpl);
  const wrongCountry = await server.inject({
    method: "POST",
    url: "/v1/entity-sanctions-screen",
    payload: { name: "ACME SHIPPING LLC", country: "United Kingdom" },
  });
  const wrongType = await server.inject({
    method: "POST",
    url: "/v1/entity-sanctions-screen",
    payload: { name: "ACME SHIPPING LLC", entity_type: "individual" },
  });
  const matchingFilters = await server.inject({
    method: "POST",
    url: "/v1/entity-sanctions-screen",
    payload: { name: "ACME SHIPPING LLC", country: "United States", entity_type: "entity" },
  });

  try {
    assert.equal(wrongCountry.statusCode, 200);
    assert.equal(wrongCountry.json().matches_found, false);
    assert.equal(wrongType.statusCode, 200);
    assert.equal(wrongType.json().matches_found, false);
    assert.equal(matchingFilters.statusCode, 200);
    assert.equal(matchingFilters.json().matches_found, true);
  } finally {
    await server.close();
  }
});

test("rejects empty or missing names before contacting OFAC", async () => {
  const { fetchImpl, calls } = createFixtureFetch();
  const server = appWithOfacFetch(fetchImpl);
  const response = await server.inject({
    method: "POST",
    url: "/v1/entity-sanctions-screen",
    payload: { name: "   " },
  });

  try {
    assert.equal(response.statusCode, 400);
    assert.equal(response.json().error.code, "INVALID_SANCTIONS_REQUEST");
    assert.equal(calls.length, 0);
  } finally {
    await server.close();
  }
});

test("fails closed with 503 when authoritative OFAC source files cannot be loaded", async () => {
  const { fetchImpl } = createFixtureFetch({ fail: true });
  const server = appWithOfacFetch(fetchImpl);
  const response = await server.inject({
    method: "POST",
    url: "/v1/entity-sanctions-screen",
    payload: { name: "ACME SHIPPING LLC" },
  });

  try {
    assert.equal(response.statusCode, 503);
    assert.equal(response.json().error.code, "SANCTIONS_SOURCE_UNAVAILABLE");
  } finally {
    await server.close();
  }
});

test("caches one authoritative OFAC snapshot per app instance", async () => {
  const { fetchImpl, calls } = createFixtureFetch();
  const server = appWithOfacFetch(fetchImpl);
  await server.inject({ method: "POST", url: "/v1/entity-sanctions-screen", payload: { name: "ACME SHIPPING LLC" } });
  await server.inject({ method: "POST", url: "/v1/entity-sanctions-screen", payload: { name: "JOHN Q PUBLIC" } });

  try {
    assert.equal(calls.length, 3);
  } finally {
    await server.close();
  }
});

test("response explicitly states that screening is not a legal compliance determination", async () => {
  const { fetchImpl } = createFixtureFetch();
  const server = appWithOfacFetch(fetchImpl);
  const response = await server.inject({
    method: "POST",
    url: "/v1/entity-sanctions-screen",
    payload: { name: "Nobody Example" },
  });

  try {
    assert.equal(response.statusCode, 200);
    const body = response.json();
    assert.equal(body.matches_found, false);
    assert.ok(body.warnings.some((warning) => /not a legal compliance determination/i.test(warning)));
  } finally {
    await server.close();
  }
});
