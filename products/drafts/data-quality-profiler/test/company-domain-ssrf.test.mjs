import test from "node:test";
import assert from "node:assert/strict";
import { createCompanyDomainIntelligence } from "../src/company-domain-intelligence.mjs";
import { createSafeWebsiteFetch, assertSafeUrl } from "../src/safe-website-fetch.mjs";
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

test("createSafeWebsiteFetch refuses unconfigured (missing transport)", () => {
  assert.throws(
    () => createSafeWebsiteFetch({}),
    /requires a transport function/
  );
});
