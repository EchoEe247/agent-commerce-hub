import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { loadConfig } from "../src/config.js";
import {
  AgentBountiesAdapter,
  mapFundingState,
  mapStatus,
  mapVerifier,
  normalizeBounty,
  PAYMENT_PROOF_RULE,
} from "../src/adapters/agent-bounties/index.js";
import { EvidenceCollector } from "../src/evidence/capture.js";
import { CommerceError } from "../src/core/errors.js";
import type { AdapterContext } from "../src/adapters/interface.js";
import type { SafeFetch } from "../src/network/safe-fetch.js";
import {
  EMPTY_SUMMARY,
  INVENTORY_SUMMARY,
  LEADERBOARD_CLAIM,
  LIFECYCLE_SUMMARY,
  MALFORMED_SUMMARY,
} from "./fixtures/agent-bounties/responses.js";

const cfg = loadConfig({});
const CLOCK = (): string => "2026-08-19T00:00:00.000Z";

function stubFetch(responder: (url: string) => unknown): { fetch: SafeFetch; urls: string[] } {
  const urls: string[] = [];
  const fetch: SafeFetch = {
    json: async <T>(url: string): Promise<T> => {
      urls.push(url);
      const r = responder(url);
      if (r instanceof Error) throw r;
      return r as T;
    },
    text: async (url: string) => {
      urls.push(url);
      return { status: 200, url, headers: {}, bytes: 0, text: JSON.stringify(responder(url)) };
    },
  };
  return { fetch, urls };
}

function ctx(fetch: SafeFetch): AdapterContext {
  return {
    fetch,
    evidence: new EvidenceCollector("agent_bounties", CLOCK),
    clock: CLOCK,
    signal: new AbortController().signal,
    config: cfg,
  };
}

test("agent-bounties: normalizes a claimable bounty with exact atomic reward", async () => {
  const stub = stubFetch(() => INVENTORY_SUMMARY);
  const adapter = new AgentBountiesAdapter(cfg.adapters.agent_bounties.baseUrl);
  const work = await adapter.discoverWork({}, ctx(stub.fetch));

  assert.equal(work.length, 2);
  const first = work[0];
  assert.equal(first?.kind, "work");
  assert.equal(first?.source, "agent_bounties");
  // 1000000 atomic USDC at 6 decimals is exactly 1.
  assert.equal(first?.reward.amount, "1");
  assert.equal(first?.reward.asset, "USDC");
  assert.equal(first?.reward.usd, "1");
  assert.equal(first?.reward.network, "base-mainnet");
  assert.equal(first?.status, "open");
  assert.equal(first?.funding.state, "funded");
  assert.equal(first?.verification.type, "deterministic");
  assert.equal(first?.actionability.canClaim, false);
  assert.equal(first?.actionability.canSubmit, false);
  assert.equal(first?.actionability.canPrepareClaim, true);
  assert.match(String(first?.paymentProofRule), /BountySettled/);
});

test("agent-bounties: uses the non-streaming inventory snapshot, not the SSE stream", async () => {
  const stub = stubFetch(() => INVENTORY_SUMMARY);
  const adapter = new AgentBountiesAdapter(cfg.adapters.agent_bounties.baseUrl);
  await adapter.discoverWork({}, ctx(stub.fetch));
  assert.equal(stub.urls.length, 1);
  assert.match(stub.urls[0] ?? "", /inventory-summary/);
  for (const url of stub.urls) {
    assert.equal(url.includes("/stream"), false, "must not open the SSE stream");
  }
});

test("agent-bounties: advertised, funded, claimed, submitted, settled and refunded are distinct", async () => {
  const stub = stubFetch(() => LIFECYCLE_SUMMARY);
  const adapter = new AgentBountiesAdapter(cfg.adapters.agent_bounties.baseUrl);
  const work = await adapter.discoverWork({}, ctx(stub.fetch));
  const byId = new Map(work.map((w) => [w.externalId, w]));

  assert.equal(byId.get("0xadvertised")?.funding.state, "advertised");
  assert.equal(byId.get("0xfunded")?.funding.state, "funded");
  assert.equal(byId.get("0xclaimed")?.funding.state, "claimed");
  assert.equal(byId.get("0xsubmitted")?.funding.state, "submitted");
  assert.equal(byId.get("0xsettled")?.funding.state, "settled");
  assert.equal(byId.get("0xrefunded")?.funding.state, "refunded");

  // Work status is a separate axis from funding.
  assert.equal(byId.get("0xadvertised")?.status, "open");
  assert.equal(byId.get("0xsubmitted")?.status, "in_review");
  assert.equal(byId.get("0xsettled")?.status, "closed");

  // Only genuinely open AND funded work is claim-preparable.
  assert.equal(byId.get("0xfunded")?.actionability.canPrepareClaim, true);
  assert.equal(byId.get("0xadvertised")?.actionability.canPrepareClaim, false);
  assert.equal(byId.get("0xclaimed")?.actionability.canPrepareClaim, false);
});

test("agent-bounties: funding evidence never reaches verified without a settled event", async () => {
  const stub = stubFetch(() => LIFECYCLE_SUMMARY);
  const adapter = new AgentBountiesAdapter(cfg.adapters.agent_bounties.baseUrl);
  const work = await adapter.discoverWork({}, ctx(stub.fetch));
  for (const w of work) {
    assert.notEqual(
      w.funding.evidence,
      "verified",
      `${w.externalId} must not claim verified funding`,
    );
    assert.equal(w.funding.evidence, "observed");
  }
});

test("agent-bounties: a leaderboard/paid flag cannot self-certify payment", async () => {
  const stub = stubFetch(() => LEADERBOARD_CLAIM);
  const adapter = new AgentBountiesAdapter(cfg.adapters.agent_bounties.baseUrl);
  const work = await adapter.discoverWork({}, ctx(stub.fetch));
  assert.equal(work.length, 1);
  // status says settled and paid:true is present, but evidence stays observed.
  assert.equal(work[0]?.funding.state, "settled");
  assert.equal(work[0]?.funding.evidence, "observed");
});

test("agent-bounties: zero open work is healthy, not a failure", async () => {
  const stub = stubFetch(() => EMPTY_SUMMARY);
  const adapter = new AgentBountiesAdapter(cfg.adapters.agent_bounties.baseUrl);
  assert.deepEqual(await adapter.discoverWork({}, ctx(stub.fetch)), []);
  const probe = await adapter.health(ctx(stub.fetch));
  assert.equal(probe.status, "ok");
  assert.match(String(probe.detail), /0 claimable/);
});

test("agent-bounties: verifier classification is deterministic only when verification_ready", () => {
  assert.equal(mapVerifier(true).type, "deterministic");
  assert.equal(mapVerifier(false).type, "unknown");
  assert.equal(mapVerifier(undefined).type, "unknown");
  assert.equal(mapVerifier("true").type, "unknown", "a string must not satisfy the flag");
});

test("agent-bounties: verifier type is recorded as inferred, not observed", async () => {
  const stub = stubFetch(() => INVENTORY_SUMMARY);
  const adapter = new AgentBountiesAdapter(cfg.adapters.agent_bounties.baseUrl);
  const work = await adapter.discoverWork({}, ctx(stub.fetch));
  const verifierEvidence = work[0]?.evidence.find((e) => e.fact === "verifier_type");
  assert.equal(verifierEvidence?.classification, "inferred");
  const ruleEvidence = work[0]?.evidence.find((e) => e.fact === "payment_proof_rule");
  assert.equal(ruleEvidence?.classification, "inferred");
});

test("agent-bounties: status and funding mappers are total", () => {
  assert.equal(mapStatus("claimable"), "open");
  assert.equal(mapStatus("SETTLED"), "closed");
  assert.equal(mapStatus("nonsense"), "unknown");
  assert.equal(mapStatus(undefined), "unknown");
  assert.equal(mapFundingState("open", "0"), "advertised");
  assert.equal(mapFundingState("open", "1100000"), "funded");
  assert.equal(mapFundingState("refunded", "0"), "refunded");
  assert.equal(mapFundingState("weird", undefined), "unknown");
});

test("agent-bounties: a bounty with no usable reward is dropped, not guessed", async () => {
  const stub = stubFetch(() => ({
    ...INVENTORY_SUMMARY,
    items: [{ bounty_id: "0xnoreward", title: "No reward", status: "claimable" }],
  }));
  const adapter = new AgentBountiesAdapter(cfg.adapters.agent_bounties.baseUrl);
  const work = await adapter.discoverWork({}, ctx(stub.fetch));
  assert.deepEqual(work, []);
});

test("agent-bounties: a malformed payload raises UPSTREAM_MALFORMED", async () => {
  const stub = stubFetch(() => MALFORMED_SUMMARY);
  const adapter = new AgentBountiesAdapter(cfg.adapters.agent_bounties.baseUrl);
  await assert.rejects(() => adapter.discoverWork({}, ctx(stub.fetch)), /UPSTREAM_MALFORMED/);
});

test("agent-bounties: timeout, 429 and 5xx propagate as typed errors", async () => {
  const adapter = new AgentBountiesAdapter(cfg.adapters.agent_bounties.baseUrl);
  for (const code of ["UPSTREAM_TIMEOUT", "UPSTREAM_RATE_LIMITED", "UPSTREAM_UNAVAILABLE"] as const) {
    const stub = stubFetch(() => new CommerceError(code, "boom"));
    await assert.rejects(() => adapter.discoverWork({}, ctx(stub.fetch)), new RegExp(code));
    const probe = await adapter.health(ctx(stub.fetch));
    assert.equal(probe.status, "unreachable");
  }
});

test("agent-bounties: prepareClaim broadcasts nothing and states the block", async () => {
  const stub = stubFetch(() => INVENTORY_SUMMARY);
  const adapter = new AgentBountiesAdapter(cfg.adapters.agent_bounties.baseUrl);
  const draft = await adapter.prepareClaim(
    "0x51408b922225594472fd1a55798209f813554c58714e7ad442177181697eba69",
    ctx(stub.fetch),
  );
  assert.equal(draft.claimBroadcast, false);
  assert.equal(draft.submissionBroadcast, false);
  assert.equal(draft.signerPresent, false);
  assert.equal(draft.blockedReason, "EXTERNAL_WRITE_DISABLED");
  assert.ok(Array.isArray(draft.externalStepsRequired));
  assert.match(String(draft.paymentProofRule), /BountySettled/);
  // Only the read endpoint was contacted.
  for (const url of stub.urls) {
    assert.match(url, /inventory-summary/, `unexpected request to ${url}`);
  }
});

test("agent-bounties: the adapter never calls a claim, submission or plan endpoint", () => {
  const source = readFileSync(
    new URL("../src/adapters/agent-bounties/index.ts", import.meta.url),
    "utf8",
  );
  // No POST at all, and none of the mutating paths as request targets.
  assert.equal(source.includes('method: "POST"'), false);
  for (const forbidden of [
    "/claims",
    "/claim-plan",
    "/submission-plan",
    "/submission-evidence",
    "/creation-plan",
    "/timeout-relay",
    "/module-settlement-plan",
  ]) {
    assert.equal(
      source.includes(`"${forbidden}`) || source.includes(`'${forbidden}`),
      false,
      `source must not target ${forbidden}`,
    );
  }
});

test("agent-bounties: the payment proof rule is exported and non-empty", () => {
  assert.match(PAYMENT_PROOF_RULE, /BountySettled/);
  assert.ok(PAYMENT_PROOF_RULE.length > 40);
});

test("agent-bounties: capabilities never advertise live execution or claiming", () => {
  const caps = new AgentBountiesAdapter(cfg.adapters.agent_bounties.baseUrl).capabilities();
  assert.equal(caps.liveExecution, false);
  assert.equal(caps.discoverWork, true);
  assert.equal(caps.prepareClaim, true);
  assert.equal(caps.walletless, true);
});
