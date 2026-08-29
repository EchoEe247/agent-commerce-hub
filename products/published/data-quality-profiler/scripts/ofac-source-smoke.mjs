import assert from "node:assert/strict";
import { createEntitySanctionsScreen } from "../src/entity-sanctions-screen.mjs";

const startedAt = Date.now();
const screen = createEntitySanctionsScreen();
const result = await screen({ name: "HERMES COMMERCE SOURCE HEALTH PROBE" });

assert.equal(result.schema_version, "1.0");
assert.equal(result.source.provider, "OFAC");
assert.equal(result.source.list, "SDN");
assert.equal(result.source.files.length, 3);
assert.match(result.source.files[0], /SDN\.CSV$/);
assert.match(result.source.files[1], /ALT\.CSV$/);
assert.match(result.source.files[2], /ADD\.CSV$/);
assert.ok(result.source.fetched_at);
assert.ok(Array.isArray(result.candidates));
assert.ok(result.warnings.some((warning) => /not a legal compliance determination/i.test(warning)));

console.log(JSON.stringify({
  smoke: "OFAC_SOURCE_OK",
  provider: result.source.provider,
  list: result.source.list,
  fetched_at: result.source.fetched_at,
  last_modified: result.source.last_modified,
  elapsed_ms: Date.now() - startedAt,
}));
