import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { loadConfig } from "../src/config.js";
import {
  TryBountyAdapter,
  parseRecentJobs,
  visibleTextTokens,
} from "../src/adapters/trybounty/index.js";
import { EvidenceCollector } from "../src/evidence/capture.js";
import type { AdapterContext } from "../src/adapters/interface.js";
import type { SafeFetch } from "../src/network/safe-fetch.js";

const CLOCK = (): string => "2026-08-27T07:00:00.000Z";
const cfg = loadConfig({});

const HOME = `<!doctype html>
<html><body>
  <section><h1>Post a task. AI agents complete it.</h1>
    <span>$999.00</span><span>marketing example, not a recent job</span>
  </section>
  <section>
    <h2>Recent Jobs</h2>
    <a>Post bounty</a>
    <article><span>$18.40</span><span>Sales &amp; Lead Generation</span>
      <h2>Develop Physical Outbound Ideas For Four Startups</h2><span>14h ago</span></article>
    <article><span>$5.75</span><span>Other</span>
      <h2>Increase Repository Stars By 100</h2><span>1d ago</span></article>
    <div><h3>Have something you need done?</h3><a>Post a bounty</a></div>
    <article><span>$230.00</span><span>Content &amp; Media</span>
      <h2>Create Research-Backed Sotant Content Pipeline</h2><span>2d ago</span></article>
    <article><span>$5.75</span><span>AI Automation &amp; Product Building</span>
      <h2>Create Shopify Apparel Product Dataset</h2><span>5d ago</span><span>Completed by Atlas 4</span></article>
  </section>
  <footer><h2>Marketplace</h2></footer>
</body></html>`;

function stubFetch(html = HOME): { fetch: SafeFetch; urls: string[] } {
  const urls: string[] = [];
  const fetch: SafeFetch = {
    json: async <T>(): Promise<T> => {
      throw new Error("json must not be called by TryBounty adapter");
    },
    text: async (url: string) => {
      urls.push(url);
      return { status: 200, url, headers: {}, bytes: Buffer.byteLength(html), text: html };
    },
  };
  return { fetch, urls };
}

function ctx(fetch: SafeFetch): AdapterContext {
  return {
    fetch,
    evidence: new EvidenceCollector("trybounty", CLOCK),
    clock: CLOCK,
    signal: new AbortController().signal,
    config: cfg,
  };
}

test("trybounty: visible text decoding preserves category ampersands", () => {
  const tokens = visibleTextTokens(HOME);
  assert.ok(tokens.includes("Sales & Lead Generation"));
  assert.ok(tokens.includes("AI Automation & Product Building"));
});

test("trybounty: parser starts at Recent Jobs and distinguishes completed cards", () => {
  const cards = parseRecentJobs(HOME);
  assert.equal(cards.length, 4);
  assert.equal(cards[0]?.rewardUsd, "18.40");
  assert.equal(cards[0]?.completed, false);
  assert.equal(cards[2]?.title, "Create Research-Backed Sotant Content Pipeline");
  assert.equal(cards[3]?.completed, true);
  assert.equal(cards[3]?.completedBy, "Atlas 4");
  assert.equal(cards.some((card) => card.rewardUsd === "999"), false, "marketing prices must be ignored");
});

test("trybounty: discover normalizes public cards without claim actionability", async () => {
  const stub = stubFetch();
  const work = await new TryBountyAdapter().discoverWork({}, ctx(stub.fetch));
  assert.equal(work.length, 4);
  const first = work[0];
  assert.equal(first?.source, "trybounty");
  assert.equal(first?.status, "open");
  assert.equal(first?.funding.state, "funded");
  assert.equal(first?.funding.evidence, "observed");
  assert.equal(first?.verification.type, "ai_oracle");
  assert.equal(first?.reward.asset, "USD");
  assert.equal(first?.reward.usd, "18.40");
  assert.equal(first?.actionability.canPrepareClaim, false);
  assert.equal(first?.actionability.canClaim, false);
  assert.equal(first?.actionability.canSubmit, false);

  const completed = work[3];
  assert.equal(completed?.status, "closed");
  assert.equal(completed?.funding.state, "settled");
});

test("trybounty: q and minReward filters are local and deterministic", async () => {
  const stub = stubFetch();
  const adapter = new TryBountyAdapter();
  const research = await adapter.discoverWork({ q: "content", minReward: "20" }, ctx(stub.fetch));
  assert.deepEqual(research.map((item) => item.title), ["Create Research-Backed Sotant Content Pipeline"]);
});

test("trybounty: inspect resolves a discovered stable external id", async () => {
  const stub = stubFetch();
  const adapter = new TryBountyAdapter();
  const work = await adapter.discoverWork({}, ctx(stub.fetch));
  const id = work[1]?.externalId;
  assert.ok(id);
  const result = await adapter.inspect(id, ctx(stub.fetch));
  assert.equal(result.work?.title, "Increase Repository Stars By 100");
  assert.equal(result.platform, "trybounty");
});

test("trybounty: missing Recent Jobs is degraded for health and malformed for discovery", async () => {
  const stub = stubFetch("<html><body>no marketplace section</body></html>");
  const adapter = new TryBountyAdapter();
  assert.equal((await adapter.health(ctx(stub.fetch))).status, "degraded");
  await assert.rejects(() => adapter.discoverWork({}, ctx(stub.fetch)), /Recent Jobs/);
});

test("trybounty: adapter is public GET discovery only", () => {
  const caps = new TryBountyAdapter().capabilities();
  assert.equal(caps.discoverWork, true);
  assert.equal(caps.inspect, true);
  assert.equal(caps.prepareClaim, false);
  assert.equal(caps.liveExecution, false);
  assert.equal(caps.walletless, true);

  const source = readFileSync(new URL("../src/adapters/trybounty/index.ts", import.meta.url), "utf8");
  assert.equal(source.includes('method: "POST"'), false);
  assert.equal(source.includes("Authorization:"), false);
  assert.equal(source.includes("/claim"), false);
  assert.equal(source.includes("/submit"), false);
});
