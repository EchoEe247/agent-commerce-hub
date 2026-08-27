import test from "node:test";
import assert from "node:assert/strict";
import { loadConfig, SECRET_ENV_DENYLIST } from "../src/config.js";

test("config: defaults to Mode A with both activation gates false", () => {
  const cfg = loadConfig({});
  assert.equal(cfg.mode, "A");
  assert.equal(cfg.externalWritesEnabled, false);
  assert.equal(cfg.liveValueMovementEnabled, false);
});

test("config: enabling either activation gate fails closed in Mode A", () => {
  assert.throws(() => loadConfig({ EXTERNAL_WRITES_ENABLED: "true" }), /Mode A/);
  assert.throws(() => loadConfig({ LIVE_VALUE_MOVEMENT_ENABLED: "true" }), /Mode A/);
  // Any truthy spelling must be rejected, not just the lowercase one.
  for (const v of ["TRUE", "True", "1", "yes", "YES", "on", "enabled"]) {
    assert.throws(
      () => loadConfig({ EXTERNAL_WRITES_ENABLED: v }),
      /Mode A/,
      `expected rejection for EXTERNAL_WRITES_ENABLED=${v}`,
    );
    assert.throws(
      () => loadConfig({ LIVE_VALUE_MOVEMENT_ENABLED: v }),
      /Mode A/,
      `expected rejection for LIVE_VALUE_MOVEMENT_ENABLED=${v}`,
    );
  }
});

test("config: explicitly false gates are accepted", () => {
  const cfg = loadConfig({
    EXTERNAL_WRITES_ENABLED: "false",
    LIVE_VALUE_MOVEMENT_ENABLED: "0",
  });
  assert.equal(cfg.externalWritesEnabled, false);
  assert.equal(cfg.liveValueMovementEnabled, false);
});

test("config: a mode other than A is rejected", () => {
  assert.throws(() => loadConfig({ COMMERCE_MODE: "B" }), /Mode A/);
  assert.throws(() => loadConfig({ COMMERCE_MODE: "B1" }), /Mode A/);
  assert.doesNotThrow(() => loadConfig({ COMMERCE_MODE: "A" }));
});

test("config: absence of a gate never means enabled", () => {
  const cfg = loadConfig({ SOME_UNRELATED: "x" });
  assert.equal(cfg.externalWritesEnabled, false);
  assert.equal(cfg.liveValueMovementEnabled, false);
});

test("config: network bounds match the approved defaults", () => {
  const cfg = loadConfig({});
  assert.equal(cfg.network.connectTimeoutMs, 5_000);
  assert.equal(cfg.network.requestTimeoutMs, 15_000);
  assert.equal(cfg.network.adapterBudgetMs, 30_000);
  assert.equal(cfg.network.maxRetries, 2);
  assert.equal(cfg.network.maxRedirects, 5);
  assert.equal(cfg.network.maxResponseBytes, 5 * 1024 * 1024);
  assert.equal(cfg.concurrency, 3);
});

test("config: state and repo roots are absolute", () => {
  const cfg = loadConfig({});
  assert.ok(cfg.stateRoot.startsWith("/"), `stateRoot not absolute: ${cfg.stateRoot}`);
  assert.ok(cfg.repoRoot.startsWith("/"), `repoRoot not absolute: ${cfg.repoRoot}`);
  assert.match(cfg.stateRoot, /\.hermes\/commerce-control$/);
  assert.ok(cfg.databasePath.startsWith(cfg.stateRoot));
});

test("config: every platform has an enable flag defaulting to true", () => {
  const cfg = loadConfig({});
  for (const p of [
    "cdp_bazaar",
    "agent402",
    "piprail",
    "agent_bounties",
    "bountybook",
    "trybounty",
    "the402",
    "paysh",
  ] as const) {
    assert.equal(cfg.adapters[p].enabled, true, `${p} should default enabled`);
    assert.ok(cfg.adapters[p].baseUrl.startsWith("https://"), `${p} baseUrl must be https`);
  }
});

test("config: an adapter can be disabled by environment", () => {
  const cfg = loadConfig({ COMMERCE_DISABLE_THE402: "true" });
  assert.equal(cfg.adapters.the402.enabled, false);
  assert.equal(cfg.adapters.cdp_bazaar.enabled, true);
});

test("config: the config object carries no secret-valued field", () => {
  const cfg = loadConfig({
    // Even if the environment is polluted, none of this may land in config.
    PRIVATE_KEY: "0xdeadbeef",
    MNEMONIC: "test test test test test test test test test test test junk",
    NWC_URL: "nostr+walletconnect://abc",
    OPENAI_API_KEY: "sk-should-not-appear",
    PIPRAIL_PRIVATE_KEY: "0xabc",
  });
  const serialized = JSON.stringify(cfg);
  for (const forbidden of ["0xdeadbeef", "junk", "nostr+walletconnect", "sk-should-not-appear", "0xabc"]) {
    assert.equal(
      serialized.includes(forbidden),
      false,
      `config leaked ${forbidden}`,
    );
  }
});

test("config: the secret env denylist covers the forbidden classes", () => {
  const joined = SECRET_ENV_DENYLIST.join("|").toLowerCase();
  for (const needle of ["private_key", "mnemonic", "seed", "nwc", "secret", "token", "api_key"]) {
    assert.ok(joined.includes(needle), `denylist missing ${needle}`);
  }
});

test("config: config is deeply frozen so callers cannot flip a gate at runtime", () => {
  const cfg = loadConfig({});
  assert.equal(Object.isFrozen(cfg), true);
  assert.equal(Object.isFrozen(cfg.network), true);
  assert.equal(Object.isFrozen(cfg.adapters), true);
  assert.throws(() => {
    (cfg as unknown as { externalWritesEnabled: boolean }).externalWritesEnabled = true;
  });
});
