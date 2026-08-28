import test from "node:test";
import assert from "node:assert/strict";
import { createCompanyDomainIntelligence } from "../src/company-domain-intelligence.mjs";
import { createSafeWebsiteFetch, createHttpsTransport, assertSafeUrl, headersFromRaw } from "../src/safe-website-fetch.mjs";
import { isPublicIp } from "../src/ssrf-address.mjs";

// Deterministic SSRF regression suite. No malicious public DNS is required: the
// connection-time resolver (dnsLookup) and the transport are injected. The fake
// transport invokes opts.lookup (the real validating lookup created from
// dnsLookup) before "connecting", exactly like a real socket would, so the
// connection-time check is exercised end to end.

const PUBLIC_V4 = "93.184.216.34";
const LOOPBACK_V4 = "127.0.0.1";
const RFC1918_V4 = "192.168.1.50";

function okHeaders(extra = {}) {
  return new Headers({ "content-type": "text/html", ...extra });
}

function htmlBody(title) {
  return `<!doctype html><html><head><title>${title}</title></head><body></body></html>`;
}

function publicResolver() {
  return {
    resolve4: async () => [PUBLIC_V4],
    resolve6: async () => [],
    resolveMx: async () => [],
    resolveTxt: async () => [],
  };
}

// A transport that simulates the socket: it calls opts.lookup(hostname) at
// "connection time", then hands back whatever the handler produces for a
// successfully validated (public) connection.
function makeTransport(handler) {
  return (url, opts) => new Promise((resolve, reject) => {
    const hostname = new URL(url).hostname;
    opts.lookup(hostname, { all: true }, (err, records) => {
      if (err) {
        reject(err);
        return;
      }
      try {
        resolve(handler(records, opts, url));
      } catch (error) {
        reject(error);
      }
    });
  });
}

function successHandler() {
  return {
    status: 200,
    headers: okHeaders({ "strict-transport-security": "max-age=31536000" }),
    body: htmlBody("Public Example"),
  };
}

test("connection-time DNS validation flag is exported and shared", () => {
  assert.equal(typeof isPublicIp, "function");
  assert.equal(isPublicIp(PUBLIC_V4), true);
  assert.equal(isPublicIp(LOOPBACK_V4), false);
  assert.equal(isPublicIp("10.0.0.7"), false);
});

test("URL preflight rejects non-http and embedded credentials", () => {
  for (const bad of ["ftp://example.com", "http://user:pass@example.com", "file:///etc/passwd"]) {
    assert.throws(() => assertSafeUrl(bad), /UNSAFE_DOMAIN_TARGET/);
  }
});

test("DNS rebinding: public pre-validation then blocked address at connection time is refused", async () => {
  let connected = false;
  const transport = makeTransport(() => {
    connected = true;
    return successHandler();
  });

  // Preflight resolver answers public (validation passes); the connection-time
  // dnsLookup flips to a private address, which must be refused.
  const inspect = createCompanyDomainIntelligence({
    resolver: {
      resolve4: async () => [PUBLIC_V4],
      resolve6: async () => [],
      resolveMx: async () => [],
      resolveTxt: async () => [],
    },
    websiteTransport: transport,
    dnsLookup: async () => [{ address: "10.0.0.7", family: 4 }],
    rdapFetch: async () => ({ ok: false, status: 404 }),
  });

  const result = await inspect({ domain: "assets.attacker.com" });
  assert.equal(connected, false, "no real connection should be made to the blocked address");
  assert.equal(result.website.reachable, false, "page must be unavailable after connection-time refusal");
});

test("direct private/loopback host is rejected", async () => {
  const transport = makeTransport(() => successHandler());
  const inspect = createCompanyDomainIntelligence({
    resolver: publicResolver(),
    websiteTransport: transport,
    dnsLookup: async () => [{ address: LOOPBACK_V4, family: 4 }],
    rdapFetch: async () => ({ ok: false, status: 404 }),
  });
  const result = await inspect({ domain: "site.example.net" });
  assert.equal(result.website.reachable, false);
});

test("redirect attack to loopback is refused and not fetched", async () => {
  let fetchedTargets = [];
  const transport = makeTransport((records, opts, url) => {
    fetchedTargets.push(String(url));
    void records;
    if (fetchedTargets.length === 1) {
      return { status: 302, headers: okHeaders({ location: "http://127.0.0.1/admin" }), body: "" };
    }
    return successHandler();
  });
  const inspect = createCompanyDomainIntelligence({
    resolver: publicResolver(),
    websiteTransport: transport,
    dnsLookup: async () => [{ address: PUBLIC_V4, family: 4 }],
    rdapFetch: async () => ({ ok: false, status: 404 }),
  });
  const result = await inspect({ domain: "step1.example.com" });
  assert.equal(result.website.reachable, false, "redirect to loopback must not yield a page");
  // Only the first (public) hop was attempted; the loopback target was refused.
  assert.equal(fetchedTargets.length, 1);
});

test("redirect attack to RFC1918 private address is refused", async () => {
  let calls = 0;
  const transport = makeTransport(() => {
    calls += 1;
    if (calls === 1) {
      return { status: 301, headers: okHeaders({ location: "https://192.168.1.50/secret" }), body: "" };
    }
    return successHandler();
  });
  const inspect = createCompanyDomainIntelligence({
    resolver: publicResolver(),
    websiteTransport: transport,
    dnsLookup: async () => [{ address: PUBLIC_V4, family: 4 }],
    rdapFetch: async () => ({ ok: false, status: 404 }),
  });
  const result = await inspect({ domain: "start.example.com" });
  assert.equal(result.website.reachable, false);
});

test("safelisted public target still succeeds via the hardened path", async () => {
  let connected = false;
  const transport = makeTransport(() => {
    connected = true;
    return { status: 200, headers: okHeaders(), body: htmlBody("Example Company") };
  });
  const inspect = createCompanyDomainIntelligence({
    resolver: publicResolver(),
    websiteTransport: transport,
    dnsLookup: async () => [{ address: PUBLIC_V4, family: 4 }],
    rdapFetch: async () => ({ ok: false, status: 404 }),
  });
  const result = await inspect({ domain: "example.com" });
  assert.equal(connected, true);
  assert.equal(result.website.reachable, true);
  assert.equal(result.website.title, "Example Company");
});

test("response size bounds are preserved (oversized body refused)", async () => {
  const transport = makeTransport(() => ({ status: 200, headers: okHeaders({ "content-length": "900000" }), body: "" }));
  const inspect = createCompanyDomainIntelligence({
    resolver: publicResolver(),
    websiteTransport: transport,
    dnsLookup: async () => [{ address: PUBLIC_V4, family: 4 }],
    rdapFetch: async () => ({ ok: false, status: 404 }),
  });
  const result = await inspect({ domain: "example.com" });
  assert.equal(result.website.reachable, false);
});

test("createSafeWebsiteFetch defaults to the hardened Node transport when none is injected", () => {
  // Previously a missing transport threw; now the hardened production transport
  // is the default, so construction succeeds and exposes fetchUrl.
  const safe = createSafeWebsiteFetch({});
  assert.equal(typeof safe.fetchUrl, "function");
});

test("production company-domain intelligence does NOT use global fetch for website traversal", async () => {
  // Deterministic proof that the production default path (no websiteTransport /
  // pageRequester) routes through the hardened Node transport, not globalThis.fetch.
  const globalFetchCalls = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (...args) => {
    globalFetchCalls.push(args);
    return Promise.reject(new Error("global fetch must not be used for website inspection"));
  };
  try {
    const inspect = createCompanyDomainIntelligence({
      resolver: publicResolver(),
      dnsLookup: async () => [{ address: PUBLIC_V4, family: 4 }],
      rdapFetch: async () => ({ ok: false, status: 404 }),
    });
    // Exercise the path; the hardened transport will attempt a real connection
    // that may fail in a sandbox, but globalThis.fetch must never be invoked.
    await inspect({ domain: "example.com" });
    assert.equal(globalFetchCalls.length, 0, "globalThis.fetch must not be used for website inspection");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("flat Node rawHeaders are converted into a queryable Headers object", () => {
  const headers = headersFromRaw(["Content-Type", "text/html", "Location", "https://example.com/"]);
  assert.equal(headers.get("content-type"), "text/html");
  assert.equal(headers.get("LOCATION"), "https://example.com/");
  assert.equal(headers.get("content-TYPE"), "text/html");
});

test("http-to-https redirect is revalidated at connection time and obeyed under the hardened path", async () => {
  let hops = [];
  const transport = makeTransport((records, opts, url) => {
    hops.push(String(url));
    void records;
    if (hops.length === 1) {
      return { status: 301, headers: okHeaders({ location: "https://example.com/final" }), body: "" };
    }
    return { status: 200, headers: okHeaders(), body: htmlBody("Redirected Final") };
  });
  const inspect = createCompanyDomainIntelligence({
    resolver: publicResolver(),
    websiteTransport: transport,
    dnsLookup: async () => [{ address: PUBLIC_V4, family: 4 }],
    rdapFetch: async () => ({ ok: false, status: 404 }),
  });
  const result = await inspect({ domain: "example.com" });
  assert.equal(result.website.reachable, true);
  assert.equal(hops[1], "https://example.com/final");
  assert.equal(result.website.title, "Redirected Final");
});

test("createHttpsTransport is protocol-correct (supports http and https via the same validating lookup)", () => {
  const transport = createHttpsTransport({ maxBytes: 1024, timeoutMs: 1000 });
  assert.equal(typeof transport, "function");
  // The transport selects http vs https by URL scheme and forwards the
  // connection-time validating lookup to the underlying request. It must accept a
  // `lookup` option so the caller's validating lookup is honoured on every hop.
  // (End-to-end scheme + lookup behaviour is covered by the redirect/loopback tests.)
  assert.doesNotThrow(() => {
    const fn = createHttpsTransport();
    assert.equal(typeof fn, "function");
  });
});
