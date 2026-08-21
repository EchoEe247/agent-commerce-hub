import test from "node:test";
import assert from "node:assert/strict";
import { createCompanyDomainIntelligence } from "../src/company-domain-intelligence.mjs";

const FIXED_NOW = Date.parse("2026-08-21T05:30:00.000Z");

test("default website requester enriches a public domain when no requester override is injected", async () => {
  let fetchCalls = 0;
  const resolver = {
    resolve4: async () => ["93.184.216.34"],
    resolve6: async () => [],
    resolveMx: async () => [],
    resolveTxt: async () => [],
  };
  const websiteFetch = async (url, options) => {
    fetchCalls += 1;
    assert.equal(url, "https://example.com/");
    assert.equal(options.redirect, "manual");
    return {
      status: 200,
      headers: new Headers({
        "content-type": "text/html; charset=utf-8",
        "strict-transport-security": "max-age=31536000",
      }),
      body: null,
      text: async () => `<!doctype html><html><head>
        <title>Example Company | Infrastructure</title>
        <meta property="og:site_name" content="Example Company">
        <meta name="description" content="Example public company site">
      </head><body></body></html>`,
    };
  };

  const inspect = createCompanyDomainIntelligence({
    resolver,
    rdapFetch: async () => ({ ok: false, status: 404 }),
    websiteFetch,
    clock: { now: () => FIXED_NOW },
  });
  const result = await inspect({ domain: "example.com" });

  assert.equal(fetchCalls, 1);
  assert.equal(result.website.reachable, true);
  assert.equal(result.website.status_code, 200);
  assert.equal(result.website.title, "Example Company | Infrastructure");
  assert.equal(result.website.description, "Example public company site");
  assert.equal(result.company.display_name, "Example Company");
  assert.equal(result.company.source, "og:site_name");
  assert.equal(result.security.hsts, true);
  assert.equal(result.sources.website, "https://example.com/");
});
