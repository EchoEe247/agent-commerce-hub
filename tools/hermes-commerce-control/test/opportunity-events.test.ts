import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  normalizeAndPersistEvent,
  type OpportunityEventNormalizer,
} from "../src/opportunities/events.js";
import { canonicalOpportunityId } from "../src/opportunities/models.js";
import { JsonlOpportunityStore } from "../src/opportunities/store.js";

const NOW = "2026-08-27T13:00:00.000Z";

const normalizer: OpportunityEventNormalizer = {
  id: "redditapis_monitor",
  normalize(payload, context) {
    const raw = payload as { id: string; title: string; url: string };
    return [
      {
        id: canonicalOpportunityId({
          source: "redditapis_monitor",
          externalId: raw.id,
          url: raw.url,
        }),
        source: "redditapis_monitor",
        externalId: raw.id,
        title: raw.title,
        url: raw.url,
        observedAt: context.clock(),
        tags: ["reddit"],
        metadata: { delivery: "verified-upstream" },
      },
    ];
  },
};

test("push event seam persists a verified normalized event once", async () => {
  const root = await mkdtemp(join(tmpdir(), "commerce-event-"));
  try {
    const store = new JsonlOpportunityStore(join(root, "opportunities.jsonl"));
    const payload = {
      id: "t3_webhook",
      title: "[Hiring] Remote automation task",
      url: "https://www.reddit.com/r/forhire/comments/webhook/automation/",
    };

    const first = await normalizeAndPersistEvent(normalizer, payload, store, () => NOW);
    assert.equal(first.source, "redditapis_monitor");
    assert.equal(first.normalized, 1);
    assert.equal(first.results.length, 1);
    assert.equal(first.persisted, 1);
    assert.equal(first.duplicatesDropped, 0);
    assert.equal(first.results[0]?.observedAt, NOW);

    const second = await normalizeAndPersistEvent(normalizer, payload, store, () => NOW);
    assert.equal(second.normalized, 1);
    assert.equal(second.results.length, 0);
    assert.equal(second.persisted, 0);
    assert.equal(second.duplicatesDropped, 1);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("push event identity collapses against an RSS-origin listing with the same URL", async () => {
  const root = await mkdtemp(join(tmpdir(), "commerce-event-cross-source-"));
  try {
    const store = new JsonlOpportunityStore(join(root, "opportunities.jsonl"));
    const url = "https://www.reddit.com/r/forhire/comments/same/listing/";
    await store.saveMany([
      {
        id: canonicalOpportunityId({ source: "reddit_rss", externalId: "t3_same", url }),
        source: "reddit_rss",
        externalId: "t3_same",
        title: "RSS copy",
        url,
        observedAt: NOW,
        tags: ["reddit"],
        metadata: {},
      },
    ]);

    const result = await normalizeAndPersistEvent(
      normalizer,
      { id: "provider-specific-id", title: "Webhook copy", url },
      store,
      () => NOW,
    );
    assert.equal(result.results.length, 0);
    assert.equal(result.duplicatesDropped, 1);
    assert.equal(result.persisted, 0);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
