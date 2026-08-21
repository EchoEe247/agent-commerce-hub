import test from "node:test";
import assert from "node:assert/strict";
import { buildApp } from "../src/app.mjs";

const EARNING_WALLET = "0x2BD7c4e294B09E9a853168a58712498D03A45B01";
const FIXED_NOW = Date.parse("2026-08-21T05:00:00.000Z");

function baseConfig() {
  return {
    serviceVersion: "0.1.0",
    x402Network: "eip155:8453",
    x402PayTo: EARNING_WALLET,
    x402CompanyDomainPrice: "$0.02",
  };
}

async function loadCompanyDomainModule() {
  try {
    return await import("../src/company-domain-intelligence.mjs");
  } catch (error) {
    assert.fail(`company-domain-intelligence module must exist: ${error?.code ?? error?.message}`);
  }
}

test("POST /v1/company-domain-intelligence delegates to the company domain service", async () => {
  let received;
  const server = buildApp({
    config: baseConfig(),
    paymentPlugin: async () => {},
    companyDomainIntelligence: async (payload) => {
      received = payload;
      return {
        schema_version: "1.0",
        query: { domain: payload.domain, normalized_domain: "example.com" },
        company: { display_name: "Example", source: "website_title", confidence: "high" },
        website: { reachable: true, https: true, final_url: "https://example.com/" },
        dns: { has_a: true, has_aaaa: false, addresses: ["93.184.216.34"] },
        mail: { has_mx: true, mx: [{ exchange: "mail.example.com", priority: 10 }] },
        security: { hsts: true, content_security_policy: false },
        sources: { website: "https://example.com/", dns: "system-resolver" },
        warnings: [],
      };
    },
  });

  const response = await server.inject({
    method: "POST",
    url: "/v1/company-domain-intelligence",
    payload: { domain: "Example.com" },
  });

  try {
    assert.equal(response.statusCode, 200);
    assert.deepEqual(received, { domain: "Example.com" });
    const body = response.json();
    assert.equal(body.query.normalized_domain, "example.com");
    assert.equal(body.website.reachable, true);
  } finally {
    await server.close();
  }
});

test("builds deterministic company and domain intelligence from DNS, RDAP, and website signals", async () => {
  const { createCompanyDomainIntelligence } = await loadCompanyDomainModule();
  const resolver = {
    resolve4: async () => ["93.184.216.34"],
    resolve6: async () => ["2606:2800:220:1:248:1893:25c8:1946"],
    resolveMx: async () => [{ exchange: "mail.example.com", priority: 10 }],
    resolveTxt: async (name) => name === "_dmarc.example.com"
      ? [["v=DMARC1; p=reject"]]
      : [["v=spf1 include:_spf.example.com -all"]],
  };
  const pageRequester = async () => ({
    status_code: 200,
    final_url: "https://example.com/",
    redirect_chain: [],
    headers: {
      "strict-transport-security": "max-age=31536000",
      "content-security-policy": "default-src 'self'",
    },
    body: `<!doctype html><html><head>
      <title>Example Inc | Business Infrastructure</title>
      <meta property="og:site_name" content="Example Inc">
      <meta name="description" content="Infrastructure for Example customers.">
      <link rel="canonical" href="https://example.com/">
    </head><body>
      <a href="https://www.linkedin.com/company/example-inc">LinkedIn</a>
      <a href="/contact">Contact</a>
    </body></html>`,
  });
  const rdapFetch = async () => ({
    ok: true,
    status: 200,
    json: async () => ({
      ldhName: "EXAMPLE.COM",
      status: ["client transfer prohibited"],
      events: [
        { eventAction: "registration", eventDate: "2020-01-02T03:04:05Z" },
        { eventAction: "expiration", eventDate: "2030-01-02T03:04:05Z" },
      ],
      nameservers: [{ ldhName: "NS1.EXAMPLE.COM" }, { ldhName: "NS2.EXAMPLE.COM" }],
      entities: [{
        roles: ["registrar"],
        vcardArray: ["vcard", [["fn", {}, "text", "Example Registrar LLC"]]],
      }],
    }),
  });

  const inspect = createCompanyDomainIntelligence({
    resolver,
    pageRequester,
    rdapFetch,
    clock: { now: () => FIXED_NOW },
  });
  const result = await inspect({ domain: "  Example.COM.  " });

  assert.equal(result.schema_version, "1.0");
  assert.equal(result.query.domain, "  Example.COM.  ");
  assert.equal(result.query.normalized_domain, "example.com");
  assert.deepEqual(result.dns.addresses, ["93.184.216.34"]);
  assert.deepEqual(result.dns.ipv6_addresses, ["2606:2800:220:1:248:1893:25c8:1946"]);
  assert.equal(result.mail.has_mx, true);
  assert.equal(result.mail.spf_present, true);
  assert.equal(result.mail.dmarc_present, true);
  assert.equal(result.domain.registered, true);
  assert.equal(result.domain.registrar, "Example Registrar LLC");
  assert.equal(result.domain.registration_date, "2020-01-02T03:04:05Z");
  assert.equal(result.domain.expiration_date, "2030-01-02T03:04:05Z");
  assert.deepEqual(result.domain.nameservers, ["ns1.example.com", "ns2.example.com"]);
  assert.equal(result.company.display_name, "Example Inc");
  assert.equal(result.company.source, "og:site_name");
  assert.equal(result.company.confidence, "high");
  assert.equal(result.website.reachable, true);
  assert.equal(result.website.status_code, 200);
  assert.equal(result.website.title, "Example Inc | Business Infrastructure");
  assert.equal(result.website.description, "Infrastructure for Example customers.");
  assert.equal(result.website.canonical_url, "https://example.com/");
  assert.deepEqual(result.website.social_links, ["https://www.linkedin.com/company/example-inc"]);
  assert.deepEqual(result.website.contact_links, ["https://example.com/contact"]);
  assert.equal(result.security.hsts, true);
  assert.equal(result.security.content_security_policy, true);
  assert.equal(result.sources.fetched_at, "2026-08-21T05:00:00.000Z");
});
