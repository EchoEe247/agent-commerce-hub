import test from "node:test";
import assert from "node:assert/strict";
import { createCompanyDomainIntelligence } from "../src/company-domain-intelligence.mjs";
import { isPublicIp } from "../src/ssrf-address.mjs";

const PUBLIC_V4 = "93.184.216.34";

function resolver() {
  return {
    resolve4: async () => [PUBLIC_V4],
    resolve6: async () => [],
    resolveMx: async () => [],
    resolveTxt: async () => [],
  };
}

function transportWithLookup(onConnected) {
  return (url, opts) => new Promise((resolve, reject) => {
    const hostname = new URL(url).hostname;
    opts.lookup(hostname, { all: true }, (error) => {
      if (error) {
        reject(error);
        return;
      }
      onConnected();
      resolve({
        status: 200,
        headers: new Headers({ "content-type": "text/html" }),
        body: "<!doctype html><title>public</title>",
      });
    });
  });
}

test("SSRF IPv6 policy rejects the entire IANA 2001::/23 protocol-assignment block", () => {
  // 2001::/23 is special-purpose and is not globally reachable by default.
  // The seller intentionally rejects the whole block, including more-specific
  // protocol assignments that an ordinary company website does not need.
  for (const address of [
    "2001::1",
    "2001:5::1",
    "2001:1::1",
    "2001:3::1",
    "2001:20::1",
    "2001:30::1",
  ]) {
    assert.equal(isPublicIp(address), false, `${address} must be rejected by the SSRF boundary`);
  }
});

test("SSRF IPv6 policy still allows representative ordinary global-unicast addresses", () => {
  for (const address of ["2001:4860:4860::8888", "2606:4700:4700::1111"]) {
    assert.equal(isPublicIp(address), true, `${address} should remain an allowed public candidate`);
  }
});

test("connection-time lookup blocks unassigned 2001::/23 protocol-assignment space before connection", async () => {
  let connected = false;
  const inspect = createCompanyDomainIntelligence({
    resolver: resolver(),
    websiteTransport: transportWithLookup(() => { connected = true; }),
    dnsLookup: async () => [{ address: "2001:5::1", family: 6 }],
    rdapFetch: async () => ({ ok: false, status: 404 }),
  });

  const result = await inspect({ domain: "example.com" });
  assert.equal(connected, false, "special-purpose IPv6 must be rejected before a socket attempt");
  assert.equal(result.website.reachable, false);
});
