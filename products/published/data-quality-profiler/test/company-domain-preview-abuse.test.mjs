import test from "node:test";
import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import { buildApp } from "../src/app.mjs";

const EARNING_WALLET = "0x2BD7c4e294B09E9a853168a58712498D03A45B01";
const PREVIEW_PATH = "/v1/company-domain-intelligence/preview";

function baseConfig() {
  return {
    serviceVersion: "0.1.0",
    x402Network: "eip155:8453",
    x402PayTo: EARNING_WALLET,
    x402CompanyDomainPrice: "$0.02",
  };
}

function noLog() {
  return { log() {} };
}

function fixedPreviewResult(domain = "example.com") {
  return {
    schema_version: "1.0",
    query: { domain, normalized_domain: String(domain).toLowerCase() },
    company: { display_name: domain, source: "test", confidence: "low" },
    website: { reachable: false, https: false, status_code: null, title: null, description: null },
    mail: { has_mx: false, spf_present: false, dmarc_present: false },
    security: { hsts: false, content_security_policy: false },
    warnings: [],
  };
}

test("free preview uses only bounded A/AAAA DNS and never invokes paid enrichment sources", async () => {
  const calls = { a: 0, aaaa: 0, mx: 0, txt: 0, rdap: 0, website: 0 };
  const server = buildApp({
    config: baseConfig(),
    paymentPlugin: async () => {},
    logger: noLog(),
    domainResolver: {
      resolve4: async () => { calls.a += 1; return ["93.184.216.34"]; },
      resolve6: async () => { calls.aaaa += 1; return []; },
      resolveMx: async () => { calls.mx += 1; return [{ exchange: "mail.example.com", priority: 10 }]; },
      resolveTxt: async () => { calls.txt += 1; return [["v=spf1 -all"]]; },
    },
    domainPageRequester: async () => {
      calls.website += 1;
      return { status_code: 200, final_url: "https://example.com/", headers: {}, body: "<title>Should not run</title>" };
    },
    rdapFetch: async () => {
      calls.rdap += 1;
      return { ok: true, json: async () => ({}) };
    },
  });

  try {
    const response = await server.inject({
      method: "POST",
      url: PREVIEW_PATH,
      payload: { domain: "Example.com" },
    });

    assert.equal(response.statusCode, 200);
    assert.deepEqual(calls, { a: 1, aaaa: 1, mx: 0, txt: 0, rdap: 0, website: 0 });
    const body = response.json();
    assert.equal(body.preview, true);
    assert.equal(body.query.normalized_domain, "example.com");
    assert.deepEqual(body.company, { display_name: "example.com", confidence: "low" });
    assert.equal(body.website.reachable, false);
    assert.deepEqual(body.signals, {
      has_mx: false,
      spf_present: false,
      dmarc_present: false,
      hsts: false,
      content_security_policy: false,
    });
    assert.match(body.warnings.join(" "), /bounded public A\/AAAA DNS validation/i);
    assert.equal(response.headers["x-ratelimit-limit"], "20");
    assert.equal(response.headers["x-ratelimit-remaining"], "19");
  } finally {
    await server.close();
  }
});

test("preview cache prevents repeated DNS work for the same normalized domain", async () => {
  let aCalls = 0;
  let aaaaCalls = 0;
  const server = buildApp({
    config: baseConfig(),
    paymentPlugin: async () => {},
    logger: noLog(),
    domainResolver: {
      resolve4: async () => { aCalls += 1; return ["93.184.216.34"]; },
      resolve6: async () => { aaaaCalls += 1; return []; },
    },
    rdapFetch: async () => { throw new Error("RDAP must not run"); },
    domainPageRequester: async () => { throw new Error("website must not run"); },
  });

  try {
    const first = await server.inject({ method: "POST", url: PREVIEW_PATH, payload: { domain: "Example.com" } });
    const second = await server.inject({ method: "POST", url: PREVIEW_PATH, payload: { domain: "example.COM." } });
    assert.equal(first.statusCode, 200);
    assert.equal(second.statusCode, 200);
    assert.equal(aCalls, 1);
    assert.equal(aaaaCalls, 1);
    assert.match(second.json().warnings.join(" "), /served from bounded in-memory DNS cache/i);
  } finally {
    await server.close();
  }
});

test("concurrent same-domain previews share one in-flight DNS lookup", async () => {
  let aCalls = 0;
  let aaaaCalls = 0;
  const delayed = (value) => new Promise((resolve) => setTimeout(() => resolve(value), 25));
  const server = buildApp({
    config: baseConfig(),
    paymentPlugin: async () => {},
    logger: noLog(),
    domainResolver: {
      resolve4: async () => { aCalls += 1; return delayed(["93.184.216.34"]); },
      resolve6: async () => { aaaaCalls += 1; return delayed([]); },
    },
  });

  try {
    const [one, two] = await Promise.all([
      server.inject({ method: "POST", url: PREVIEW_PATH, payload: { domain: "example.com" } }),
      server.inject({ method: "POST", url: PREVIEW_PATH, payload: { domain: "EXAMPLE.COM" } }),
    ]);
    assert.equal(one.statusCode, 200);
    assert.equal(two.statusCode, 200);
    assert.equal(aCalls, 1);
    assert.equal(aaaaCalls, 1);
  } finally {
    await server.close();
  }
});

test("preview rejects private DNS results without invoking website or RDAP", async () => {
  let websiteCalls = 0;
  let rdapCalls = 0;
  const server = buildApp({
    config: baseConfig(),
    paymentPlugin: async () => {},
    logger: noLog(),
    domainResolver: {
      resolve4: async () => ["10.0.0.7"],
      resolve6: async () => [],
    },
    domainPageRequester: async () => { websiteCalls += 1; return null; },
    rdapFetch: async () => { rdapCalls += 1; return { ok: false }; },
  });

  try {
    const response = await server.inject({ method: "POST", url: PREVIEW_PATH, payload: { domain: "attacker.example.net" } });
    assert.equal(response.statusCode, 400);
    assert.equal(response.json().error.code, "UNSAFE_DOMAIN_TARGET");
    assert.equal(websiteCalls, 0);
    assert.equal(rdapCalls, 0);
  } finally {
    await server.close();
  }
});

test("free preview is limited to 20 requests per client per 60-second window", async () => {
  let inspectorCalls = 0;
  const server = buildApp({
    config: baseConfig(),
    paymentPlugin: async () => {},
    logger: noLog(),
    companyDomainIntelligence: async (payload) => {
      inspectorCalls += 1;
      return fixedPreviewResult(payload.domain);
    },
  });

  try {
    for (let i = 0; i < 20; i += 1) {
      const response = await server.inject({ method: "POST", url: PREVIEW_PATH, payload: { domain: `example${i}.com` } });
      assert.equal(response.statusCode, 200, `request ${i + 1} should be allowed`);
    }
    const blocked = await server.inject({ method: "POST", url: PREVIEW_PATH, payload: { domain: "example20.com" } });
    assert.equal(blocked.statusCode, 429);
    assert.equal(blocked.json().error.code, "PREVIEW_RATE_LIMITED");
    assert.ok(Number(blocked.headers["retry-after"]) >= 1);
    assert.equal(blocked.headers["x-ratelimit-limit"], "20");
    assert.equal(blocked.headers["x-ratelimit-remaining"], "0");
    assert.equal(inspectorCalls, 20, "rate-limited request must not reach the inspector");
  } finally {
    await server.close();
  }
});

test("preview rejects non-object bodies before any inspector work", async () => {
  let inspectorCalls = 0;
  const server = buildApp({
    config: baseConfig(),
    paymentPlugin: async () => {},
    logger: noLog(),
    companyDomainIntelligence: async () => {
      inspectorCalls += 1;
      return fixedPreviewResult();
    },
  });

  try {
    const response = await server.inject({
      method: "POST",
      url: PREVIEW_PATH,
      headers: { "content-type": "application/json" },
      payload: JSON.stringify(["example.com"]),
    });
    assert.equal(response.statusCode, 400);
    assert.equal(response.json().error.code, "INVALID_DOMAIN_REQUEST");
    assert.equal(inspectorCalls, 0);
  } finally {
    await server.close();
  }
});

test("preview DNS deadline bounds stalled resolver work", async () => {
  const never = () => new Promise(() => {});
  const server = buildApp({
    config: baseConfig(),
    paymentPlugin: async () => {},
    logger: noLog(),
    domainResolver: {
      resolve4: never,
      resolve6: never,
    },
  });

  try {
    const started = performance.now();
    const response = await server.inject({ method: "POST", url: PREVIEW_PATH, payload: { domain: "slow.example.net" } });
    const elapsed = performance.now() - started;
    assert.equal(response.statusCode, 200);
    assert.ok(elapsed >= 1200, `expected deadline to wait near 1500ms, got ${elapsed}ms`);
    assert.ok(elapsed < 2600, `preview must remain bounded, got ${elapsed}ms`);
    assert.match(response.json().warnings.join(" "), /No public A\/AAAA record was available/i);
  } finally {
    await server.close();
  }
});

test("OpenAPI advertises preview resource limits and 429 response", async () => {
  const server = buildApp({ config: baseConfig(), paymentPlugin: async () => {}, logger: noLog() });
  try {
    const response = await server.inject({ method: "GET", url: "/openapi.json" });
    assert.equal(response.statusCode, 200);
    const operation = response.json().paths[PREVIEW_PATH].post;
    assert.equal(operation.responses["429"].description, "Free preview rate limit exceeded");
    assert.deepEqual(operation["x-preview-limits"], {
      rate_limit: "20 requests per 60 seconds per client",
      cache_ttl_seconds: 600,
      cache_max_entries: 1024,
      dns_queries_per_cache_miss: 2,
      rdap_fetches: 0,
      website_fetches: 0,
    });
    assert.match(operation.description, /does not fetch website content, RDAP, MX, SPF, DMARC/i);
  } finally {
    await server.close();
  }
});
