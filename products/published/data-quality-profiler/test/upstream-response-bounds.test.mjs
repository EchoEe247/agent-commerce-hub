import test from "node:test";
import assert from "node:assert/strict";
import {
  readResponseTextBounded,
  ResponseBodyLimitError,
} from "../src/bounded-response.mjs";
import { createDependencyVulnerabilityCheck } from "../src/dependency-vulnerability-check.mjs";
import { createPackageMaintenanceSnapshot } from "../src/package-maintenance-snapshot.mjs";
import { createSecCompanySnapshot } from "../src/sec-company-snapshot.mjs";
import { createEntitySanctionsScreen } from "../src/entity-sanctions-screen.mjs";
import { createCompanyDomainIntelligence } from "../src/company-domain-intelligence.mjs";

const MiB = 1024 * 1024;

function oversizedDeclaredResponse(bytes, { onText, onJson, onCancel } = {}) {
  return {
    status: 200,
    ok: true,
    headers: new Headers({ "content-length": String(bytes), "content-type": "application/json" }),
    body: { async cancel() { onCancel?.(); } },
    async text() { onText?.(); return "should-not-be-read"; },
    async json() { onJson?.(); return {}; },
  };
}

function jsonResponse(value, status = 200) {
  return {
    status,
    ok: status >= 200 && status < 300,
    headers: new Headers({ "content-type": "application/json" }),
    async text() { return JSON.stringify(value); },
  };
}

test("bounded reader rejects declared oversize before body consumption and cancels it", async () => {
  let textCalls = 0;
  let cancelled = false;
  const response = oversizedDeclaredResponse(101, {
    onText: () => { textCalls += 1; },
    onCancel: () => { cancelled = true; },
  });

  await assert.rejects(
    () => readResponseTextBounded(response, 100),
    (error) => error instanceof ResponseBodyLimitError && error.maxBytes === 100,
  );
  assert.equal(textCalls, 0);
  assert.equal(cancelled, true);
});

test("bounded reader cancels a streaming response as soon as observed bytes cross the cap", async () => {
  const encoder = new TextEncoder();
  const chunks = [encoder.encode("12345"), encoder.encode("67890"), encoder.encode("unread")];
  let cancelled = false;
  const stream = new ReadableStream({
    pull(controller) {
      const chunk = chunks.shift();
      if (chunk) controller.enqueue(chunk);
      else controller.close();
    },
    cancel() { cancelled = true; },
  });

  await assert.rejects(
    () => readResponseTextBounded({ headers: new Headers(), body: stream }, 8),
    ResponseBodyLimitError,
  );
  assert.equal(cancelled, true);
  assert.equal(chunks.length, 1, "reader must stop before consuming the remaining body");
});

test("bounded reader preserves normal lightweight text responses", async () => {
  const response = { headers: new Headers(), async text() { return "hello"; } };
  assert.equal(await readResponseTextBounded(response, 5), "hello");
});

test("OSV rejects an oversized response without invoking text/json buffering", async () => {
  let textCalls = 0;
  let jsonCalls = 0;
  const inspect = createDependencyVulnerabilityCheck({
    fetchImpl: async () => oversizedDeclaredResponse(2 * MiB + 1, {
      onText: () => { textCalls += 1; },
      onJson: () => { jsonCalls += 1; },
    }),
  });

  await assert.rejects(
    () => inspect({ ecosystem: "npm", package: "demo", version: "1.0.0" }),
    /OSV response exceeded the 2 MiB safety limit/,
  );
  assert.equal(textCalls, 0);
  assert.equal(jsonCalls, 0);
});

test("package registry rejects an oversized response without invoking text buffering", async () => {
  let textCalls = 0;
  const inspect = createPackageMaintenanceSnapshot({
    fetchImpl: async () => oversizedDeclaredResponse(8 * MiB + 1, {
      onText: () => { textCalls += 1; },
    }),
  });

  await assert.rejects(
    () => inspect({ ecosystem: "npm", package: "demo", version: "1.0.0" }),
    /package registry response exceeded the 8 MiB safety limit/,
  );
  assert.equal(textCalls, 0);
});

test("required SEC submissions reject above 8 MiB before parsing", async () => {
  let textCalls = 0;
  const inspect = createSecCompanySnapshot({
    fetchImpl: async (url) => String(url).includes("submissions/")
      ? oversizedDeclaredResponse(8 * MiB + 1, { onText: () => { textCalls += 1; } })
      : jsonResponse({}),
  });

  await assert.rejects(
    () => inspect({ cik: "320193" }),
    /SEC submissions response exceeded the 8 MiB safety limit/,
  );
  assert.equal(textCalls, 0);
});

test("optional SEC companyfacts above 32 MiB degrade without failing the company snapshot", async () => {
  let factsTextCalls = 0;
  const inspect = createSecCompanySnapshot({
    fetchImpl: async (url) => {
      const target = String(url);
      if (target.includes("submissions/")) {
        return jsonResponse({
          name: "Demo Corp",
          tickers: ["DEMO"],
          exchanges: ["NYSE"],
          filings: { recent: { accessionNumber: [] } },
        });
      }
      return oversizedDeclaredResponse(32 * MiB + 1, {
        onText: () => { factsTextCalls += 1; },
      });
    },
    clock: { now: () => Date.parse("2026-08-29T00:00:00.000Z") },
  });

  const result = await inspect({ cik: "320193" });
  assert.equal(result.company.name, "Demo Corp");
  assert.equal(result.facts.revenue, null);
  assert.ok(result.warnings.includes("SEC XBRL company facts were unavailable for this company."));
  assert.equal(factsTextCalls, 0);
});

test("OFAC rejects an oversized authoritative CSV before parsing", async () => {
  let primaryTextCalls = 0;
  const screen = createEntitySanctionsScreen({
    fetchImpl: async (url) => {
      if (String(url).endsWith("/SDN.CSV")) {
        return oversizedDeclaredResponse(32 * MiB + 1, {
          onText: () => { primaryTextCalls += 1; },
        });
      }
      return {
        status: 200,
        ok: true,
        headers: new Headers({ "content-type": "text/csv" }),
        async text() { return ""; },
      };
    },
  });

  await assert.rejects(
    () => screen({ name: "Demo" }),
    /OFAC SDN file exceeded the 32 MiB safety limit/,
  );
  assert.equal(primaryTextCalls, 0);
});

test("oversized RDAP degrades to unavailable without invoking response buffering", async () => {
  let textCalls = 0;
  let jsonCalls = 0;
  const resolver = {
    async resolve4() { return ["8.8.8.8"]; },
    async resolve6() { return []; },
    async resolveMx() { return []; },
    async resolveTxt() { return []; },
  };
  const inspect = createCompanyDomainIntelligence({
    resolver,
    pageRequester: async () => null,
    rdapFetch: async () => oversizedDeclaredResponse(2 * MiB + 1, {
      onText: () => { textCalls += 1; },
      onJson: () => { jsonCalls += 1; },
    }),
  });

  const result = await inspect({ domain: "example.org" });
  assert.equal(result.domain.registered, null);
  assert.ok(result.warnings.includes("RDAP registration metadata was unavailable."));
  assert.equal(textCalls, 0);
  assert.equal(jsonCalls, 0);
});
